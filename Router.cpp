#include <iostream>
#include "Router.h"

using namespace std;

Router::Router()
{
    id = 0;
    name = "Unknown";
    active = true;
}

Router::Router(int id, string name)
{
    this->id = id;
    this->name = name;
    active = true;
}

int Router::getId() const
{
    return id;
}

string Router::getName() const
{
    return name;
}

bool Router::isActive() const
{
    return active;
}

void Router::setActive(bool status)
{
    active = status;
}

bool Router::addPacket(Packet* packet)
{
    if (!active)
        return false;

    packetQueue.push(packet);
    return true;
}

Packet* Router::removePacket()
{
    if (packetQueue.empty())
        return nullptr;

    Packet* packet = packetQueue.front();
    packetQueue.pop();

    return packet;
}

int Router::getQueueSize() const
{
    return static_cast<int>(packetQueue.size());
}

void Router::display() const
{
    cout << "Router ID: " << id
         << " | Name: " << name
         << " | Status: ";

    if (active)
        cout << "ACTIVE";
    else
        cout << "FAILED";

    cout << " | Packets in Queue: "
         << packetQueue.size()
         << endl;
}