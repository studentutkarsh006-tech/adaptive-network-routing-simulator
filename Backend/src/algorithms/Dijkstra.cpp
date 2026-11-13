
#include "algorithms/Dijkstra.hpp"

#include <functional>
#include <limits>
#include <map>
#include <queue>
#include <utility>
#include <vector>

using namespace std;

string DijkstraStrategy::getName() const
{
    return "Dijkstra";
}

vector<int> DijkstraStrategy::findRoute(
    const Network& network,
    int source,
    int destination
)
{
    RoutingStrategy::validateEndpoints(
        network,
        source,
        destination
    );

    const int INF = numeric_limits<int>::max();

    map<int, int> distance;
    map<int, int> parent;

    // Initialize all router distances.
    for (const auto& router : network.getRouters())
    {
        distance[router.getId()] = INF;
    }

    distance[source] = 0;

    using Node = pair<int, int>;

    // Min-priority queue: lowest cost is processed first.
    priority_queue<
        Node,
        vector<Node>,
        greater<Node>
    > pq;

    pq.push({0, source});

    while (!pq.empty())
    {
        auto current = pq.top();
        pq.pop();

        int currentCost = current.first;
        int currentRouter = current.second;

        // Ignore outdated queue entries.
        if (currentCost != distance[currentRouter])
            continue;

        if (currentRouter == destination)
            break;

        for (const auto& edge :
             network.getNeighbors(currentRouter))
        {
            int nextRouter = edge.first;
            int weight = edge.second;

            // Prevent integer overflow.
            if (weight < 0)
                throw runtime_error(
                    "Dijkstra requires non-negative link costs."
                );

            if (currentCost <= INF - weight &&
                currentCost + weight < distance[nextRouter])
            {
                distance[nextRouter] = currentCost + weight;
                parent[nextRouter] = currentRouter;

                pq.push({
                    distance[nextRouter],
                    nextRouter
                });
            }
        }
    }

    vector<int> path = RoutingStrategy::buildPath(
        source,
        destination,
        parent
    );

    if (path.empty())
        throw DestinationUnreachableException();

    return path;
}
