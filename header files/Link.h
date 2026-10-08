#ifndef LINK_H
#define LINK_H

class Link
{
private:
    int router1;
    int router2;
    int cost;
    bool active;

public:
    Link();
    Link(int r1, int r2, int cost);

    int getRouter1() const;
    int getRouter2() const;
    int getCost() const;

    bool isActive() const;

    void fail();
    void repair();

    void display() const;
};

#endif
