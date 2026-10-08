#include "RoutingStrategy.h"
#include "Network.h"
#include "NetworkException.h"

using namespace std;

vector<int> BFSStrategy::findRoute(
    Network& network,
    int source,
    int destination
)
{
    return network.BFS(source, destination);
}

string BFSStrategy::getName()
{
    return "BFS";
}

vector<int> DijkstraStrategy::findRoute(
    Network& network,
    int source,
    int destination
)
{
    return network.Dijkstra(source, destination);
}

string DijkstraStrategy::getName()
{
    return "Dijkstra";
}

vector<int> AdaptiveStrategy::findRoute(
    Network& network,
    int source,
    int destination
)
{
    network.validateRouter(source);
    network.validateRouter(destination);

    try
    {
        return network.Dijkstra(source, destination);
    }
    catch (DestinationUnreachableException&)
    {
        return network.BFS(source, destination);
    }
}

string AdaptiveStrategy::getName()
{
    return "Adaptive Routing";
}