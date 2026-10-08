#include <iostream>

#include "Simulation.h"
#include "NetworkException.h"

using namespace std;

void showMenu()
{
    cout << "\n\n";
    cout << "============================================\n";
    cout << "       ADAPTIVE NETWORK ROUTING SIMULATOR\n";
    cout << "============================================\n";

    cout << "1.  Display Network\n";
    cout << "2.  Send Packet\n";
    cout << "3.  Compare Routing Algorithms\n";
    cout << "4.  Fail Link\n";
    cout << "5.  Repair Link\n";
    cout << "6.  Fail Router\n";
    cout << "7.  Repair Router\n";
    cout << "8.  Check Network Connectivity\n";
    cout << "9.  Show Statistics\n";
    cout << "10. Save Details to File\n";
    cout << "11. Load Network from File\n";
    cout << "0.  Exit\n";

    cout << "============================================\n";
    cout << "Enter your choice: ";
}

int main()
{
    Simulation simulation;

    simulation.createNetwork();

    int choice;

    while (true)
    {
        showMenu();

        cin >> choice;

        try
        {
            switch (choice)
            {
                case 1:
                {
                    simulation.displayNetwork();
                    break;
                }

                case 2:
                {
                    int source;
                    int destination;
                    int priority;

                    cout << "\nEnter source router: ";
                    cin >> source;

                    cout << "Enter destination router: ";
                    cin >> destination;

                    cout << "Enter packet priority: ";
                    cin >> priority;

                    if (priority < 1)
                    {
                        throw NetworkException(
                            "Priority must be at least 1."
                        );
                    }

                    simulation.sendPacket(
                        source,
                        destination,
                        priority
                    );

                    break;
                }

                case 3:
                {
                    int source;
                    int destination;

                    cout << "\nEnter source router: ";
                    cin >> source;

                    cout << "Enter destination router: ";
                    cin >> destination;

                    simulation.compareAlgorithms(
                        source,
                        destination
                    );

                    break;
                }

                case 4:
                {
                    int router1;
                    int router2;

                    cout << "\nEnter first router: ";
                    cin >> router1;

                    cout << "Enter second router: ";
                    cin >> router2;

                    simulation.failLink(
                        router1,
                        router2
                    );

                    break;
                }

                case 5:
                {
                    int router1;
                    int router2;

                    cout << "\nEnter first router: ";
                    cin >> router1;

                    cout << "Enter second router: ";
                    cin >> router2;

                    simulation.repairLink(
                        router1,
                        router2
                    );

                    break;
                }

                case 6:
                {
                    int router;

                    cout << "\nEnter router to fail: ";
                    cin >> router;

                    simulation.failRouter(router);

                    break;
                }

                case 7:
                {
                    int router;

                    cout << "\nEnter router to repair: ";
                    cin >> router;

                    simulation.repairRouter(router);

                    break;
                }

                case 8:
                {
                    simulation.checkNetwork();
                    break;
                }

                case 9:
                {
                    simulation.showStatistics();
                    break;
                }

                case 10:
                {
                    simulation.saveDetailsToFile(
                        "network_data.txt"
                    );

                    break;
                }

                case 11:
                {
                    simulation.loadNetworkFromFile(
                        "network_data.txt"
                    );

                    break;
                }

                case 0:
                {
                    cout << "\nThank you for using "
                         << "Adaptive Network Routing Simulator!\n";

                    return 0;
                }

                default:
                {
                    cout << "\nInvalid choice. "
                         << "Please try again.\n";
                }
            }
        }
        catch (RouterNotFoundException& e)
        {
            cout << "\nROUTER ERROR: "
                 << e.what()
                 << endl;
        }
        catch (LinkNotFoundException& e)
        {
            cout << "\nLINK ERROR: "
                 << e.what()
                 << endl;
        }
        catch (DestinationUnreachableException& e)
        {
            cout << "\nROUTING ERROR: "
                 << e.what()
                 << endl;
        }
        catch (NetworkException& e)
        {
            cout << "\nNETWORK ERROR: "
                 << e.what()
                 << endl;
        }
        catch (exception& e)
        {
            cout << "\nGENERAL ERROR: "
                 << e.what()
                 << endl;
        }
    }

    return 0;
}

#include "Router.cpp"
#include "Link.cpp"
#include "Packet.cpp"
#include "Network.cpp"
#include "RoutingStrategy.cpp"
#include "Simulation.cpp"
