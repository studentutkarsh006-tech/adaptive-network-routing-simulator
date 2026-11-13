#include "services/SimulationManager.hpp"
#include <stdexcept>

std::shared_ptr<SimulationSession> SimulationManager::create(
    int routerCount,
    std::string& id
)
{
    if (routerCount < 4 || routerCount > 15)
        throw std::invalid_argument(
            "Router count must be between 4 and 15."
        );

    std::lock_guard<std::mutex> guard(sessionsMutex_);

    id = "sim-" + std::to_string(nextId_++);

    auto session = std::make_shared<SimulationSession>(routerCount);

    session->events.push_back({
        {"type", "simulation_created"},
        {"detail", {
            {"routerCount", routerCount}
        }}
    });

    sessions_.emplace(id, session);

    return session;
}

std::shared_ptr<SimulationSession> SimulationManager::find(
    const std::string& id
) const
{
    std::lock_guard<std::mutex> guard(sessionsMutex_);

    auto it = sessions_.find(id);

    if (it == sessions_.end())
        throw std::out_of_range("Simulation not found.");

    return it->second;
}

std::mutex& SimulationManager::stateMutex()
{
    return stateMutex_;
}
