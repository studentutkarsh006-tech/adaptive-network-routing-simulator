#include <iostream>
#include "Link.h"

using namespace std;

Link::Link()
{
    router1 = 0;
    router2 = 0;
    cost = 1;
    active = true;
}

Link::Link(int r1, int r2, int cost)
{
    router1 = r1;
    router2 = r2;
    this->cost = cost;
    active = true;
}

int Link::getRouter1() const
{
    return router1;
}

int Link::getRouter2() const
{
    return router2;
}

int Link::getCost() const
{
    return cost;
}

bool Link::isActive() const
{
    return active;
}

void Link::fail()
{
    active = false;
}

void Link::repair()
{
    active = true;
}

void Link::display() const
{
    cout << router1 << " <----> " << router2
         << " | Cost: " << cost
         << " | Status: ";

    if (active)
        cout << "ACTIVE";
    else
        cout << "FAILED";

    cout << endl;
}
