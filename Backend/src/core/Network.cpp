
#include "Network.hpp"

#include <algorithm>
#include <queue>
#include <set>
#include <stdexcept>
#include <utility>

Network::Network()
{
    initializeDefaultNetwork();
}
void Network::initializeDefaultNetwork()
{
    initializeTopology(8);
}


void Network::initializeTopology(int routerCount) {
    if (routerCount < 4 || routerCount > 12) {
        throw invalid_argument(
            "Router count must be between 4 and 12."
        );
    }

    routers.clear();
    links.clear();

    // Create routers.
    for (int i = 1; i <= routerCount; i++) {
        routers.emplace_back(i, "R" + to_string(i));
    }

    // Exact user-defined undirected topology.
    const pair<int, int> topologyLinks[] = {
        {1, 2},
        {1, 4},
        {2, 3},
        {2, 5},
        {3, 5},
        {3, 6},
        {3, 7},
        {4, 5},
        {4, 8},
        {5, 6},
        {6, 7},
        {6, 9},
        {6, 10},
        {7, 10},
        {8, 9},
        {9, 11},
        {10, 12},
        {11, 12}
    };

    // Add only connections whose routers exist.
    for (const auto& connection : topologyLinks) {
        int source = connection.first;
        int destination = connection.second;

        if (source > routerCount || destination > routerCount) {
            continue;
        }

        int first = min(source, destination);
        int second = max(source, destination);

        int cost = 1 + (
            (first * 7 + second * 3 + first * second) % 9
        );

        links.emplace_back(first, second, cost);
    }

    rebuildGraph();
}

const vector<Router>& Network::getRouters() const
{
    return routers;
}

const vector<Link>& Network::getLinks() const
{
    return links;
}

void Network::rebuildGraph()
{
    graph.clear();

    for (const auto& router : routers)
    {
        graph[router.getId()] = {};
    }

    // Only active links between active routers are routable.
    for (const auto& link : links)
    {
        if (!link.isActive())
            continue;

        const Router* source = findRouter(link.getSource());
        const Router* destination = findRouter(link.getDestination());

        if (!source || !destination)
            continue;

        if (!source->isActive() || !destination->isActive())
            continue;

        graph[link.getSource()].push_back(
            {link.getDestination(), link.getCost()}
        );

        graph[link.getDestination()].push_back(
            {link.getSource(), link.getCost()}
        );
    }

    // Keep neighbor ordering deterministic.
    for (auto& entry : graph)
    {
        sort(
            entry.second.begin(),
            entry.second.end(),
            [](const auto& a, const auto& b)
            {
                return a.first < b.first;
            }
        );
    }
}

Router* Network::findRouter(int id)
{
    for (auto& router : routers)
    {
        if (router.getId() == id)
            return &router;
    }

    return nullptr;
}

const Router* Network::findRouter(int id) const
{
    for (const auto& router : routers)
    {
        if (router.getId() == id)
            return &router;
    }

    return nullptr;
}

void Network::displayNetwork() const
{
    cout << "\n========== NETWORK ==========\n";

    for (const auto& router : routers)
    {
        router.display();
    }

    cout << "\nLinks:\n";

    for (const auto& link : links)
    {
        cout << link.getSource() << " <-> "
             << link.getDestination()
             << " | Cost: " << link.getCost()
             << " | "
             << (link.isActive() ? "Active" : "Failed")
             << '\n';
    }
}

void Network::failRouter(int id)
{
    Router* router = findRouter(id);

    if (!router)
        throw RouterNotFoundException();

    if (!router->isActive())
        throw runtime_error("Router is already failed.");

    router->setActive(false);

    rebuildGraph();
}

void Network::repairRouter(int id)
{
    Router* router = findRouter(id);

    if (!router)
        throw RouterNotFoundException();

    if (router->isActive())
        throw runtime_error("Router is already active.");

    router->setActive(true);

    rebuildGraph();
}

void Network::failLink(int source, int destination)
{
    if (!findRouter(source) || !findRouter(destination))
        throw RouterNotFoundException();

    for (auto& link : links)
    {
        bool matches =
            (link.getSource() == source &&
             link.getDestination() == destination) ||
            (link.getSource() == destination &&
             link.getDestination() == source);

        if (!matches)
            continue;

        if (!link.isActive())
            throw runtime_error("Link is already failed.");

        link.setActive(false);

        rebuildGraph();
        return;
    }

    throw LinkNotFoundException();
}

void Network::repairLink(int source, int destination)
{
    if (!findRouter(source) || !findRouter(destination))
        throw RouterNotFoundException();

    for (auto& link : links)
    {
        bool matches =
            (link.getSource() == source &&
             link.getDestination() == destination) ||
            (link.getSource() == destination &&
             link.getDestination() == source);

        if (!matches)
            continue;

        if (link.isActive())
            throw runtime_error("Link is already active.");

        link.setActive(true);

        rebuildGraph();
        return;
    }

    throw LinkNotFoundException();
}

vector<pair<int, int>> Network::getNeighbors(int id) const
{
    auto it = graph.find(id);

    if (it == graph.end())
        throw RouterNotFoundException();

    return it->second;
}

bool Network::isRouterActive(int id) const
{
    const Router* router = findRouter(id);

    return router && router->isActive();
}

bool Network::isConnected(int source, int destination) const
{
    if (!isRouterActive(source) || !isRouterActive(destination))
        return false;

    queue<int> pending;
    set<int> visited;

    pending.push(source);
    visited.insert(source);

    while (!pending.empty())
    {
        int current = pending.front();
        pending.pop();

        if (current == destination)
            return true;

        for (const auto& neighbor : getNeighbors(current))
        {
            if (visited.insert(neighbor.first).second)
            {
                pending.push(neighbor.first);
            }
        }
    }

    return false;
}

void Network::queuePacket(int routerId, const Packet& packet)
{
    Router* router = findRouter(routerId);

    if (!router)
        throw RouterNotFoundException();

    if (!router->isActive())
    {
        throw runtime_error(
            "Cannot queue a packet at a failed router."
        );
    }

    if (packet.getSource() != routerId)
    {
        throw runtime_error(
            "Packet must be queued at its source router."
        );
    }

    if (!findRouter(packet.getDestination()))
        throw RouterNotFoundException();

    router->addPacket(packet);
}

vector<Packet> Network::getPendingPackets() const
{
    vector<Packet> result;

    for (const auto& router : routers)
    {
        auto packets = router.getQueuedPackets();

        result.insert(
            result.end(),
            packets.begin(),
            packets.end()
        );
    }

    return result;
}

vector<Packet> Network::collectPendingPackets()
{
    vector<Packet> result;

    // Preserve queued packets even if their source router failed
    // after the packets were originally queued.
    for (auto& router : routers)
    {
        auto packets = router.drainPackets();

        result.insert(
            result.end(),
            packets.begin(),
            packets.end()
        );
    }

    return result;
}

void Network::saveNetwork(ostream& out) const
{
    out << routers.size() << '\n';

    for (const auto& router : routers)
    {
        out << router.getId() << ' '
            << router.getName() << ' '
            << router.isActive() << '\n';
    }

    out << links.size() << '\n';

    for (const auto& link : links)
    {
        out << link.getSource() << ' '
            << link.getDestination() << ' '
            << link.getCost() << ' '
            << link.isActive() << '\n';
    }
}

void Network::loadNetwork(istream& in)
{
    vector<Router> newRouters;
    vector<Link> newLinks;

    int routerCount;
    int linkCount;

    if (!(in >> routerCount) ||
        routerCount < 1 ||
        routerCount > 1000)
    {
        throw runtime_error(
            "Invalid router data in save file."
        );
    }

    set<int> routerIds;

    for (int i = 0; i < routerCount; ++i)
    {
        int id;
        int active;
        string name;

        if (!(in >> id >> name >> active) ||
            id <= 0 ||
            (active != 0 && active != 1))
        {
            throw runtime_error("Invalid router entry.");
        }

        if (!routerIds.insert(id).second)
        {
            throw runtime_error(
                "Duplicate router ID in save file."
            );
        }

        Router router(id, name);
        router.setActive(active != 0);

        newRouters.push_back(router);
    }

    if (!(in >> linkCount) ||
        linkCount < 0 ||
        linkCount > 10000)
    {
        throw runtime_error(
            "Invalid link data in save file."
        );
    }

    set<pair<int, int>> loadedLinks;

    for (int i = 0; i < linkCount; ++i)
    {
        int a;
        int b;
        int linkCost;
        int active;

        if (!(in >> a >> b >> linkCost >> active) ||
            a == b ||
            linkCost < 1 ||
            linkCost > 9 ||
            (active != 0 && active != 1))
        {
            throw runtime_error("Invalid link entry.");
        }

        if (!routerIds.count(a) || !routerIds.count(b))
        {
            throw runtime_error(
                "Link refers to an unknown router."
            );
        }

        int first = min(a, b);
        int second = max(a, b);

        if (!loadedLinks.insert({first, second}).second)
        {
            throw runtime_error(
                "Duplicate link in save file."
            );
        }

        Link link(a, b, linkCost);
        link.setActive(active != 0);

        newLinks.push_back(link);
    }

    // Commit only after the complete file has been validated.
    routers = move(newRouters);
    links = move(newLinks);

    rebuildGraph();
}
