#ifndef ROUTER_H
#define ROUTER_H

#include <string>
#include <queue>

using namespace std;

class Packet;

class Router
{
private:
    int id;
    string name;
    bool active;
    queue<Packet*> packetQueue;

public:
    Router();
    Router(int id, string name);

    int getId() const;
    string getName() const;
    bool isActive() const;

    void setActive(bool status);

    bool addPacket(Packet* packet);
    Packet* removePacket();

    int getQueueSize() const;

    void display() const;
};

#endif