#ifndef PACKET_H
#define PACKET_H

#include <vector>

using namespace std;

class Packet
{
private:
    int id;
    int source;
    int destination;
    int priority;
    vector<int> route;

public:
    Packet();
    Packet(int id, int source, int destination, int priority);

    int getId() const;
    int getSource() const;
    int getDestination() const;
    int getPriority() const;

    void setRoute(const vector<int>& newRoute);
    vector<int> getRoute() const;

    void display() const;
};

#endif
