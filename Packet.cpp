#include <iostream>
#include "Packet.h"

using namespace std;

Packet::Packet()
{
    id = 0;
    source = 0;
    destination = 0;
    priority = 1;
}

Packet::Packet(int id, int source, int destination, int priority)
{
    this->id = id;
    this->source = source;
    this->destination = destination;
    this->priority = priority;
}

int Packet::getId() const
{
    return id;
}

int Packet::getSource() const
{
    return source;
}

int Packet::getDestination() const
{
    return destination;
}

int Packet::getPriority() const
{
    return priority;
}

void Packet::setRoute(const vector<int>& newRoute)
{
    route = newRoute;
}

vector<int> Packet::getRoute() const
{
    return route;
}

void Packet::display() const
{
    cout << "\n========== PACKET ==========\n";

    cout << "Packet ID: " << id << endl;
    cout << "Source: " << source << endl;
    cout << "Destination: " << destination << endl;
    cout << "Priority: " << priority << endl;

    cout << "Route: ";

    if (route.empty())
    {
        cout << "No route";
    }
    else
    {
        for (int node : route)
        {
            cout << node << " ";
        }
    }

    cout << endl;
}