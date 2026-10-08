#include <iostream>
#include <fstream>

#include "Simulation.h"

using namespace std;

Simulation::Simulation()
{
    totalPackets = 0;
    deliveredPackets = 0;
    lostPackets = 0;
    nextPacketId = 1;
}

void Simulation::createNetwork()
{
    network.addRouter(1, "R1");
    network.addRouter(2, "R2");
    network.addRouter(3, "R3");
    network.addRouter(4, "R4");
    network.addRouter(5, "R5");
    network.addRouter(6, "R6");
    network.addRouter(7, "R7");
    network.addRouter(8, "R8");

    network.addLink(1, 2, 2);
    network.addLink(1, 3, 5);
    network.addLink(2, 3, 1);
    network.addLink(2, 4, 3);
    network.addLink(3, 5, 2);
    network.addLink(4, 5, 2);
    network.addLink(4, 6, 4);
    network.addLink(5, 6, 1);
    network.addLink(5, 7, 3);
    network.addLink(6, 8, 2);
    network.addLink(7, 8, 1);
    network.addLink(3, 7, 5);
}

void Simulation::displayNetwork()
{
    network.displayNetwork();
}

void Simulation::sendPacket(
    int source,
    int destination,
    int priority
)
{
    network.validateRouter(source);
    network.validateRouter(destination);

    totalPackets++;

    Packet packet(
        nextPacketId++,
        source,
        destination,
        priority
    );

    Router* sourceRouter = network.findRouter(source);

    if (sourceRouter == nullptr)
    {
        throw RouterNotFoundException();
    }

    if (!sourceRouter->addPacket(&packet))
    {
        lostPackets++;

        throw NetworkException(
            "Source router is inactive."
        );
    }

    try
    {
        vector<int> route =
            adaptive.findRoute(
                network,
                source,
                destination
            );

        packet.setRoute(route);

        Packet* processedPacket =
            sourceRouter->removePacket();

        if (processedPacket != nullptr)
        {
            deliveredPackets++;
        }

        packets.push_back(packet);

        packet.display();

        cout << "\nPacket delivered successfully.\n";
    }
    catch (DestinationUnreachableException&)
    {
        sourceRouter->removePacket();

        lostPackets++;

        packets.push_back(packet);

        throw;
    }
}

void Simulation::failLink(
    int router1,
    int router2
)
{
    network.failLink(router1, router2);

    cout << "\nLink "
         << router1
         << " - "
         << router2
         << " has FAILED.\n";
}

void Simulation::repairLink(
    int router1,
    int router2
)
{
    network.repairLink(router1, router2);

    cout << "\nLink "
         << router1
         << " - "
         << router2
         << " has been REPAIRED.\n";
}

void Simulation::failRouter(int router)
{
    network.failRouter(router);

    cout << "\nRouter "
         << router
         << " has FAILED.\n";
}

void Simulation::repairRouter(int router)
{
    network.repairRouter(router);

    cout << "\nRouter "
         << router
         << " has been REPAIRED.\n";
}

void Simulation::compareAlgorithms(
    int source,
    int destination
)
{
    network.validateRouter(source);
    network.validateRouter(destination);

    RoutingStrategy* strategies[3];

    strategies[0] = &bfs;
    strategies[1] = &dijkstra;
    strategies[2] = &adaptive;

    cout << "\n============================================\n";
    cout << "          ROUTING ALGORITHM COMPARISON\n";
    cout << "============================================\n";

    for (int i = 0; i < 3; i++)
    {
        cout << "\nAlgorithm: "
             << strategies[i]->getName()
             << endl;

        try
        {
            vector<int> route =
                strategies[i]->findRoute(
                    network,
                    source,
                    destination
                );

            cout << "Route: ";

            for (int node : route)
            {
                cout << node << " ";
            }

            cout << endl;

            cout << "Hop Count: "
                 << route.size() - 1
                 << endl;
        }
        catch (NetworkException& e)
        {
            cout << "Result: "
                 << e.what()
                 << endl;
        }
    }
}

void Simulation::showStatistics()
{
    cout << "\n============================================\n";
    cout << "             SIMULATION STATISTICS\n";
    cout << "============================================\n";

    cout << "Total Packets: "
         << totalPackets
         << endl;

    cout << "Delivered Packets: "
         << deliveredPackets
         << endl;

    cout << "Lost Packets: "
         << lostPackets
         << endl;

    if (totalPackets > 0)
    {
        double deliveryRate =
            (static_cast<double>(deliveredPackets)
             / totalPackets) * 100.0;

        double lossRate =
            (static_cast<double>(lostPackets)
             / totalPackets) * 100.0;

        cout << "Delivery Rate: "
             << deliveryRate
             << "%"
             << endl;

        cout << "Loss Rate: "
             << lossRate
             << "%"
             << endl;
    }
    else
    {
        cout << "Delivery Rate: 0%\n";
        cout << "Loss Rate: 0%\n";
    }

    cout << "Total Stored Packet Records: "
         << packets.size()
         << endl;
}

void Simulation::checkNetwork()
{
    cout << "\n============================================\n";
    cout << "          NETWORK CONNECTIVITY\n";
    cout << "============================================\n";

    if (network.isConnected())
    {
        cout << "Network Status: CONNECTED\n";
    }
    else
    {
        cout << "Network Status: DISCONNECTED\n";
    }
}

void Simulation::saveDetailsToFile(
    const string& filename
)
{
    ofstream out(filename);

    if (!out)
    {
        throw NetworkException(
            "Unable to open file for saving."
        );
    }

    network.saveNetworkToFile(out);

    out << "\nPACKET HISTORY\n";
    out << "==============\n";

    out << "Total Packets: "
        << totalPackets
        << "\n";

    out << "Delivered Packets: "
        << deliveredPackets
        << "\n";

    out << "Lost Packets: "
        << lostPackets
        << "\n";

    out << "\nPACKETS\n";

    for (const Packet& packet : packets)
    {
        out << "Packet ID: "
            << packet.getId()
            << "\n";

        out << "Source: "
            << packet.getSource()
            << "\n";

        out << "Destination: "
            << packet.getDestination()
            << "\n";

        out << "Priority: "
            << packet.getPriority()
            << "\n";

        out << "Route: ";

        vector<int> route = packet.getRoute();

        if (route.empty())
        {
            out << "No route";
        }
        else
        {
            for (int node : route)
            {
                out << node << " ";
            }
        }

        out << "\n\n";
    }

    out.close();

    cout << "\nNetwork details saved successfully to "
         << filename
         << endl;
}

void Simulation::loadNetworkFromFile(
    const string& filename
)
{
    ifstream in(filename);

    if (!in)
    {
        throw NetworkException(
            "Unable to open file for loading."
        );
    }

    network.loadNetworkFromFile(in);

    cout << "\nNetwork loaded successfully from "
         << filename
         << endl;

    in.close();
}