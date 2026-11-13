
#include "Router.hpp"

Router::Router() : id(0), name(""), active(true) {}

Router::Router(int id, string name)
    : id(id), name(name), active(true) {}

int Router::getId() const {
    return id;
}

string Router::getName() const {
    return name;
}

bool Router::isActive() const {
    return active;
}

void Router::setActive(bool status) {
    active = status;
}

void Router::addPacket(const Packet& packet) {
    packetQueue.push(packet);
}

bool Router::removePacket(Packet& packet) {
    if (packetQueue.empty()) {
        return false;
    }

    packet = packetQueue.front();
    packetQueue.pop();

    return true;
}

int Router::getQueueSize() const {
    return static_cast<int>(packetQueue.size());
}

vector<Packet> Router::getQueuedPackets() const {
    queue<Packet> temp = packetQueue;
    vector<Packet> result;

    while (!temp.empty()) {
        result.push_back(temp.front());
        temp.pop();
    }

    return result;
}

vector<Packet> Router::drainPackets() {
    vector<Packet> result;
    Packet packet;

    while (removePacket(packet)) {
        result.push_back(packet);
    }

    return result;
}

void Router::display() const {
    cout << "Router " << id << " (" << name << ") - "
         << (active ? "Active" : "Failed")
         << " - Queued packets: " << packetQueue.size()
         << '\n';
}
