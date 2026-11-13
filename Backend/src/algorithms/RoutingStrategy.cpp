
#include "core/RoutingStrategy.hpp"

#include <algorithm>
#include <map>
#include <set>
#include <vector>

using namespace std;

// Reconstruct the route using the parent map.
vector<int> RoutingStrategy::buildPath(
    int source,
    int destination,
    const map<int, int>& parent
)
{
    vector<int> path;

    // Source and destination are the same.
    if (source == destination)
        return {source};

    // Destination was never reached.
    if (!parent.count(destination))
        return path;

    int current = destination;
    set<int> visited;

    while (current != source)
    {
        // Prevent an invalid parent chain from looping forever.
        if (!visited.insert(current).second)
            return {};

        path.push_back(current);

        auto it = parent.find(current);

        if (it == parent.end())
            return {};

        current = it->second;
    }

    path.push_back(source);

    reverse(path.begin(), path.end());

    return path;
}

// Validate source and destination routers.
void RoutingStrategy::validateEndpoints(
    const Network& network,
    int source,
    int destination
)
{
    if (!network.findRouter(source) ||
        !network.findRouter(destination))
    {
        throw RouterNotFoundException();
    }

    if (!network.isRouterActive(source) ||
        !network.isRouterActive(destination))
    {
        throw DestinationUnreachableException();
    }
}
