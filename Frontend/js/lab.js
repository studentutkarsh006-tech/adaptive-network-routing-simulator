"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);

    const API = window.NETROUTE_API;

    if (!API) {
        console.error("NETROUTE_API is missing. Check api.js.");
        return;
    }

    const el = {
        routerCount: $("routerCount"),
        linkCount: $("linkCount"),
        deliveredCount: $("deliveredCount"),
        failedCount: $("failedCount"),

        topologySelect: $("topologySelect"),
        algorithmSelect: $("algorithmSelect"),
        sourceSelect: $("sourceSelect"),
        destinationSelect: $("destinationSelect"),
        prioritySelect: $("prioritySelect"),

        failureRouterSelect: $("failureRouterSelect"),
        failureLinkSelect: $("failureLinkSelect"),

        simulateBtn: $("simulateBtn"),
        resetBtn: $("resetBtn"),
        failRouterBtn: $("failRouterBtn"),
        repairRouterBtn: $("repairRouterBtn"),
        breakLinkBtn: $("breakLinkBtn"),
        restoreLinkBtn: $("restoreLinkBtn"),
        compareBtn: $("compareBtn"),

        networkSvg: $("networkSvg"),
        linksLayer: $("linksLayer"),
        packetsLayer: $("packetsLayer"),
        routersLayer: $("routersLayer"),
        networkViewport: $("networkViewport"),

        routeSummary: $("routeSummary"),
        routerDetails: $("routerDetails"),
        eventLog: $("eventLog"),

        comparisonPanel: $("comparisonPanel"),
        comparisonResults: $("comparisonResults"),
        closeComparisonBtn: $("closeComparisonBtn"),
        clearLogBtn: $("clearLogBtn"),

        zoomInBtn: $("zoomInBtn"),
        zoomOutBtn: $("zoomOutBtn"),
        zoomResetBtn: $("zoomResetBtn")
    };

    const required = [
        "topologySelect",
        "algorithmSelect",
        "sourceSelect",
        "destinationSelect",
        "simulateBtn",
        "resetBtn",
        "networkSvg",
        "linksLayer",
        "packetsLayer",
        "routersLayer",
        "routeSummary",
        "routerDetails",
        "eventLog"
    ];

    const missing = required.filter((id) => !el[id]);

    if (missing.length) {
        console.error("Missing HTML elements:", missing);
        return;
    }

    const SVG_NS = "http://www.w3.org/2000/svg";

    const state = {
        simulationId: null,
        topology: null,
        routers: [],
        links: [],
        metrics: null,

        selectedRouter: null,
        source: "",
        destination: "",
        route: [],

        failedRouters: new Set(),
        brokenLinks: new Set(),

        packets: [],
        pendingPackets: [],

        zoom: 1,

        busy: false,
        sessionSequence: 0
    };

    // --------------------------------------------------
    // Helpers
    // --------------------------------------------------

    function request(path, body) {
        if (body === undefined) {
            return API.get(path);
        }

        return API.post(path, body);
    }

    function simulationPath(path = "") {
        if (!state.simulationId) {
            throw new Error("Create a simulation first.");
        }

        return `/simulations/${encodeURIComponent(state.simulationId)}${path}`;
    }

    function routerName(id) {
        return `R${id}`;
    }

    function backendRouterId(name) {
        const router = state.routers.find((item) => item.name === name);

        if (!router) {
            throw new Error(`Router ${name} does not exist.`);
        }

        return router.backendId;
    }

    function linkKey(a, b) {
        return [a, b].sort().join("-");
    }

    function getRouter(name) {
        return state.routers.find((router) => router.name === name);
    }

    function getLink(a, b) {
        return state.links.find(
            (link) =>
                (link.source === a && link.destination === b) ||
                (link.source === b && link.destination === a)
        );
    }

    function isRouterFailed(name) {
        const router = getRouter(name);

        return !router ||
            !router.active ||
            state.failedRouters.has(name);
    }

    function isLinkAvailable(link) {
        return Boolean(
            link &&
            link.active &&
            !state.brokenLinks.has(linkKey(link.source, link.destination)) &&
            !isRouterFailed(link.source) &&
            !isRouterFailed(link.destination)
        );
    }

    function availableLinks() {
        return state.links.filter(isLinkAvailable);
    }

    function neighbors(name) {
        return availableLinks()
            .filter(
                (link) =>
                    link.source === name ||
                    link.destination === name
            )
            .map((link) => ({
                name: link.source === name
                    ? link.destination
                    : link.source,
                cost: link.cost
            }));
    }

    function svg(tag, attributes = {}, text = "") {
        const node = document.createElementNS(SVG_NS, tag);

        Object.entries(attributes).forEach(([key, value]) => {
            node.setAttribute(key, String(value));
        });

        if (text !== "") {
            node.textContent = text;
        }

        return node;
    }

    function setText(node, value) {
        if (node) {
            node.textContent = String(value);
        }
    }

    function showSummary(title, message, type = "info") {
        el.routeSummary.className = `route-summary ${type}`;

        const icon = el.routeSummary.querySelector(".summary-icon");
        const heading = el.routeSummary.querySelector("strong");
        const paragraph = el.routeSummary.querySelector("p");

        setText(
            icon,
            type === "success" ? "✓" :
            type === "error" ? "!" : "?"
        );

        setText(heading, title);
        setText(paragraph, message);
    }

    function log(message, type = "info") {
        const empty = el.eventLog.querySelector(".log-empty");

        if (empty) {
            empty.remove();
        }

        const entry = document.createElement("div");
        entry.className = `log-entry ${type}`;

        const time = document.createElement("span");
        time.className = "log-time";
        time.textContent = new Date().toLocaleTimeString();

        const text = document.createElement("span");
        text.className = "log-message";
        text.textContent = message;

        entry.append(time, text);
        el.eventLog.prepend(entry);

        while (el.eventLog.children.length > 80) {
            el.eventLog.lastElementChild.remove();
        }
    }

    function clearLog() {
        el.eventLog.replaceChildren();

        const empty = document.createElement("p");
        empty.className = "log-empty";
        empty.textContent = "Your simulation events will appear here.";

        el.eventLog.appendChild(empty);
    }

    function setBackendStatus(message) {
        const status = document.querySelector(".lab-status");

        if (!status) return;

        const textNode = Array.from(status.childNodes)
            .find((node) => node.nodeType === Node.TEXT_NODE);

        if (textNode) {
            textNode.nodeValue = ` ${message}`;
        }
    }

    function setBusy(value) {
        state.busy = value;

        [
            el.simulateBtn,
            el.resetBtn,
            el.failRouterBtn,
            el.repairRouterBtn,
            el.breakLinkBtn,
            el.restoreLinkBtn,
            el.compareBtn
        ].forEach((button) => {
            if (button) {
                button.disabled = value;
            }
        });
    }

    async function runAction(action) {
        if (state.busy) return;

        setBusy(true);

        try {
            await action();
        } catch (error) {
            console.error(error);

            showSummary(
                "Operation failed",
                error.message || "An unexpected error occurred.",
                "error"
            );

            log(
                error.message || "Operation failed.",
                "error"
            );
        } finally {
            setBusy(false);
        }
    }

    // --------------------------------------------------
    // Topology
    // --------------------------------------------------

    function calculatePositions(routers) {
        const count = routers.length;

        const columns = Math.min(
            5,
            Math.max(2, Math.ceil(Math.sqrt(count)))
        );

        const rows = Math.ceil(count / columns);

        const left = 100;
        const right = 700;
        const top = 80;
        const bottom = 420;

        return routers.map((router, index) => {
            const row = Math.floor(index / columns);
            const column = index % columns;

            const itemsInRow = Math.min(
                columns,
                count - row * columns
            );

            const x = itemsInRow === 1
                ? 400
                : left + column * (right - left) /
                    (itemsInRow - 1);

            const y = rows === 1
                ? 250
                : top + row * (bottom - top) /
                    (rows - 1);

            return {
                backendId: Number(router.id),
                name: String(router.name || routerName(router.id)),
                active: router.active !== false,
                x: Math.round(x),
                y: Math.round(y)
            };
        });
    }

    function applyTopology(topology) {
        if (
            !topology ||
            !Array.isArray(topology.routers) ||
            !Array.isArray(topology.links)
        ) {
            throw new Error("Invalid topology returned by backend.");
        }

        const routers = calculatePositions(topology.routers);

        const idToName = new Map();

        routers.forEach((router) => {
            idToName.set(router.backendId, router.name);
        });

        const links = topology.links.map((link) => {
            const source = idToName.get(Number(link.source));
            const destination = idToName.get(Number(link.destination));

            if (!source || !destination) {
                throw new Error("Topology contains an unknown router.");
            }

            return {
                source,
                destination,
                sourceId: Number(link.source),
                destinationId: Number(link.destination),
                cost: Number(link.cost),
                active: link.active !== false
            };
        });

        state.topology = topology;
        state.routers = routers;
        state.links = links;

        state.failedRouters = new Set(
            routers
                .filter((router) => !router.active)
                .map((router) => router.name)
        );

        state.brokenLinks = new Set(
            links
                .filter((link) => !link.active)
                .map((link) => linkKey(link.source, link.destination))
        );

        state.source = routers[0]?.name || "";
        state.destination = routers.at(-1)?.name || "";

        state.selectedRouter = null;
        state.route = [];

        renderAll();
        updateMetrics();

        showSummary(
            "Network ready",
            `${routers.length} routers and ${links.length} links loaded.`,
            "success"
        );
    }

    async function createSimulation() {
        const count = Number(el.topologySelect.value || 8);

        if (!Number.isInteger(count) || count < 4 || count > 20) {
            throw new Error("Router count must be between 4 and 20.");
        }

        state.sessionSequence++;

        const sequence = state.sessionSequence;

        state.simulationId = null;
        state.route = [];
        state.packets = [];
        state.pendingPackets = [];

        clearLog();

        setBackendStatus("Connecting to Backend");

        showSummary(
            "Creating simulation",
            `Initializing a ${count}-router network.`
        );

        const result = await request("/simulations", {
            routerCount: count
        });

        if (sequence !== state.sessionSequence) return;

        if (!result || !result.id || !result.topology) {
            throw new Error("Backend did not return a simulation session.");
        }

        state.simulationId = String(result.id);

        applyTopology(result.topology);

        await refreshAll();

        setBackendStatus("Backend Connected");

        log("Simulation created.", "success");
    }

    async function resetSimulation() {
        if (!state.simulationId) {
            await createSimulation();
            return;
        }

        const result = await request(
            simulationPath("/reset"),
            {}
        );

        state.route = [];
        state.packets = [];
        state.pendingPackets = [];

        state.failedRouters.clear();
        state.brokenLinks.clear();

        if (result.metrics) {
            state.metrics = result.metrics;
        }

        const session = await request(simulationPath());

        applyTopology(session.topology);

        await refreshAll();

        showSummary(
            "Simulation reset",
            "Network restored to its initial topology.",
            "success"
        );

        log("Simulation reset.", "success");
    }

    // --------------------------------------------------
    // Select controls
    // --------------------------------------------------

    function fillSelect(select, values, preferred, disabled = () => false) {
        if (!select) return;

        select.replaceChildren();

        values.forEach((value) => {
            const option = document.createElement("option");

            option.value = value;
            option.textContent = value;
            option.disabled = Boolean(disabled(value));

            select.appendChild(option);
        });

        const usable = values.find(
            (value) => !disabled(value)
        );

        select.value = values.includes(preferred) &&
            !disabled(preferred)
            ? preferred
            : usable || "";
    }

    function renderSelects() {
        const names = state.routers.map((router) => router.name);

        fillSelect(
            el.sourceSelect,
            names,
            state.source,
            isRouterFailed
        );

        fillSelect(
            el.destinationSelect,
            names,
            state.destination,
            isRouterFailed
        );

        fillSelect(
            el.failureRouterSelect,
            names,
            el.failureRouterSelect?.value
        );

        state.source = el.sourceSelect.value;
        state.destination = el.destinationSelect.value;

        renderFailureLinks();
    }

    function renderFailureLinks() {
        if (!el.failureLinkSelect) return;

        const previous = el.failureLinkSelect.value;

        el.failureLinkSelect.replaceChildren();

        state.links.forEach((link) => {
            const key = linkKey(link.source, link.destination);

            const option = document.createElement("option");

            option.value = key;
            option.textContent =
                `${link.source} ↔ ${link.destination} · Cost ${link.cost}`;

            el.failureLinkSelect.appendChild(option);
        });

        if (
            Array.from(el.failureLinkSelect.options)
                .some((option) => option.value === previous)
        ) {
            el.failureLinkSelect.value = previous;
        }
    }

    // --------------------------------------------------
    // Render network
    // --------------------------------------------------

    function renderAll() {
        renderSelects();
        renderLinks();
        renderRouters();
        renderRouterDetails(state.selectedRouter);
        renderPackets();
    }

    function renderLinks() {
        el.linksLayer.replaceChildren();

        state.links.forEach((link) => {
            const source = getRouter(link.source);
            const destination = getRouter(link.destination);

            if (!source || !destination) return;

            const key = linkKey(link.source, link.destination);
            const available = isLinkAvailable(link);

            const routeLink = state.route.some(
                (name, index) =>
                    index < state.route.length - 1 &&
                    linkKey(name, state.route[index + 1]) === key
            );

            const group = svg("g", {
                class: "link-group",
                "data-link": key
            });

            const line = svg("line", {
                x1: source.x,
                y1: source.y,
                x2: destination.x,
                y2: destination.y,

                class:
                    "network-link" +
                    (routeLink && available ? " route-link" : "") +
                    (!available ? " failed-link" : "")
            });

            group.appendChild(line);

            const label = svg(
                "text",
                {
                    x: (source.x + destination.x) / 2,
                    y: (source.y + destination.y) / 2 - 8,

                    class:
                        "link-cost" +
                        (routeLink && available ? " route-cost" : "") +
                        (!available ? " failed-cost" : "")
                },
                String(link.cost)
            );

            group.appendChild(label);

            el.linksLayer.appendChild(group);
        });
    }

    function renderRouters() {
        el.routersLayer.replaceChildren();

        state.routers.forEach((router) => {
            const failed = isRouterFailed(router.name);

            const selected =
                state.selectedRouter === router.name;

            const onRoute =
                state.route.includes(router.name);

            const isSource =
                state.source === router.name;

            const isDestination =
                state.destination === router.name;

            const classes = [
                "router-node",
                failed ? "failed" : "",
                selected || onRoute ? "selected" : "",
                isSource ? "source-node" : "",
                isDestination ? "destination-node" : ""
            ].filter(Boolean).join(" ");

            const group = svg("g", {
                class: classes,
                transform: `translate(${router.x},${router.y})`,
                tabindex: "0",
                role: "button",
                "data-router": router.name,
                "aria-label": router.name
            });

            group.appendChild(svg("line", {
                x1: -13,
                y1: -14,
                x2: -18,
                y2: -27,
                class: "router-antenna"
            }));

            group.appendChild(svg("line", {
                x1: 13,
                y1: -14,
                x2: 18,
                y2: -27,
                class: "router-antenna"
            }));

            group.appendChild(svg("circle", {
                cx: -18,
                cy: -28,
                r: 2.7,
                fill: failed ? "#fb7185" : "#818cf8"
            }));

            group.appendChild(svg("circle", {
                cx: 18,
                cy: -28,
                r: 2.7,
                fill: failed ? "#fb7185" : "#818cf8"
            }));

            group.appendChild(svg("rect", {
                x: -29,
                y: -17,
                width: 58,
                height: 34,
                rx: 7,
                class: "router-shell"
            }));

            group.appendChild(svg("rect", {
                x: -25,
                y: -13,
                width: 50,
                height: 8,
                rx: 3,
                class: "router-top"
            }));

            [-17, -7, 3, 13].forEach((x) => {
                group.appendChild(svg("rect", {
                    x,
                    y: 7,
                    width: 6,
                    height: 4,
                    rx: 1,
                    class: "router-port"
                }));
            });

            group.appendChild(svg("circle", {
                cx: 20,
                cy: -9,
                r: 2.5,
                class: "router-led"
            }));

            group.appendChild(svg(
                "text",
                {
                    x: 0,
                    y: 37,
                    class: "router-label"
                },
                router.name
            ));

            const status = failed
                ? "FAILED"
                : isSource
                    ? "SOURCE"
                    : isDestination
                        ? "DESTINATION"
                        : "ONLINE";

            group.appendChild(svg(
                "text",
                {
                    x: 0,
                    y: 50,
                    class: "router-sub-label"
                },
                status
            ));

            group.addEventListener("click", () => {
                selectRouter(router.name);
            });

            group.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectRouter(router.name);
                }
            });

            el.routersLayer.appendChild(group);
        });
    }

    function selectRouter(name) {
        state.selectedRouter = name;

        renderRouters();
        renderRouterDetails(name);
    }

    function renderRouterDetails(name) {
        if (!el.routerDetails) return;

        if (!name) {
            el.routerDetails.replaceChildren();

            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent =
                "Select a router in the network to see its details.";

            el.routerDetails.appendChild(empty);
            return;
        }

        const router = getRouter(name);

        if (!router) return;

        const failed = isRouterFailed(name);
        const adjacent = state.links.filter(
            (link) =>
                link.source === name ||
                link.destination === name
        );

        el.routerDetails.replaceChildren();

        const heading = document.createElement("h3");
        heading.textContent = name;

        const status = document.createElement("p");
        status.textContent = failed ? "Failed" : "Online";

        const neighborsHeading = document.createElement("h4");
        neighborsHeading.textContent = "Connected routers";

        const list = document.createElement("ul");

        adjacent.forEach((link) => {
            const neighbor = link.source === name
                ? link.destination
                : link.source;

            const item = document.createElement("li");

            item.textContent =
                `${neighbor} · Cost ${link.cost}` +
                (isLinkAvailable(link) ? "" : " · Unavailable");

            list.appendChild(item);
        });

        el.routerDetails.append(
            heading,
            status,
            neighborsHeading,
            list
        );
    }

    // --------------------------------------------------
    // Routing
    // --------------------------------------------------

    async function findRoute() {
        const source = el.sourceSelect.value;
        const destination = el.destinationSelect.value;
        const algorithm = el.algorithmSelect.value;

        if (!source || !destination) {
            throw new Error("Select source and destination routers.");
        }

        if (isRouterFailed(source) || isRouterFailed(destination)) {
            throw new Error("Source or destination router is offline.");
        }

        state.source = source;
        state.destination = destination;

        const result = await request(
            simulationPath("/route"),
            {
                source: backendRouterId(source),
                destination: backendRouterId(destination),
                algorithm
            }
        );

        if (!result || !Array.isArray(result.route)) {
            throw new Error("Backend returned an invalid route.");
        }

        state.route = result.route.map(Number).map(routerId => {
            const router = state.routers.find(
                (item) => item.backendId === routerId
            );

            if (!router) {
                throw new Error("Route contains an unknown router.");
            }

            return router.name;
        });

        renderAll();

        showSummary(
            "Route calculated",
            `${algorithm}: ${state.route.join(" → ")} · Cost ${result.cost}`,
            "success"
        );

        log(
            `${algorithm} calculated route: ${state.route.join(" → ")}.`,
            "success"
        );

        return result;
    }

    // --------------------------------------------------
    // Packet simulation
    // --------------------------------------------------

    function selectedPriority() {
        const value = String(el.prioritySelect?.value || "normal");

        const priorities = {
            normal: 1,
            high: 5,
            critical: 10
        };

        return priorities[value] || Number(value) || 1;
    }

    async function simulatePackets() {
        const source = el.sourceSelect.value;
        const destination = el.destinationSelect.value;
        const algorithm = el.algorithmSelect.value;

        if (!source || !destination) {
            throw new Error("Select source and destination.");
        }

        if (isRouterFailed(source) || isRouterFailed(destination)) {
            throw new Error("Source or destination is offline.");
        }

        state.source = source;
        state.destination = destination;

        const created = await request(
            simulationPath("/packets"),
            {
                source: backendRouterId(source),
                destination: backendRouterId(destination),
                priority: selectedPriority(),
                count: 1
            }
        );

        if (!created || !Array.isArray(created.packets)) {
            throw new Error("Backend did not return created packets.");
        }

        log("Packet created and queued.", "info");

        const processed = await request(
            simulationPath("/packets/process"),
            { algorithm }
        );

        if (!processed || !Array.isArray(processed.packets)) {
            throw new Error("Backend returned invalid packet results.");
        }

        state.route = [];

        const delivered = processed.packets.filter(
            (packet) => packet.status === "delivered"
        );

        if (delivered.length) {
            const packet = delivered[0];

            state.route = (packet.route || []).map((id) => {
                const router = state.routers.find(
                    (item) => item.backendId === Number(id)
                );

                return router ? router.name : routerName(id);
            });

            showSummary(
                "Packet delivered",
                `${algorithm} · ${state.route.join(" → ")} · Cost ${packet.cost}`,
                "success"
            );

            log(
                `Packet ${packet.id} delivered using ${algorithm}.`,
                "success"
            );
        } else {
            showSummary(
                "Packet lost",
                "The backend could not deliver the packet.",
                "error"
            );

            log("Packet could not be delivered.", "error");
        }

        await refreshAll();

        renderAll();
    }

    async function refreshPackets() {
        const [history, pending] = await Promise.all([
            request(simulationPath("/packets")),
            request(simulationPath("/packets/pending"))
        ]);

        state.packets = history.packets || [];
        state.pendingPackets = pending.pendingPackets || [];

        renderPackets();
    }

    function renderPackets() {
        if (!el.packetsLayer) return;

        el.packetsLayer.replaceChildren();

        state.packets
            .filter((packet) => packet.status === "pending")
            .forEach((packet) => {
                const source = state.routers.find(
                    (router) => router.backendId === Number(packet.source)
                );

                if (!source) return;

                const group = svg("g", {
                    class: "packet-node",
                    transform: `translate(${source.x},${source.y - 45})`
                });

                group.appendChild(svg("circle", {
                    cx: 0,
                    cy: 0,
                    r: 7,
                    class: "packet-dot"
                }));

                el.packetsLayer.appendChild(group);
            });
    }

    // --------------------------------------------------
    // Router and link failure operations
    // --------------------------------------------------

    async function routerFailure(repair) {
        const name = el.failureRouterSelect.value;

        if (!name) {
            throw new Error("Select a router.");
        }

        const id = backendRouterId(name);

        const path = simulationPath(
            repair ? "/routers/repair" : "/routers/fail"
        );

        const result = await request(path, {
            routerId: id
        });

        if (!result || !result.topology) {
            throw new Error("Backend did not return updated topology.");
        }

        applyTopology(result.topology);

        await refreshAll();

        log(
            repair
                ? `${name} repaired.`
                : `${name} failed.`,
            repair ? "success" : "warning"
        );
    }

    async function linkFailure(repair) {
        const key = el.failureLinkSelect.value;

        if (!key) {
            throw new Error("Select a link.");
        }

        const link = state.links.find(
            (item) => linkKey(item.source, item.destination) === key
        );

        if (!link) {
            throw new Error("Selected link was not found.");
        }

        const path = simulationPath(
            repair ? "/links/repair" : "/links/fail"
        );

        const result = await request(path, {
            source: link.sourceId,
            destination: link.destinationId
        });

        if (!result || !result.topology) {
            throw new Error("Backend did not return updated topology.");
        }

        applyTopology(result.topology);

        await refreshAll();

        log(
            repair
                ? `Link ${link.source} ↔ ${link.destination} restored.`
                : `Link ${link.source} ↔ ${link.destination} failed.`,
            repair ? "success" : "warning"
        );
    }

    // --------------------------------------------------
    // Metrics and backend synchronization
    // --------------------------------------------------

    async function refreshMetrics() {
        const metrics = await request(
            simulationPath("/metrics")
        );

        state.metrics = metrics;

        updateMetrics();
    }

    async function refreshEvents() {
        const result = await request(
            simulationPath("/events")
        );

        renderEvents(result.events || []);
    }

    async function refreshAll() {
        await Promise.all([
            refreshMetrics(),
            refreshEvents(),
            refreshPackets()
        ]);
    }

    function updateMetrics() {
        setText(
            el.routerCount,
            state.routers.length
        );

        setText(
            el.linkCount,
            availableLinks().length
        );

        const metrics = state.metrics || {};

        setText(
            el.deliveredCount,
            metrics.deliveredPackets || 0
        );

        setText(
            el.failedCount,
            state.failedRouters.size
        );

        if (el.deliveredCount?.parentElement) {
            const total = metrics.totalPackets || 0;
            const delivered = metrics.deliveredPackets || 0;
            const lost = metrics.lostPackets || 0;
            const pending = metrics.pendingPackets || 0;

            el.deliveredCount.parentElement.title =
                `Total: ${total}, Delivered: ${delivered}, Lost: ${lost}, Pending: ${pending}`;

            const note = el.deliveredCount.parentElement
                .querySelector(".metric-note");

            if (note) {
                note.textContent =
                    `${delivered}/${total} delivered · ${lost} lost`;
            }
        }
    }

    function formatEvent(event) {
        const detail = event.detail || {};

        switch (event.type) {
            case "simulation_created":
                return "Simulation created.";

            case "packets_created":
                return `${detail.count || 1} packet(s) queued.`;

            case "packets_processed":
                return `${detail.count || 0} packet(s) processed using ${detail.algorithm || "Dijkstra"}.`;

            case "router_failed":
                return `Router R${detail.routerId} failed.`;

            case "router_repaired":
                return `Router R${detail.routerId} repaired.`;

            case "link_failed":
                return `Link R${detail.source} ↔ R${detail.destination} failed.`;

            case "link_repaired":
                return `Link R${detail.source} ↔ R${detail.destination} restored.`;

            default:
                return `Backend event: ${event.type}`;
        }
    }

    function renderEvents(events) {
        el.eventLog.replaceChildren();

        if (!events.length) {
            const empty = document.createElement("p");
            empty.className = "log-empty";
            empty.textContent =
                "Your simulation events will appear here.";

            el.eventLog.appendChild(empty);
            return;
        }

        events.slice(-80).reverse().forEach((event) => {
            const entry = document.createElement("div");
            entry.className = "log-entry info";

            const time = document.createElement("span");
            time.className = "log-time";
            time.textContent = new Date().toLocaleTimeString();

            const message = document.createElement("span");
            message.className = "log-message";
            message.textContent = formatEvent(event);

            entry.append(time, message);

            el.eventLog.appendChild(entry);
        });
    }

    // --------------------------------------------------
    // Algorithm comparison
    // --------------------------------------------------

    async function compareAlgorithms() {
        const source = el.sourceSelect.value;
        const destination = el.destinationSelect.value;

        if (!source || !destination) {
            throw new Error("Select source and destination.");
        }

        const result = await request(
            simulationPath("/compare"),
            {
                source: backendRouterId(source),
                destination: backendRouterId(destination)
            }
        );

        if (!result || !Array.isArray(result.results)) {
            throw new Error("Invalid comparison response.");
        }

        renderComparison(result.results);

        el.comparisonPanel?.classList.remove("hidden");

        log("Algorithm comparison completed.", "success");
    }

    function renderComparison(results) {
        el.comparisonResults.replaceChildren();

        results.forEach((result) => {
            const card = document.createElement("div");
            card.className = "comparison-card";

            const heading = document.createElement("h3");
            heading.textContent = result.algorithm;

            const status = document.createElement("p");

            if (result.reachable === false) {
                status.textContent =
                    result.error || "Destination unreachable.";
            } else {
                status.textContent =
                    `Cost: ${result.cost} · Hops: ${result.hops} · Time: ${Number(result.executionTimeMs || 0).toFixed(3)} ms`;
            }

            const route = document.createElement("p");

            route.textContent = result.reachable === false
                ? "No route"
                : (result.route || []).map(routerName).join(" → ");

            card.append(heading, status, route);

            el.comparisonResults.appendChild(card);
        });
    }

    // --------------------------------------------------
    // Zoom
    // --------------------------------------------------

    function setZoom(value) {
        state.zoom = Math.max(0.5, Math.min(2, value));

        el.networkViewport.style.transform =
            `scale(${state.zoom})`;

        if (el.zoomResetBtn) {
            el.zoomResetBtn.textContent =
                `${Math.round(state.zoom * 100)}%`;
        }
    }

    // --------------------------------------------------
    // Events
    // --------------------------------------------------

    el.simulateBtn.addEventListener("click", () => {
        runAction(simulatePackets);
    });

    el.resetBtn.addEventListener("click", () => {
        runAction(resetSimulation);
    });

    el.failRouterBtn?.addEventListener("click", () => {
        runAction(() => routerFailure(false));
    });

    el.repairRouterBtn?.addEventListener("click", () => {
        runAction(() => routerFailure(true));
    });

    el.breakLinkBtn?.addEventListener("click", () => {
        runAction(() => linkFailure(false));
    });

    el.restoreLinkBtn?.addEventListener("click", () => {
        runAction(() => linkFailure(true));
    });

    el.compareBtn?.addEventListener("click", () => {
        runAction(compareAlgorithms);
    });

    el.closeComparisonBtn?.addEventListener("click", () => {
        el.comparisonPanel.classList.add("hidden");
    });

    el.clearLogBtn?.addEventListener("click", clearLog);

    el.sourceSelect.addEventListener("change", () => {
        state.source = el.sourceSelect.value;
        state.route = [];

        renderAll();
    });

    el.destinationSelect.addEventListener("change", () => {
        state.destination = el.destinationSelect.value;
        state.route = [];

        renderAll();
    });

    el.algorithmSelect.addEventListener("change", () => {
        state.route = [];
        renderAll();
    });

    el.topologySelect.addEventListener("change", () => {
        runAction(createSimulation);
    });

    el.zoomInBtn?.addEventListener("click", () => {
        setZoom(state.zoom + 0.1);
    });

    el.zoomOutBtn?.addEventListener("click", () => {
        setZoom(state.zoom - 0.1);
    });

    el.zoomResetBtn?.addEventListener("click", () => {
        setZoom(1);
    });

    // --------------------------------------------------
    // Start
    // --------------------------------------------------

    clearLog();

    showSummary(
        "Initializing NETROUTE",
        "Connecting to the simulation backend."
    );

    runAction(createSimulation);
});