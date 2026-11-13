
cmake_minimum_required(VERSION 3.25)

project(NETROUTE_BACKEND VERSION 1.0.0 LANGUAGES CXX)

include(CTest)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Generate compile_commands.json for VS Code IntelliSense
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Common backend include directories
set(NETROUTE_INCLUDE_DIRS
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/include/core
    ${CMAKE_CURRENT_SOURCE_DIR}/include/api
    ${CMAKE_CURRENT_SOURCE_DIR}/include/algorithms
    ${CMAKE_CURRENT_SOURCE_DIR}/include/services
)

# cpp-httplib
add_library(httplib INTERFACE)

target_include_directories(httplib INTERFACE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

add_library(httplib::httplib ALIAS httplib)

# JSON dependency
find_package(nlohmann_json CONFIG REQUIRED)

# Backend executable
add_executable(netroute_backend
    src/server_main.cpp
    src/api/ApiServer.cpp
    src/core/Link.cpp
    src/core/Network.cpp
    src/core/Packet.cpp
    src/core/Router.cpp
    src/algorithms/RoutingStrategy.cpp
    src/algorithms/BFS.cpp
    src/algorithms/DFS.cpp
    src/algorithms/Dijkstra.cpp
    src/algorithms/Adaptive.cpp
    src/services/SimulationManager.cpp
)

target_include_directories(netroute_backend PRIVATE
    ${NETROUTE_INCLUDE_DIRS}
)

target_link_libraries(netroute_backend PRIVATE
    httplib::httplib
    nlohmann_json::nlohmann_json
    ws2_32
)

# Compiler settings
if(MSVC)
    target_compile_options(netroute_backend PRIVATE
        /W4
        /permissive-
        /EHsc
    )
endif()

# Routing tests
if(BUILD_TESTING)

    add_executable(netroute_routing_tests
        tests/routing_strategy_tests.cpp
        src/core/Link.cpp
        src/core/Network.cpp
        src/core/Packet.cpp
        src/core/Router.cpp
        src/algorithms/RoutingStrategy.cpp
        src/algorithms/BFS.cpp
        src/algorithms/DFS.cpp
        src/algorithms/Dijkstra.cpp
        src/algorithms/Adaptive.cpp
    )

    target_include_directories(netroute_routing_tests PRIVATE
        ${NETROUTE_INCLUDE_DIRS}
    )

    target_link_libraries(netroute_routing_tests PRIVATE
        nlohmann_json::nlohmann_json
    )

    if(MSVC)
        target_compile_options(netroute_routing_tests PRIVATE
            /W4
            /permissive-
            /EHsc
        )
    endif()

    add_test(
        NAME netroute_routing_tests
        COMMAND netroute_routing_tests
    )

endif()
