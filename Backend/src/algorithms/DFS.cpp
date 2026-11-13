
#include "algorithms/DFS.hpp"

#include <map>
#include <set>
#include <stack>
#include <vector>

using namespace std;

string DFSStrategy::getName() const
{
    return "DFS";
}

vector<int> DFSStrategy::findRoute(
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

    stack<int> st;
    set<int> visited;
    map<int, int> parent;

    st.push(source);
    visited.insert(source);

    while (!st.empty())
    {
        int current = st.top();
        st.pop();

        if (current == destination)
            break;

        auto neighbors = network.getNeighbors(current);

        // Reverse traversal preserves deterministic DFS order.
        for (auto it = neighbors.rbegin();
             it != neighbors.rend(); ++it)
        {
            int next = it->first;

            if (!visited.count(next))
            {
                visited.insert(next);
                parent[next] = current;
                st.push(next);
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
