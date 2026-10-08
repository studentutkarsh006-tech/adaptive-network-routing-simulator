#ifndef NETWORK_H
#define NETWORK_H

#include <vector>
#include <map>
#include <string>
#include <utility>
#include <ostream>
#include <istream>

#include "Router.h"
#include "Link.h"
#include "NetworkException.h"

using namespace std;

class Network
{
private:
    vector<Router> routers;
    vector<Link> links;

    map<int, vector<pair<int, int>>> graph;

public:
    void addRouter(int id, const string& name);
    void addLink(int router1, int router2, int cost);

    Router* findRouter(int id);
    Link* findLink(int router1, int router2);

    void validateRouter(int id);
    void validateLink(int router1, int router2);

    vector<int> BFS(int source, int destination);
    vector<int> DFS(int source, int destination);
    vector<int> Dijkstra(int source, int destination);

    bool isConnected();

    void failRouter(int id);
    void repairRouter(int id);

    void failLink(int router1, int router2);
    void repairLink(int router1, int router2);

    void displayNetwork();

    void saveNetworkToFile(ostream& out);
    void loadNetworkFromFile(istream& in);
};

#endif