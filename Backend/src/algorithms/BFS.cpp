
#include "algorithms/BFS.hpp"

#include <map>
#include <queue>
#include <set>
#include <vector>

using namespace std;

string BFSStrategy::getName() const
{
    return "BFS";
}

vector<int> BFSStrategy::findRoute(
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

    queue<int> q;
    set<int> visited;
    map<int, int> parent;

    q.push(source);
    visited.insert(source);

    while (!q.empty())
    {
        int current = q.front();
        q.pop();

        if (current == destination)
            break;

        for (const auto& edge : network.getNeighbors(current))
        {
            int next = edge.first;

            if (!visited.count(next))
            {
                visited.insert(next);
                parent[next] = current;
                q.push(next);
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
