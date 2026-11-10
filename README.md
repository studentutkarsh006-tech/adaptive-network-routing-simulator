# NETROUTE — Adaptive Network Routing Simulator

NETROUTE consists of a vanilla HTML/CSS/JavaScript frontend, a C++17 REST backend, and backend tests. The Lab uses the REST API as the authority for simulation sessions, topology, routing, failures, packet status, metrics, and events.

## Repository layout

.
├── Frontend/          Existing browser application
├── Backend/           C++17 REST API, shared core, routing algorithms, and tests
├── README.md
├── PPT.tex
└── Report.tex

## Frontend

The existing frontend is plain HTML, CSS, and JavaScript. The Lab page (`Frontend/lab.html`) uses the shared REST client (`Frontend/js/api.js`) to create and manage an in-memory backend simulation at `http://127.0.0.1:8080/api/v1` by default. Serve `Frontend/` over HTTP (for example, with an existing static web server); configure `window.NETROUTE_API_BASE_URL` before `api.js` if the backend uses another address. Other informational pages remain static.

## C++ REST backend

The backend uses MSVC, C++17, CMake, and the existing vcpkg packages `cpp-httplib` and `nlohmann-json`. It supports 4–20 routers, BFS, DFS, Dijkstra, and Adaptive routing; the Lab delegates routing and failure decisions to the backend. The REST API also manages packet creation/processing/history, metrics, events, comparisons, and reset. Simulation sessions are in memory and are lost when the backend stops. MySQL and persistent storage are not implemented. Packet priority is retained as metadata; processing uses FIFO order within each router and does not schedule high-priority packets first.

From the repository root in PowerShell, set `VCPKG_ROOT` to the already-installed vcpkg directory, then configure and build with the installed MSVC toolchain and packages:

    $env:VCPKG_ROOT = "C:/path/to/installed/vcpkg"
    cmake -S .\Backend -B .\Backend\build -DCMAKE_TOOLCHAIN_FILE="$env:VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake" -DVCPKG_TARGET_TRIPLET=x64-windows
    cmake --build .\Backend\build --config Release

Start the service:

    .\Backend\build\Release\netroute_backend.exe

It listens on http://127.0.0.1:8080 by default. Set NETROUTE_PORT before launch to select another port. Check that it is running:

    Invoke-RestMethod http://127.0.0.1:8080/api/v1/health

The endpoint contract, request examples, response fields, and Adaptive strategy behavior are documented in Backend/API.md.

Run the API verification script with PowerShell 7 and CTest:

    pwsh -NoProfile -File .\Backend\tests\verify_api.ps1
    ctest --test-dir .\Backend\build -C Release --output-on-failure

The backend simulates networks locally; it does not configure real routers or transmit network traffic. The 8-router session uses the original application topology and link costs. The Lab visualizes backend-confirmed failure, repair, route, and packet outcomes; it does not provide durable history across backend restarts.
