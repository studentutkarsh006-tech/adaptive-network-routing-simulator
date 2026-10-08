#ifndef SIMULATION_H
#define SIMULATION_H

#include <vector>
#include <string>

#include "Network.h"
#include "Packet.h"
#include "RoutingStrategy.h"

using namespace std;

class Simulation
{
private:
    Network network;

    BFSStrategy bfs;
    DijkstraStrategy dijkstra;
    AdaptiveStrategy adaptive;

    vector<Packet> packets;

    int totalPackets;
    int deliveredPackets;
    int lostPackets;
    int nextPacketId;

public:
    Simulation();

    void createNetwork();
    void displayNetwork();

    void sendPacket(
        int source,
        int destination,
        int priority
    );

    void failLink(int router1, int router2);
    void repairLink(int router1, int router2);

    void failRouter(int router);
    void repairRouter(int router);

    void compareAlgorithms(
        int source,
        int destination
    );

    void showStatistics();
    void checkNetwork();

    void saveDetailsToFile(const string& filename);
    void loadNetworkFromFile(const string& filename);
};

#endif