
#ifndef NETWORK_HPP
#define NETWORK_HPP

#include <iostream>
#include <map>
#include <vector>
#include <string>

#include "Router.hpp"
#include "Link.hpp"
#include "Packet.hpp"
#include "NetworkException.hpp"

using namespace std;

class Network {
private:
    vector<Router> routers;
    vector<Link> links;
    map<int, vector<pair<int, int>>> graph;

    void rebuildGraph();

public:
    Network();

    void initializeDefaultNetwork();
    void initializeTopology(int routerCount);

    const vector<Router>& getRouters() const;
    const vector<Link>& getLinks() const;

    Router* findRouter(int id);
    const Router* findRouter(int id) const;

    void displayNetwork() const;

    void failRouter(int id);
    void repairRouter(int id);

    void failLink(int source, int destination);
    void repairLink(int source, int destination);

    vector<pair<int, int>> getNeighbors(int id) const;

    bool isRouterActive(int id) const;
    bool isConnected(int source, int destination) const;

    void queuePacket(int routerId, const Packet& packet);

    vector<Packet> getPendingPackets() const;
    vector<Packet> collectPendingPackets();

    void saveNetwork(ostream& out) const;
    void loadNetwork(istream& in);
};

#endif
