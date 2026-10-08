#include <iostream>
#include <queue>
#include <stack>
#include <map>
#include <limits>
#include <algorithm>

#include "Network.h"

using namespace std;

void Network::addRouter(int id, const string& name)
{
    if (findRouter(id) != nullptr)
        return;

    routers.push_back(Router(id, name));
    graph[id] = vector<pair<int, int>>();
}

void Network::addLink(int router1, int router2, int cost)
{
    validateRouter(router1);
    validateRouter(router2);

    if (router1 == router2)
        return;

    if (findLink(router1, router2) != nullptr)
        return;

    if (cost <= 0)
        cost = 1;

    links.push_back(Link(router1, router2, cost));

    graph[router1].push_back({router2, cost});
    graph[router2].push_back({router1, cost});
}

Router* Network::findRouter(int id)
{
    for (Router& router : routers)
    {
        if (router.getId() == id)
            return &router;
    }

    return nullptr;
}

Link* Network::findLink(int router1, int router2)
{
    for (Link& link : links)
    {
        if ((link.getRouter1() == router1 &&
             link.getRouter2() == router2) ||
            (link.getRouter1() == router2 &&
             link.getRouter2() == router1))
        {
            return &link;
        }
    }

    return nullptr;
}

void Network::validateRouter(int id)
{
    if (findRouter(id) == nullptr)
        throw RouterNotFoundException();
}

void Network::validateLink(int router1, int router2)
{
    validateRouter(router1);
    validateRouter(router2);

    if (findLink(router1, router2) == nullptr)
        throw LinkNotFoundException();
}

vector<int> Network::BFS(int source, int destination)
{
    validateRouter(source);
    validateRouter(destination);

    Router* sourceRouter = findRouter(source);
    Router* destinationRouter = findRouter(destination);

    if (!sourceRouter->isActive() ||
        !destinationRouter->isActive())
    {
        throw DestinationUnreachableException();
    }

    queue<int> q;

    map<int, bool> visited;
    map<int, int> parent;

    for (const Router& router : routers)
    {
        visited[router.getId()] = false;
        parent[router.getId()] = -1;
    }

    q.push(source);
    visited[source] = true;

    while (!q.empty())
    {
        int current = q.front();
        q.pop();

        if (current == destination)
            break;

        for (const auto& neighbor : graph[current])
        {
            int nextRouter = neighbor.first;

            Link* link = findLink(current, nextRouter);
            Router* router = findRouter(nextRouter);

            if (link == nullptr ||
                router == nullptr ||
                !link->isActive() ||
                !router->isActive())
            {
                continue;
            }

            if (!visited[nextRouter])
            {
                visited[nextRouter] = true;
                parent[nextRouter] = current;
                q.push(nextRouter);
            }
        }
    }

    if (!visited[destination])
        throw DestinationUnreachableException();

    vector<int> path;

    int current = destination;

    while (current != -1)
    {
        path.push_back(current);
        current = parent[current];
    }

    reverse(path.begin(), path.end());

    return path;
}

vector<int> Network::DFS(int source, int destination)
{
    validateRouter(source);
    validateRouter(destination);

    Router* sourceRouter = findRouter(source);
    Router* destinationRouter = findRouter(destination);

    if (!sourceRouter->isActive() ||
        !destinationRouter->isActive())
    {
        throw DestinationUnreachableException();
    }

    stack<int> s;

    map<int, bool> visited;
    map<int, int> parent;

    for (const Router& router : routers)
    {
        visited[router.getId()] = false;
        parent[router.getId()] = -1;
    }

    s.push(source);
    visited[source] = true;

    while (!s.empty())
    {
        int current = s.top();
        s.pop();

        if (current == destination)
            break;

        for (auto it = graph[current].rbegin();
             it != graph[current].rend();
             ++it)
        {
            int nextRouter = it->first;

            Link* link = findLink(current, nextRouter);
            Router* router = findRouter(nextRouter);

            if (link == nullptr ||
                router == nullptr ||
                !link->isActive() ||
                !router->isActive())
            {
                continue;
            }

            if (!visited[nextRouter])
            {
                visited[nextRouter] = true;
                parent[nextRouter] = current;
                s.push(nextRouter);
            }
        }
    }

    if (!visited[destination])
        throw DestinationUnreachableException();

    vector<int> path;

    int current = destination;

    while (current != -1)
    {
        path.push_back(current);
        current = parent[current];
    }

    reverse(path.begin(), path.end());

    return path;
}

vector<int> Network::Dijkstra(int source, int destination)
{
    validateRouter(source);
    validateRouter(destination);

    Router* sourceRouter = findRouter(source);
    Router* destinationRouter = findRouter(destination);

    if (!sourceRouter->isActive() ||
        !destinationRouter->isActive())
    {
        throw DestinationUnreachableException();
    }

    const int INF = numeric_limits<int>::max();

    map<int, int> distance;
    map<int, int> parent;
    map<int, bool> visited;

    for (const Router& router : routers)
    {
        int id = router.getId();

        distance[id] = INF;
        parent[id] = -1;
        visited[id] = false;
    }

    distance[source] = 0;

    for (size_t count = 0; count < routers.size(); count++)
    {
        int current = -1;
        int bestDistance = INF;

        for (const Router& router : routers)
        {
            int id = router.getId();

            if (!visited[id] &&
                router.isActive() &&
                distance[id] < bestDistance)
            {
                bestDistance = distance[id];
                current = id;
            }
        }

        if (current == -1)
            break;

        visited[current] = true;

        for (const auto& neighbor : graph[current])
        {
            int nextRouter = neighbor.first;
            int cost = neighbor.second;

            Link* link = findLink(current, nextRouter);
            Router* router = findRouter(nextRouter);

            if (link == nullptr ||
                router == nullptr ||
                !link->isActive() ||
                !router->isActive())
            {
                continue;
            }

            if (distance[current] != INF &&
                distance[current] + cost < distance[nextRouter])
            {
                distance[nextRouter] =
                    distance[current] + cost;

                parent[nextRouter] = current;
            }
        }
    }

    if (distance[destination] == INF)
        throw DestinationUnreachableException();

    vector<int> path;

    int current = destination;

    while (current != -1)
    {
        path.push_back(current);
        current = parent[current];
    }

    reverse(path.begin(), path.end());

    return path;
}

bool Network::isConnected()
{
    int start = -1;

    for (const Router& router : routers)
    {
        if (router.isActive())
        {
            start = router.getId();
            break;
        }
    }

    if (start == -1)
        return false;

    queue<int> q;
    map<int, bool> visited;

    for (const Router& router : routers)
    {
        visited[router.getId()] = false;
    }

    q.push(start);
    visited[start] = true;

    while (!q.empty())
    {
        int current = q.front();
        q.pop();

        for (const auto& neighbor : graph[current])
        {
            int nextRouter = neighbor.first;

            Link* link = findLink(current, nextRouter);
            Router* router = findRouter(nextRouter);

            if (link == nullptr ||
                router == nullptr ||
                !link->isActive() ||
                !router->isActive())
            {
                continue;
            }

            if (!visited[nextRouter])
            {
                visited[nextRouter] = true;
                q.push(nextRouter);
            }
        }
    }

    for (const Router& router : routers)
    {
        if (router.isActive() &&
            !visited[router.getId()])
        {
            return false;
        }
    }

    return true;
}

void Network::failRouter(int id)
{
    validateRouter(id);

    Router* router = findRouter(id);
    router->setActive(false);
}

void Network::repairRouter(int id)
{
    validateRouter(id);

    Router* router = findRouter(id);
    router->setActive(true);
}

void Network::failLink(int router1, int router2)
{
    validateLink(router1, router2);

    Link* link = findLink(router1, router2);
    link->fail();
}

void Network::repairLink(int router1, int router2)
{
    validateLink(router1, router2);

    Link* link = findLink(router1, router2);
    link->repair();
}

void Network::displayNetwork()
{
    cout << "\n============================================\n";
    cout << "              ROUTERS\n";
    cout << "============================================\n";

    for (const Router& router : routers)
    {
        router.display();
    }

    cout << "\n============================================\n";
    cout << "               LINKS\n";
    cout << "============================================\n";

    for (const Link& link : links)
    {
        link.display();
    }
}

void Network::saveNetworkToFile(ostream& out)
{
    out << "ROUTERS\n";
    out << routers.size() << "\n";

    for (const Router& router : routers)
    {
        out << router.getId() << " "
            << router.getName() << " "
            << router.isActive() << "\n";
    }

    out << "LINKS\n";
    out << links.size() << "\n";

    for (const Link& link : links)
    {
        out << link.getRouter1() << " "
            << link.getRouter2() << " "
            << link.getCost() << " "
            << link.isActive() << "\n";
    }
}

void Network::loadNetworkFromFile(istream& in)
{
    routers.clear();
    links.clear();
    graph.clear();

    string section;
    int routerCount;
    int linkCount;

    in >> section;

    if (!in || section != "ROUTERS")
    {
        throw NetworkException(
            "Invalid network file format."
        );
    }

    in >> routerCount;

    for (int i = 0; i < routerCount; i++)
    {
        int id;
        string name;
        bool active;

        in >> id >> name >> active;

        addRouter(id, name);

        Router* router = findRouter(id);

        if (router != nullptr)
            router->setActive(active);
    }

    in >> section;

    if (!in || section != "LINKS")
    {
        throw NetworkException(
            "Invalid network file format."
        );
    }

    in >> linkCount;

    for (int i = 0; i < linkCount; i++)
    {
        int router1;
        int router2;
        int cost;
        bool active;

        in >> router1 >> router2 >> cost >> active;

        addLink(router1, router2, cost);

        Link* link = findLink(router1, router2);

        if (link != nullptr)
        {
            if (active)
                link->repair();
            else
                link->fail();
        }
    }
}