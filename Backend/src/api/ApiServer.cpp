
#include "api/ApiServer.hpp"
#include "core/Network.hpp"
#include "core/Packet.hpp"
#include "algorithms/BFS.hpp"
#include "algorithms/DFS.hpp"
#include "algorithms/Dijkstra.hpp"
#include "algorithms/Adaptive.hpp"
#include "services/SimulationManager.hpp"

#include <algorithm>
#include <chrono>
#include <memory>
#include <mutex>
#include <nlohmann/json.hpp>
#include <stdexcept>
#include <string>
#include <vector>

using json = nlohmann::json;

namespace
{
    SimulationManager manager;

    void send(httplib::Response& r, int status, const json& response)
    {
        r.status = status;
        r.set_content(response.dump(), "application/json; charset=utf-8");
    }

    json body(const httplib::Request& q)
    {
        if (q.body.empty())
            throw std::invalid_argument("Request body must be valid JSON.");

        return json::parse(q.body);
    }

    json objectBody(const httplib::Request& q)
    {
        auto value = body(q);

        if (!value.is_object())
            throw std::invalid_argument("Request body must be a JSON object.");

        return value;
    }

    int integer(const json& b, const char* key)
    {
        if (!b.contains(key) || !b[key].is_number_integer())
            throw std::invalid_argument(
                std::string(key) + " must be an integer."
            );

        return b[key].get<int>();
    }

    int optionalInteger(const json& b, const char* key, int fallback)
    {
        return b.contains(key) ? integer(b, key) : fallback;
    }

    std::string stringValue(
        const json& b,
        const char* key,
        const std::string& fallback
    )
    {
        if (!b.contains(key))
            return fallback;

        if (!b[key].is_string())
            throw std::invalid_argument(
                std::string(key) + " must be a string."
            );

        return b[key].get<std::string>();
    }

    int queryInt(
        const httplib::Request& q,
        const char* key,
        int fallback
    )
    {
        if (!q.has_param(key))
            return fallback;

        try
        {
            size_t n = 0;
            auto value = q.get_param_value(key);
            int result = std::stoi(value, &n);

            if (n != value.size())
                throw std::invalid_argument("invalid");

            return result;
        }
        catch (...)
        {
            throw std::invalid_argument(
                std::string(key) + " must be an integer."
            );
        }
    }

    long long timestamp()
    {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
    }

    json topology(const Network& n)
    {
        json routers = json::array();
        json links = json::array();

        int activeRouters = 0;
        int activeLinks = 0;

        for (const auto& r : n.getRouters())
        {
            routers.push_back({
                {"id", r.getId()},
                {"name", r.getName()},
                {"active", r.isActive()}
            });

            if (r.isActive())
                ++activeRouters;
        }

        for (const auto& l : n.getLinks())
        {
            links.push_back({
                {"source", l.getSource()},
                {"destination", l.getDestination()},
                {"cost", l.getCost()},
                {"active", l.isActive()}
            });

            if (l.isActive())
                ++activeLinks;
        }

        return {
            {"name", "NETROUTE default topology"},
            {"routerCount", routers.size()},
            {"activeRouterCount", activeRouters},
            {"failedRouterCount", routers.size() - activeRouters},
            {"linkCount", links.size()},
            {"activeLinkCount", activeLinks},
            {"failedLinkCount", links.size() - activeLinks},
            {"routers", routers},
            {"links", links}
        };
    }

    std::unique_ptr<RoutingStrategy> makeStrategy(const std::string& a)
    {
        if (a == "BFS" || a == "bfs")
            return std::make_unique<BFSStrategy>();

        if (a == "DFS" || a == "dfs")
            return std::make_unique<DFSStrategy>();

        if (a == "Dijkstra" || a == "dijkstra")
            return std::make_unique<DijkstraStrategy>();

        if (a == "Adaptive" || a == "adaptive")
            return std::make_unique<AdaptiveStrategy>();

        throw std::invalid_argument(
            "algorithm must be BFS, DFS, Dijkstra, or Adaptive."
        );
    }

    int cost(const Network& n, const std::vector<int>& path)
    {
        int total = 0;

        for (size_t i = 1; i < path.size(); ++i)
        {
            bool found = false;

            for (const auto& edge : n.getNeighbors(path[i - 1]))
            {
                if (edge.first == path[i])
                {
                    total += edge.second;
                    found = true;
                    break;
                }
            }

            if (!found)
                throw std::runtime_error(
                    "Route contains an inactive link."
                );
        }

        return total;
    }

    json route(
        const Network& n,
        int source,
        int destination,
        const std::string& name
    )
    {
        if (!n.findRouter(source) || !n.findRouter(destination))
            throw std::invalid_argument("Invalid source or destination router.");

        if (!n.isRouterActive(source) || !n.isRouterActive(destination))
            throw std::runtime_error(
                "Source or destination router is currently failed."
            );

        auto strategy = makeStrategy(name);

        auto start = std::chrono::steady_clock::now();

        auto path = strategy->findRoute(n, source, destination);

        double executionTime =
            std::chrono::duration<double, std::milli>(
                std::chrono::steady_clock::now() - start
            ).count();

        int totalCost = cost(n, path);

        return {
            {"algorithm", strategy->getName()},
            {"route", path},
            {"cost", totalCost},
            {"hops", path.empty() ? 0 : path.size() - 1},
            {"executionTimeMs", executionTime},
            {"reachable", true}
        };
    }

    json metrics(const SimulationSession& s)
    {
        const auto& routers = s.network.getRouters();
        const auto& links = s.network.getLinks();

        int activeRouters = 0;
        int activeLinks = 0;

        for (const auto& r : routers)
        {
            if (r.isActive())
                ++activeRouters;
        }

        for (const auto& l : links)
        {
            if (l.isActive())
                ++activeLinks;
        }

        const auto totalCreated = s.packets.size();
        const auto pending = s.network.getPendingPackets().size();

        const int processed = s.delivered + s.lost;

        const double deliveryRate =
            processed == 0
                ? 0.0
                : 100.0 * static_cast<double>(s.delivered) /
                    static_cast<double>(processed);

        double totalCost = 0.0;
        double totalHops = 0.0;
        int deliveredWithRoute = 0;

        for (const auto& packet : s.packets)
        {
            if (packet.value("status", std::string("")) != "delivered")
                continue;

            if (!packet.contains("cost") || !packet.contains("route"))
                continue;

            totalCost += packet["cost"].get<double>();

            const auto& path = packet["route"];

            if (path.is_array() && !path.empty())
                totalHops += static_cast<double>(path.size() - 1);

            ++deliveredWithRoute;
        }

        const double averageCost =
            deliveredWithRoute == 0
                ? 0.0
                : totalCost / deliveredWithRoute;

        const double averageHops =
            deliveredWithRoute == 0
                ? 0.0
                : totalHops / deliveredWithRoute;

        return {
            {"totalRouters", routers.size()},
            {"activeRouters", activeRouters},
            {"failedRouters", routers.size() - activeRouters},

            {"totalLinks", links.size()},
            {"activeLinks", activeLinks},
            {"failedLinks", links.size() - activeLinks},

            {"totalPackets", totalCreated},
            {"pendingPackets", pending},
            {"deliveredPackets", s.delivered},
            {"lostPackets", s.lost},

            {"deliveryRate", deliveryRate},
            {"averageRouteCost", averageCost},
            {"averageHops", averageHops}
        };
    }

    void addEvent(
        SimulationSession& s,
        const std::string& type,
        json detail
    )
    {
        s.events.push_back({
            {"type", type},
            {"detail", detail},
            {"timestamp", timestamp()}
        });
    }

    void cors(httplib::Response& r)
    {
        r.set_header("Access-Control-Allow-Origin", "*");
        r.set_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS"
        );
        r.set_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization"
        );
    }

    bool validPriority(int priority)
    {
        return priority == 1 || priority == 5 || priority == 10;
    }
}

// ------------------------------------------------------------
// API ROUTES
// ------------------------------------------------------------

void configureRoutes(httplib::Server& server)
{
    server.Options(
        R"(.*)",
        [](const httplib::Request&, httplib::Response& r)
        {
            r.status = 204;
            cors(r);
        }
    );

    server.set_post_routing_handler(
        [](const httplib::Request&, httplib::Response& r)
        {
            cors(r);
        }
    );

    // HEALTH

    server.Get(
        "/api/v1/health",
        [](const httplib::Request&, httplib::Response& r)
        {
            send(r, 200, {
                {"success", true},
                {"message", "NETROUTE backend is running"},
                {"service", "NETROUTE API"},
                {"version", "1.0.0"}
            });
        }
    );

    // DEFAULT TOPOLOGY

    server.Get(
        "/api/v1/topologies/default",
        [](const httplib::Request& q, httplib::Response& r)
        {
            try
            {
                Network n;

                int count = queryInt(q, "routers", 8);

                if (count < 4 || count > 15)
                    throw std::invalid_argument(
                        "Router count must be between 4 and 15."
                    );

                n.initializeTopology(count);

                send(r, 200, topology(n));
            }
            catch (const std::exception& e)
            {
                send(r, 400, {{"error", e.what()}});
            }
        }
    );

    // CREATE SIMULATION

    server.Post(
        "/api/v1/simulations",
        [](const httplib::Request& q, httplib::Response& r)
        {
            try
            {
                auto b = objectBody(q);

                int count = b.contains("routerCount")
                    ? integer(b, "routerCount")
                    : 8;

                if (count < 4 || count > 15)
                    throw std::invalid_argument(
                        "routerCount must be between 4 and 15."
                    );

                std::string id;

                auto s = manager.create(count, id);

                std::lock_guard<std::mutex> guard(
                    manager.stateMutex()
                );

                send(r, 201, {
                    {"id", id},
                    {"topology", topology(s->network)},
                    {"metrics", metrics(*s)}
                });
            }
            catch (const std::exception& e)
            {
                send(r, 400, {{"error", e.what()}});
            }
        }
    );

    // GET SIMULATION

    server.Get(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+))",
        [](const httplib::Request& q, httplib::Response& r)
        {
            try
            {
                auto s = manager.find(q.matches[1]);

                std::lock_guard<std::mutex> guard(
                    manager.stateMutex()
                );

                send(r, 200, {
                    {"id", q.matches[1]},
                    {"topology", topology(s->network)},
                    {"metrics", metrics(*s)},
                    {"packets", s->packets},
                    {"events", s->events}
                });
            }
            catch (const std::out_of_range& e)
            {
                send(r, 404, {{"error", e.what()}});
            }
        }
    );

    // RESET SIMULATION

    server.Post(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+)/reset)",
        [](const httplib::Request& q, httplib::Response& r)
        {
            try
            {
                auto s = manager.find(q.matches[1]);

                std::lock_guard<std::mutex> guard(
                    manager.stateMutex()
                );

                s->network.initializeTopology(s->routerCount);
                s->nextPacketId = 1;
                s->delivered = 0;
                s->lost = 0;
                s->packets = json::array();
                s->events = json::array();

                addEvent(
                    *s,
                    "simulation_reset",
                    {{"routerCount", s->routerCount}}
                );

                send(r, 200, {
                    {"id", q.matches[1]},
                    {"reset", true},
                    {"topology", topology(s->network)},
                    {"metrics", metrics(*s)}
                });
            }
            catch (const std::out_of_range& e)
            {
                send(r, 404, {{"error", e.what()}});
            }
            catch (const std::exception& e)
            {
                send(r, 400, {{"error", e.what()}});
            }
        }
    );

    // SINGLE ROUTE

    server.Post(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+)/route)",
        [](const httplib::Request& q, httplib::Response& r)
        {
            try
            {
                auto b = objectBody(q);

                int source = integer(b, "source");
                int destination = integer(b, "destination");

                auto algorithm = stringValue(
                    b,
                    "algorithm",
                    "Dijkstra"
                );

                auto s = manager.find(q.matches[1]);

                std::lock_guard<std::mutex> guard(
                    manager.stateMutex()
                );

                send(
                    r,
                    200,
                    route(
                        s->network,
                        source,
                        destination,
                        algorithm
                    )
                );
            }
            catch (const std::out_of_range& e)
            {
                send(r, 404, {{"error", e.what()}});
            }
            catch (const std::exception& e)
            {
                send(r, 400, {{"error", e.what()}});
            }
        }
    );

    // CREATE PACKETS

    server.Post(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+)/packets)",
        [](const httplib::Request& q, httplib::Response& r)
        {
            try
            {
                auto b = objectBody(q);

                int source = integer(b, "source");
                int destination = integer(b, "destination");

                int priority = optionalInteger(
                    b,
                    "priority",
                    1
                );

                int count = optionalInteger(b, "count", 1);

                if (!validPriority(priority))
                    throw std::invalid_argument(
                        "Priority must be 1 (Normal), 5 (High), or 10 (Critical)."
                    );

                if (count < 1 || count > 100)
                    throw std::invalid_argument(
                        "Packet count must be between 1 and 100."
                    );

                auto s = manager.find(q.matches[1]);

                std::lock_guard<std::mutex> guard(
                    manager.stateMutex()
                );

                if (!s->network.findRouter(source) ||
                    !s->network.findRouter(destination))
                {
                    throw std::invalid_argument(
                        "Source and destination must identify routers in this simulation."
                    );
                }

                if (!s->network.isRouterActive(source) ||
                    !s->network.isRouterActive(destination))
                {
                    throw std::invalid_argument(
                        "Source and destination routers must be active."
                    );
                }

                json made = json::array();

                for (int i = 0; i < count; ++i)
                {
                    Packet p(
                        s->nextPacketId++,
                        source,
                        destination,
                        priority
                    );

                    s->network.queuePacket(source, p);

                    json item = {
                        {"id", p.getId()},
                        {"source", source},
                        {"destination", destination},
                        {"priority", priority},
                        {"status", "pending"},
                        {"delivered", false},
                        {"route", json::array()}
                    };

                    s->packets.push_back(item);
                    made.push_back(item);
                }

                addEvent(
                    *s,
                    "packets_created",
                    {
                        {"count", count},
                        {"source", source},
                        {"destination", destination},
                        {"priority", priority}
                    }
                );

                send(r, 201, {
                    {"packets", made},
                    {"pendingPackets", s->network.getPendingPackets().size()},
                    {"metrics", metrics(*s)}
                });
            }
            catch (const std::out_of_range& e)
            {
                send(r, 404, {{"error", e.what()}});
            }
            catch (const std::exception& e)
            {
                send(r, 400, {{"error", e.what()}});
            }
        }
    );

    // GET PENDING PACKETS

    server.Get(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+)/packets/pending)",
        [](const httplib::Request& q, httplib::Response& r)
        {
            try
            {
                auto s = manager.find(q.matches[1]);

                std::lock_guard<std::mutex> guard(
                    manager.stateMutex()
                );

                json pending = json::array();

                for (const auto& p : s->network.getPendingPackets())
                {
                    pending.push_back({
                        {"id", p.getId()},
                        {"source", p.getSource()},
                        {"destination", p.getDestination()},
                        {"priority", p.getPriority()}
                    });
                }

                send(r, 200, {
                    {"pendingPackets", pending},
                    {"count", pending.size()}
                });
            }
            catch (const std::out_of_range& e)
            {
                send(r, 404, {{"error", e.what()}});
            }
        }
    );

    // GET PACKET HISTORY

    server.Get(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+)/packets)",
        [](const httplib::Request& q, httplib::Response& r)
        {
            try
            {
                auto s = manager.find(q.matches[1]);

                std::lock_guard<std::mutex> guard(
                    manager.stateMutex()
                );

                send(r, 200, {
                    {"packets", s->packets},
                    {"count", s->packets.size()}
                });
            }
            catch (const std::out_of_range& e)
            {
                send(r, 404, {{"error", e.what()}});
            }
        }
    );

    // PROCESS PACKETS USING GLOBAL PRIORITY SCHEDULER

    server.Post(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+)/packets/process)",
        [](const httplib::Request& q, httplib::Response& r)
        {
            try
            {
                auto b = q.body.empty()
                    ? json::object()
                    : objectBody(q);

                auto algorithm = stringValue(
                    b,
                    "algorithm",
                    "Dijkstra"
                );

                makeStrategy(algorithm);

                auto s = manager.find(q.matches[1]);

                std::lock_guard<std::mutex> guard(
                    manager.stateMutex()
                );

                auto pending = s->network.collectPendingPackets();

                // Global priority scheduling:
                // Critical (10) -> High (5) -> Normal (1).
                // Equal priorities are processed by packet ID (FIFO).

                std::stable_sort(
                    pending.begin(),
                    pending.end(),
                    [](const Packet& a, const Packet& b)
                    {
                        if (a.getPriority() != b.getPriority())
                            return a.getPriority() > b.getPriority();

                        return a.getId() < b.getId();
                    }
                );

                json processed = json::array();

                for (auto& p : pending)
                {
                    auto it = std::find_if(
                        s->packets.begin(),
                        s->packets.end(),
                        [&](const json& item)
                        {
                            return item.value("id", -1) == p.getId();
                        }
                    );

                    try
                    {
                        auto result = route(
                            s->network,
                            p.getSource(),
                            p.getDestination(),
                            algorithm
                        );

                        p.setRoute(
                            result["route"].get<std::vector<int>>()
                        );

                        p.setDelivered(true);

                        ++s->delivered;

                        if (it != s->packets.end())
                        {
                            (*it)["status"] = "delivered";
                            (*it)["delivered"] = true;
                            (*it)["route"] = p.getRoute();
                            (*it)["cost"] = result["cost"];
                            (*it)["hops"] = result["hops"];
                            (*it)["algorithm"] = result["algorithm"];

                            processed.push_back(*it);
                        }

                        addEvent(
                            *s,
                            "packet_delivered",
                            {
                                {"packetId", p.getId()},
                                {"source", p.getSource()},
                                {"destination", p.getDestination()},
                                {"priority", p.getPriority()},
                                {"route", p.getRoute()},
                                {"cost", result["cost"]}
                            }
                        );
                    }
                    catch (const std::exception& e)
                    {
                        ++s->lost;

                        if (it != s->packets.end())
                        {
                            (*it)["status"] = "lost";
                            (*it)["delivered"] = false;
                            (*it)["error"] = e.what();

                            processed.push_back(*it);
                        }

                        addEvent(
                            *s,
                            "packet_lost",
                            {
                                {"packetId", p.getId()},
                                {"source", p.getSource()},
                                {"destination", p.getDestination()},
                                {"priority", p.getPriority()},
                                {"reason", e.what()}
                            }
                        );
                    }
                }

                addEvent(
                    *s,
                    "packets_processed",
                    {
                        {"count", pending.size()},
                        {"algorithm", algorithm}
                    }
                );

                send(r, 200, {
                    {"packets", processed},
                    {"processedCount", processed.size()},
                    {"metrics", metrics(*s)}
                });
            }
            catch (const std::out_of_range& e)
            {
                send(r, 404, {{"error", e.what()}});
            }
            catch (const std::exception& e)
            {
                send(r, 400, {{"error", e.what()}});
            }
        }
    );

    // ROUTER AND LINK FAILURE / RECOVERY

    auto failure = [](
        const httplib::Request& q,
        httplib::Response& r,
        bool repair,
        bool isRouter
    )
    {
        try
        {
            auto b = objectBody(q);

            auto s = manager.find(q.matches[1]);

            std::lock_guard<std::mutex> guard(
                manager.stateMutex()
            );

            if (isRouter)
            {
                int id = integer(b, "routerId");

                if (repair)
                    s->network.repairRouter(id);
                else
                    s->network.failRouter(id);

                addEvent(
                    *s,
                    repair ? "router_repaired" : "router_failed",
                    {{"routerId", id}}
                );
            }
            else
            {
                int source = integer(b, "source");
                int destination = integer(b, "destination");

                if (repair)
                    s->network.repairLink(source, destination);
                else
                    s->network.failLink(source, destination);

                addEvent(
                    *s,
                    repair ? "link_repaired" : "link_failed",
                    {
                        {"source", source},
                        {"destination", destination}
                    }
                );
            }

            send(r, 200, {
                {"topology", topology(s->network)},
                {"metrics", metrics(*s)}
            });
        }
        catch (const std::out_of_range& e)
        {
            send(r, 404, {{"error", e.what()}});
        }
        catch (const std::exception& e)
        {
            send(r, 400, {{"error", e.what()}});
        }
    };

    server.Post(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+)/routers/fail)",
        [failure](const auto& q, auto& r)
        {
            failure(q, r, false, true);
        }
    );

    server.Post(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+)/routers/repair)",
        [failure](const auto& q, auto& r)
        {
            failure(q, r, true, true);
        }
    );

    server.Post(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+)/links/fail)",
        [failure](const auto& q, auto& r)
        {
            failure(q, r, false, false);
        }
    );

    server.Post(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+)/links/repair)",
        [failure](const auto& q, auto& r)
        {
            failure(q, r, true, false);
        }
    );

    // GET METRICS

    server.Get(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+)/metrics)",
        [](const auto& q, auto& r)
        {
            try
            {
                auto s = manager.find(q.matches[1]);

                std::lock_guard<std::mutex> guard(
                    manager.stateMutex()
                );

                send(r, 200, metrics(*s));
            }
            catch (const std::out_of_range& e)
            {
                send(r, 404, {{"error", e.what()}});
            }
        }
    );

    // GET EVENT LOG

    server.Get(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+)/events)",
        [](const auto& q, auto& r)
        {
            try
            {
                auto s = manager.find(q.matches[1]);

                std::lock_guard<std::mutex> guard(
                    manager.stateMutex()
                );

                send(r, 200, {
                    {"events", s->events}
                });
            }
            catch (const std::out_of_range& e)
            {
                send(r, 404, {{"error", e.what()}});
            }
        }
    );

    // COMPARE ALL ROUTING ALGORITHMS

    server.Post(
        R"(/api/v1/simulations/([A-Za-z0-9_-]+)/compare)",
        [](const httplib::Request& q, httplib::Response& r)
        {
            try
            {
                auto b = objectBody(q);

                int source = integer(b, "source");
                int destination = integer(b, "destination");

                auto s = manager.find(q.matches[1]);

                std::lock_guard<std::mutex> guard(
                    manager.stateMutex()
                );

                if (!s->network.findRouter(source) ||
                    !s->network.findRouter(destination))
                {
                    throw std::invalid_argument(
                        "Source and destination must identify routers in this simulation."
                    );
                }

                json results = json::array();

                for (const char* name :
                    {"BFS", "DFS", "Dijkstra", "Adaptive"})
                {
                    try
                    {
                        results.push_back(
                            route(
                                s->network,
                                source,
                                destination,
                                name
                            )
                        );
                    }
                    catch (const std::exception& e)
                    {
                        results.push_back({
                            {"algorithm", name},
                            {"reachable", false},
                            {"route", json::array()},
                            {"cost", nullptr},
                            {"hops", nullptr},
                            {"executionTimeMs", nullptr},
                            {"error", e.what()}
                        });
                    }
                }

                addEvent(
                    *s,
                    "algorithm_comparison",
                    {
                        {"source", source},
                        {"destination", destination}
                    }
                );

                send(r, 200, {
                    {"results", results}
                });
            }
            catch (const std::out_of_range& e)
            {
                send(r, 404, {{"error", e.what()}});
            }
            catch (const std::exception& e)
            {
                send(r, 400, {{"error", e.what()}});
            }
        }
    );
}
