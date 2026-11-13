
#include "algorithms/Adaptive.hpp"
#include "algorithms/BFS.hpp"
#include "algorithms/Dijkstra.hpp"

#include <stdexcept>
#include <vector>

using namespace std;

string AdaptiveStrategy::getName() const
{
    return "Adaptive";
}

vector<int> AdaptiveStrategy::findRoute(
    const Network& network,
    int source,
    int destination
)
{
    // Generate candidate routes using BFS and Dijkstra.
    BFSStrategy bfs;
    DijkstraStrategy dijkstra;

    vector<int> bfsPath;
    vector<int> dijkstraPath;

    // Candidate 1: Minimum-hop route.
    try
    {
        bfsPath = bfs.findRoute(
            network,
            source,
            destination
        );
    }
    catch (const DestinationUnreachableException&)
    {
        // Continue and check the Dijkstra candidate.
    }

    // Candidate 2: Minimum-cost route.
    try
    {
        dijkstraPath = dijkstra.findRoute(
            network,
            source,
            destination
        );
    }
    catch (const DestinationUnreachableException&)
    {
        // Continue with the available candidate, if any.
    }

    // Neither algorithm could find a route.
    if (bfsPath.empty() && dijkstraPath.empty())
    {
        throw DestinationUnreachableException();
    }

    // Only one candidate is available.
    if (bfsPath.empty())
        return dijkstraPath;

    if (dijkstraPath.empty())
        return bfsPath;

    // Calculate the total cost of a candidate route.
    auto calculateCost = [&network](const vector<int>& path)
    {
        int totalCost = 0;

        for (size_t i = 1; i < path.size(); ++i)
        {
            bool found = false;

            for (const auto& edge :
                 network.getNeighbors(path[i - 1]))
            {
                if (edge.first == path[i])
                {
                    totalCost += edge.second;
                    found = true;
                    break;
                }
            }

            if (!found)
            {
                throw runtime_error(
                    "Adaptive route contains an inactive link."
                );
            }
        }

        return totalCost;
    };

    // Calculate candidate route costs.
    int bfsCost = calculateCost(bfsPath);
    int dijkstraCost = calculateCost(dijkstraPath);

    // Calculate number of hops.
    int bfsHops = static_cast<int>(bfsPath.size()) - 1;
    int dijkstraHops = static_cast<int>(dijkstraPath.size()) - 1;

    // Adaptive scoring:
    // Total link cost + 0.25 penalty per hop.
    double bfsScore =
        bfsCost + (0.25 * bfsHops);

    double dijkstraScore =
        dijkstraCost + (0.25 * dijkstraHops);

    // Select the route with the lower score.
    // BFS wins when both scores are equal.
    if (bfsScore <= dijkstraScore)
        return bfsPath;

    return dijkstraPath;
}
