#ifndef ROUTING_STRATEGY_H
#define ROUTING_STRATEGY_H

#include <vector>
#include <string>

using namespace std;

class Network;

class RoutingStrategy
{
public:
    virtual vector<int> findRoute(
        Network& network,
        int source,
        int destination
    ) = 0;

    virtual string getName() = 0;

    virtual ~RoutingStrategy()
    {
    }
};

class BFSStrategy : public RoutingStrategy
{
public:
    vector<int> findRoute(
        Network& network,
        int source,
        int destination
    ) override;

    string getName() override;
};

class DijkstraStrategy : public RoutingStrategy
{
public:
    vector<int> findRoute(
        Network& network,
        int source,
        int destination
    ) override;

    string getName() override;
};

class AdaptiveStrategy : public RoutingStrategy
{
public:
    vector<int> findRoute(
        Network& network,
        int source,
        int destination
    ) override;

    string getName() override;
};

#endif