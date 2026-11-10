
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);

    const elements = {
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

    const requiredIds = [
        "topologySelect", "algorithmSelect", "sourceSelect",
        "destinationSelect", "networkSvg", "linksLayer",
        "packetsLayer", "routersLayer", "simulateBtn",
        "resetBtn", "routeSummary", "routerDetails", "eventLog"
    ];

    const missingIds = requiredIds.filter((id) => !$(id));

    if (missingIds.length) {
        console.error("NETROUTE Lab: Missing HTML elements:", missingIds);
        return;
    }

    const SVG_NS = "http://www.w3.org/2000/svg";

    const BASE_POSITIONS = {
        R1: { x: 105, y: 105 },
        R2: { x: 300, y: 75 },
        R3: { x: 505, y: 100 },
        R4: { x: 695, y: 170 },
        R5: { x: 115, y: 355 },
        R6: { x: 315, y: 410 },
        R7: { x: 520, y: 360 },
        R8: { x: 690, y: 400 }
    };

    const PRIORITY_MAP = {
        normal: 1,
        high: 5,
        critical: 10
    };

    const state = {
        routerCount: 8,
        simulationId: null,
        sessionRequestSequence: 0,
        routeRequestSequence: 0,
        comparisonRequestSequence: 0,
        routeRequestPending: false,
        comparisonRequestPending: false,
        packetWorkflowSequence: 0,
        packetWorkflowPending: false,
        resetRequestSequence: 0,
        resetRequestPending: false,
        failureRequestSequence: 0,
        failureOperationPending: false,
        topology: null,
        metrics: null,
        packetHistory: [],
        pendingPackets: [],
        eventTimestamps: [],
        routers: [],
        links: [],
        failedRouters: new Set(),
        brokenLinks: new Set(),
        selectedRouter: null,
        source: "",
        destination: "",
        route: [],
        lastRouteResult: null,
        delivered: 0,
        zoom: 1,
        packetAnimation: null,
        packetAnimationSequence: 0,
        animationTimers: [],
        simulationNumber: 0
    };

    function svgElement(tag, attributes = {}, textContent = null) {
        const node = document.createElementNS(SVG_NS, tag);

        Object.entries(attributes).forEach(([key, value]) => {
            node.setAttribute(key, String(value));
        });

        if (textContent !== null) {
            node.textContent = textContent;
        }

        return node;
    }

    function linkKey(a, b) {
        return [a, b].sort().join("-");
    }

    function getRouter(id) {
        return state.routers.find((router) => router.id === id);
    }

    function getLink(a, b) {
        return state.links.find(
            (link) =>
                (link.a === a && link.b === b) ||
                (link.a === b && link.b === a)
        );
    }

    function isLinkAvailable(link) {
        return (
            link.active !== false &&
            !state.brokenLinks.has(linkKey(link.a, link.b)) &&
            !state.failedRouters.has(link.a) &&
            !state.failedRouters.has(link.b)
        );
    }

    function activeLinks() {
        return state.links.filter(isLinkAvailable);
    }

    function neighbors(routerId) {
        return activeLinks()
            .filter((link) => link.a === routerId || link.b === routerId)
            .map((link) => ({
                id: link.a === routerId ? link.b : link.a,
                cost: link.cost,
                link
            }));
    }

    function logEvent(message, type = "info") {
        const empty = elements.eventLog.querySelector(".log-empty");
        if (empty) empty.remove();

        const entry = document.createElement("div");
        entry.className = `log-entry ${type}`;

        const time = document.createElement("span");
        time.className = "log-time";
        time.textContent = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

        const messageNode = document.createElement("span");
        messageNode.className = "log-message";
        messageNode.textContent = message;

        entry.append(time, messageNode);
        elements.eventLog.prepend(entry);

        while (elements.eventLog.children.length > 80) {
            elements.eventLog.lastElementChild.remove();
        }
    }

    function formatBackendEvent(evt) {
        if (!evt || typeof evt !== "object") {
            return { message: "Unknown simulation event.", type: "info" };
        }
        const type = String(evt.type || "");
        const detail = evt.detail || {};

        switch (type) {
            case "simulation_created": {
                const count = detail.routerCount || state.routerCount;
                return {
                    message: `Backend simulation session initialized with ${count} routers.`,
                    type: "info"
                };
            }
            case "packets_created": {
                const count = detail.count !== undefined ? detail.count : 1;
                return {
                    message: `Backend queued ${count} packet${count === 1 ? "" : "s"}.`,
                    type: "info"
                };
            }
            case "packets_processed": {
                const count = detail.count !== undefined ? detail.count : 0;
                const alg = detail.algorithm || "Dijkstra";
                return {
                    message: `Backend processed ${count} packet${count === 1 ? "" : "s"} using ${alg}.`,
                    type: count > 0 ? "success" : "info"
                };
            }
            case "router_failed": {
                return {
                    message: `Router R${detail.routerId} marked offline.`,
                    type: "warning"
                };
            }
            case "router_repaired": {
                return {
                    message: `Router R${detail.routerId} restored online.`,
                    type: "success"
                };
            }
            case "link_failed": {
                return {
                    message: `Link R${detail.source} ↔ R${detail.destination} marked broken.`,
                    type: "warning"
                };
            }
            case "link_repaired": {
                return {
                    message: `Link R${detail.source} ↔ R${detail.destination} restored.`,
                    type: "success"
                };
            }
            default:
                return {
                    message: `Backend event: ${type}`,
                    type: "info"
                };
        }
    }

    function renderBackendEvents(events) {
        if (!elements.eventLog) return;
        if (!Array.isArray(events) || events.length === 0) {
            elements.eventLog.replaceChildren();
            const empty = document.createElement("p");
            empty.className = "log-empty";
            empty.textContent = "Your simulation events will appear here.";
            elements.eventLog.appendChild(empty);
            return;
        }

        const now = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });

        while (state.eventTimestamps.length < events.length) {
            state.eventTimestamps.push(now);
        }

        elements.eventLog.replaceChildren();

        for (let i = events.length - 1; i >= 0; i--) {
            const evt = events[i];
            const item = formatBackendEvent(evt);
            const entry = document.createElement("div");
            entry.className = `log-entry ${item.type}`;

            const time = document.createElement("span");
            time.className = "log-time";
            time.textContent = state.eventTimestamps[i] || now;

            const messageNode = document.createElement("span");
            messageNode.className = "log-message";
            messageNode.textContent = item.message;

            entry.append(time, messageNode);
            elements.eventLog.appendChild(entry);

            if (elements.eventLog.children.length >= 80) break;
        }
    }

    function isCurrentSession(simulationId, sessionSequence) {
        return simulationId === state.simulationId && sessionSequence === state.sessionRequestSequence;
    }

    async function syncEvents(options = {}) {
        const simulationId = options.simulationId || state.simulationId;
        const sessionSequence = Number.isInteger(options.sessionSequence) ? options.sessionSequence : state.sessionRequestSequence;
        if (!simulationId) return false;
        try {
            const data = await window.NETROUTE_API.get("/simulations/" + encodeURIComponent(simulationId) + "/events");
            if (!isCurrentSession(simulationId, sessionSequence)) return false;
            if (!data || !Array.isArray(data.events)) throw new Error("The backend returned an invalid event history response.");
            renderBackendEvents(data.events);
            return true;
        } catch (err) {
            console.warn("Could not sync simulation events:", err);
            if (options.required) throw err;
            return false;
        }
    }

    async function syncMetrics(options = {}) {
        const simulationId = options.simulationId || state.simulationId;
        const sessionSequence = Number.isInteger(options.sessionSequence) ? options.sessionSequence : state.sessionRequestSequence;
        if (!simulationId) return false;
        try {
            const metrics = await window.NETROUTE_API.get("/simulations/" + encodeURIComponent(simulationId) + "/metrics");
            if (!isCurrentSession(simulationId, sessionSequence)) return false;
            if (!metrics || typeof metrics !== "object") throw new Error("The backend returned invalid simulation metrics.");
            state.metrics = metrics;
            updateMetrics();
            return true;
        } catch (err) {
            console.warn("Could not sync simulation metrics:", err);
            if (options.required) throw err;
            return false;
        }
    }

    async function syncPackets(options = {}) {
        const simulationId = options.simulationId || state.simulationId;
        const sessionSequence = Number.isInteger(options.sessionSequence) ? options.sessionSequence : state.sessionRequestSequence;
        if (!simulationId) return false;
        try {
            const [history, pending] = await Promise.all([
                window.NETROUTE_API.get("/simulations/" + encodeURIComponent(simulationId) + "/packets"),
                window.NETROUTE_API.get("/simulations/" + encodeURIComponent(simulationId) + "/packets/pending")
            ]);
            if (!isCurrentSession(simulationId, sessionSequence)) return false;
            if (!history || !Array.isArray(history.packets) || !pending || !Array.isArray(pending.pendingPackets)) {
                throw new Error("The backend returned invalid packet history or pending packet data.");
            }
            state.packetHistory = history.packets;
            state.pendingPackets = pending.pendingPackets;
            return true;
        } catch (err) {
            console.warn("Could not sync packets:", err);
            if (options.required) throw err;
            return false;
        }
    }

    async function fetchSessionSnapshot(simulationId, sessionSequence) {
        const id = encodeURIComponent(simulationId);
        const [session, metrics, events, history, pending] = await Promise.all([
            window.NETROUTE_API.get("/simulations/" + id),
            window.NETROUTE_API.get("/simulations/" + id + "/metrics"),
            window.NETROUTE_API.get("/simulations/" + id + "/events"),
            window.NETROUTE_API.get("/simulations/" + id + "/packets"),
            window.NETROUTE_API.get("/simulations/" + id + "/packets/pending")
        ]);
        if (!isCurrentSession(simulationId, sessionSequence)) return null;
        if (!session || session.id !== simulationId || !session.topology ||
            !Array.isArray(session.topology.routers) || !Array.isArray(session.topology.links) ||
            !metrics || typeof metrics !== "object" || !events || !Array.isArray(events.events) ||
            !history || !Array.isArray(history.packets) || !pending || !Array.isArray(pending.pendingPackets)) {
            throw new Error("The backend returned an incomplete simulation snapshot.");
        }
        return { session, metrics, events, history, pending };
    }

    function applySessionSnapshot(snapshot) {
        state.eventTimestamps = [];
        state.packetHistory = snapshot.history.packets;
        state.pendingPackets = snapshot.pending.pendingPackets;
        state.metrics = snapshot.metrics;
        applyTopology(snapshot.session.topology, snapshot.metrics);
        renderBackendEvents(snapshot.events.events);
        updateMetrics();
        setBackendStatus("Backend Connected");
    }

    function setSummary(title, message, type = "info") {
        elements.routeSummary.className = `route-summary ${type}`;

        const icon = elements.routeSummary.querySelector(".summary-icon");
        const strong = elements.routeSummary.querySelector("strong");
        const paragraph = elements.routeSummary.querySelector("p");

        if (icon) {
            icon.textContent =
                type === "success" ? "✓" :
                type === "error" ? "!" : "?";
        }

        if (strong) strong.textContent = title;
        if (paragraph) paragraph.textContent = message;
    }

    function updateMetrics() {
        elements.routerCount.textContent = state.routers.length;
        elements.linkCount.textContent = activeLinks().length;

        const delivered = state.metrics && Number.isFinite(state.metrics.deliveredPackets)
            ? state.metrics.deliveredPackets
            : 0;
        elements.deliveredCount.textContent = delivered;

        if (state.metrics && Number.isFinite(state.metrics.totalPackets)) {
            const total = state.metrics.totalPackets;
            const lost = state.metrics.lostPackets || 0;
            const pending = state.metrics.pendingPackets || 0;
            const rate = Number.isFinite(state.metrics.deliveryRate)
                ? state.metrics.deliveryRate.toFixed(1)
                : "0.0";

            if (elements.deliveredCount && elements.deliveredCount.parentElement) {
                elements.deliveredCount.parentElement.title =
                    `Total: ${total}, Delivered: ${delivered}, Lost: ${lost}, Pending: ${pending}, Delivery Rate: ${rate}%`;

                const note = elements.deliveredCount.parentElement.querySelector(".metric-note");
                if (note) {
                    if (lost > 0) {
                        note.textContent = `${lost} lost · ${rate}% rate`;
                    } else if (total > 0) {
                        note.textContent = `${delivered}/${total} delivered (100%)`;
                    } else {
                        note.textContent = "Successful simulations";
                    }
                }
            }
        }

        elements.failedCount.textContent = state.failedRouters.size;
    }

    function calculateRouterPositions(routers) {
        if (routers.length === 8) {
            return routers.map((router, index) => {
                const name = String(router.name || ("R" + router.id));
                const saved = BASE_POSITIONS[name];

                if (saved) return { x: saved.x, y: saved.y };

                return {
                    x: 105 + (index % 4) * 195,
                    y: 105 + Math.floor(index / 4) * 250
                };
            });
        }

        const count = routers.length;
        let columns;
        let rows;

        if (count === 4) {
            columns = 2;
            rows = 2;
        } else if (count <= 6) {
            columns = 3;
            rows = 2;
        } else if (count <= 9) {
            columns = 3;
            rows = 3;
        } else if (count <= 12) {
            columns = 4;
            rows = 3;
        } else if (count <= 16) {
            columns = 4;
            rows = 4;
        } else {
            columns = 5;
            rows = Math.ceil(count / 5);
        }

        const left = 110;
        const right = 690;
        const top = 80;
        const bottom = 440;

        return routers.map((router, index) => {
            const row = Math.floor(index / columns);
            const column = index % columns;
            const itemsInThisRow = Math.min(columns, count - row * columns);

            const rowLeft = itemsInThisRow < columns && itemsInThisRow > 1
                ? left + ((columns - itemsInThisRow) * (right - left)) / (2 * (columns - 1))
                : left;
            const rowRight = itemsInThisRow < columns && itemsInThisRow > 1
                ? right - ((columns - itemsInThisRow) * (right - left)) / (2 * (columns - 1))
                : right;

            const x = itemsInThisRow === 1
                ? 400
                : rowLeft + (column * (rowRight - rowLeft)) / (itemsInThisRow - 1);
            const y = rows === 1
                ? 260
                : top + (row * (bottom - top)) / (rows - 1);

            return { x: Math.round(x), y: Math.round(y) };
        });
    }

    function clearEventLog() {
        if (!elements.eventLog) return;

        elements.eventLog.replaceChildren();

        const empty = document.createElement("p");
        empty.className = "log-empty";
        empty.textContent = "Your simulation events will appear here.";
        elements.eventLog.appendChild(empty);
    }

    function setBackendStatus(message) {
        const status = document.querySelector(".lab-status");
        if (!status) return;

        const textNode = Array.from(status.childNodes)
            .find((node) => node.nodeType === Node.TEXT_NODE);

        if (textNode) {
            textNode.nodeValue = " " + message;
        }
    }

    function clearTopologyView(count) {
        invalidateAlgorithmRequests();
        cancelPacketAnimation();

        state.simulationId = null;
        state.packetWorkflowSequence++;
        state.packetWorkflowPending = false;
        state.resetRequestSequence++;
        state.resetRequestPending = false;
        invalidateFailureOperation();
        state.topology = null;
        state.metrics = null;
        state.packetHistory = [];
        state.pendingPackets = [];
        state.eventTimestamps = [];
        state.routerCount = count;
        state.routers = [];
        state.links = [];
        state.failedRouters.clear();
        state.brokenLinks.clear();
        state.selectedRouter = null;
        state.source = "";
        state.destination = "";
        state.route = [];
        state.lastRouteResult = null;
        state.delivered = 0;
        state.simulationNumber = 0;
        state.zoom = 1;

        if (elements.networkViewport) {
            elements.networkViewport.style.transform = "scale(1)";
        }
        if (elements.comparisonPanel) {
            elements.comparisonPanel.classList.add("hidden");
        }
        if (elements.zoomResetBtn) {
            elements.zoomResetBtn.textContent = "100%";
        }

        clearEventLog();
        renderAll();
        updateMetrics();
        syncFailureButtonState();
    }

    function applyTopology(topology, metrics) {
        if (
            !topology ||
            !Array.isArray(topology.routers) ||
            !Array.isArray(topology.links)
        ) {
            throw new Error("The backend response did not contain a valid topology.");
        }

        const positions = calculateRouterPositions(topology.routers);
        const nameById = new Map();
        const routers = topology.routers.map((router, index) => {
            const backendId = Number(router.id);
            const name = String(router.name || ("R" + backendId));
            nameById.set(backendId, name);

            return {
                id: name,
                backendId: backendId,
                active: router.active !== false,
                x: positions[index].x,
                y: positions[index].y
            };
        });

        const links = topology.links.map((link) => {
            const source = nameById.get(Number(link.source));
            const destination = nameById.get(Number(link.destination));

            if (!source || !destination) {
                throw new Error("The backend topology contains a link to an unknown router.");
            }

            return {
                a: source,
                b: destination,
                sourceId: Number(link.source),
                destinationId: Number(link.destination),
                cost: Number(link.cost),
                active: link.active !== false
            };
        });

        state.topology = topology;
        state.metrics = metrics || {};
        state.routerCount = Number(topology.routerCount) || routers.length;
        state.routers = routers;
        state.links = links;
        state.failedRouters = new Set(
            routers.filter((router) => !router.active).map((router) => router.id)
        );
        state.brokenLinks = new Set(
            links.filter((link) => !link.active).map((link) => linkKey(link.a, link.b))
        );
        state.route = [];
        state.selectedRouter = null;
        state.source = routers[0] ? routers[0].id : "";
        state.destination = routers.length ? routers[routers.length - 1].id : "";
        state.delivered = Number(state.metrics && state.metrics.deliveredPackets) || 0;
        state.zoom = 1;

        if (elements.networkViewport) {
            elements.networkViewport.style.transform = "scale(1)";
        }
        if (elements.zoomResetBtn) {
            elements.zoomResetBtn.textContent = "100%";
        }

        renderAll();
        updateMetrics();
        syncFailureButtonState();
        setSummary(
            "Network ready",
            "Backend topology loaded with " + routers.length +
                " routers and " + links.length + " links."
        );
    }

    async function createSimulation(count) {
        const requestSequence = ++state.sessionRequestSequence;
        clearTopologyView(count);
        setBackendStatus("Connecting to Backend");
        setSummary(
            "Connecting to backend",
            "Creating a " + count + "-router simulation session."
        );

        try {
            const result = await window.NETROUTE_API.post(
                "/simulations",
                { routerCount: count }
            );

            if (requestSequence !== state.sessionRequestSequence) {
                return;
            }

            if (!result || !result.id || !result.topology) {
                throw new Error("The backend response is missing its simulation ID or topology.");
            }

            state.simulationId = String(result.id);
            state.eventTimestamps = [];
            applyTopology(result.topology, result.metrics);
            setBackendStatus("Backend Connected");
            await syncEvents();
            await syncPackets();
            updateMetrics();
        } catch (error) {
            if (requestSequence !== state.sessionRequestSequence) {
                return;
            }

            state.simulationId = null;
            state.metrics = null;
            setBackendStatus("Backend Unavailable");
            setSummary(
                "Backend connection failed",
                error && error.message
                    ? error.message
                    : "Could not create a backend simulation session.",
                "error"
            );
            logEvent(
                error && error.message
                    ? error.message
                    : "Could not create a backend simulation session.",
                "error"
            );
        }
    }

    function renderAll() {
        renderSelects();
        renderLinks();
        renderRouters();
        renderRouterDetails(state.selectedRouter);
        renderFailureLinkOptions();
    }

    function renderSelects() {
        const routerIds = state.routers.map((router) => router.id);

        const previousSource = state.source;
        const previousDestination = state.destination;
        const previousFailureRouter = elements.failureRouterSelect
            ? elements.failureRouterSelect.value
            : "";

        fillSelect(elements.sourceSelect, routerIds, previousSource, (id) =>
            state.failedRouters.has(id)
        );

        fillSelect(elements.destinationSelect, routerIds, previousDestination, (id) =>
            state.failedRouters.has(id)
        );

        if (elements.failureRouterSelect) {
            // Failed routers remain available here so they can be repaired.
            fillSelect(
                elements.failureRouterSelect,
                routerIds,
                previousFailureRouter,
                () => false
            );
        }

        state.source = elements.sourceSelect.value;
        state.destination = elements.destinationSelect.value;
    }

    function fillSelect(select, values, preferredValue, isDisabled) {
        if (!select) return;

        const previous = values.includes(preferredValue)
            ? preferredValue
            : values[0];

        select.replaceChildren();

        values.forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = state.failedRouters.has(value)
                ? `${value} (Failed)`
                : value;
            option.disabled = Boolean(isDisabled(value));
            select.appendChild(option);
        });

        if (
            previous &&
            values.includes(previous) &&
            !isDisabled(previous)
        ) {
            select.value = previous;
        } else {
            const firstUsable = values.find((value) => !isDisabled(value));
            if (firstUsable) select.value = firstUsable;
        }
    }

    function renderFailureLinkOptions() {
        if (!elements.failureLinkSelect) return;

        const previous = elements.failureLinkSelect.value;
        elements.failureLinkSelect.replaceChildren();

        state.links.forEach((link) => {
            const key = linkKey(link.a, link.b);
            const broken = state.brokenLinks.has(key);
            const option = document.createElement("option");

            option.value = key;
            option.textContent =
                `${link.a} ↔ ${link.b} · Cost ${link.cost}` +
                (broken ? " (Broken)" : "");

            elements.failureLinkSelect.appendChild(option);
        });

        if (state.links.some((link) => linkKey(link.a, link.b) === previous)) {
            elements.failureLinkSelect.value = previous;
        }
    }

    function renderLinks() {
        elements.linksLayer.replaceChildren();

        state.links.forEach((link) => {
            const from = getRouter(link.a);
            const to = getRouter(link.b);

            if (!from || !to) return;

            const key = linkKey(link.a, link.b);
            const broken = !isLinkAvailable(link);
            const isBrokenManually = state.brokenLinks.has(key);
            const isRouteLink = state.route.some(
                (step, index) =>
                    index < state.route.length - 1 &&
                    linkKey(step, state.route[index + 1]) === key
            );

            const group = svgElement("g", {
                class: "link-group",
                "data-link": key
            });

            const line = svgElement("line", {
                x1: from.x,
                y1: from.y,
                x2: to.x,
                y2: to.y,
                class:
                    "network-link" +
                    (isRouteLink && !broken ? " route-link" : "") +
                    (broken ? " failed-link" : ""),
                "data-link": key
            });

            group.appendChild(line);

            const middleX = (from.x + to.x) / 2;
            const middleY = (from.y + to.y) / 2;

            const label = svgElement("text", {
                x: middleX,
                y: middleY - 8,
                class:
                    "link-cost" +
                    (isRouteLink && !broken ? " route-cost" : "") +
                    (broken ? " failed-cost" : "")
            }, String(link.cost));

            group.appendChild(label);
            elements.linksLayer.appendChild(group);
        });
    }

    function renderRouters() {
        elements.routersLayer.replaceChildren();

        // Computer endpoints are visual aids only. Routing still starts
        // and ends at routers in this frontend demonstration.
        if (state.routers.length) {
            renderComputerEndpoint(35, 230, "SOURCE PC", state.routers[0].id);
            renderComputerEndpoint(
                765,
                250,
                "DESTINATION PC",
                state.routers[state.routers.length - 1].id
            );
        }

        state.routers.forEach((router) => {
            const failed = state.failedRouters.has(router.id) || !router.active;
            const isSelected = state.selectedRouter === router.id;
            const isOnRoute = state.route.includes(router.id);
            const isSource = state.source === router.id;
            const isDestination = state.destination === router.id;

            const classes = [
                "router-node",
                failed ? "failed" : "",
                isSelected || isOnRoute ? "selected" : "",
                isSource ? "source-node" : "",
                isDestination ? "destination-node" : ""
            ].filter(Boolean).join(" ");

            const group = svgElement("g", {
                class: classes,
                transform: `translate(${router.x}, ${router.y})`,
                tabindex: "0",
                role: "button",
                "aria-label": `${router.id}${failed ? ", failed" : ""}`,
                "data-router": router.id
            });

            // Router antennas
            group.appendChild(svgElement("line", {
                x1: -13, y1: -14, x2: -18, y2: -27,
                class: "router-antenna"
            }));

            group.appendChild(svgElement("line", {
                x1: 13, y1: -14, x2: 18, y2: -27,
                class: "router-antenna"
            }));

            group.appendChild(svgElement("circle", {
                cx: -18, cy: -28, r: 2.7,
                fill: failed ? "#fb7185" : "#818cf8"
            }));

            group.appendChild(svgElement("circle", {
                cx: 18, cy: -28, r: 2.7,
                fill: failed ? "#fb7185" : "#818cf8"
            }));

            // Router body
            group.appendChild(svgElement("rect", {
                x: -29, y: -17, width: 58, height: 34,
                rx: 7, class: "router-shell"
            }));

            group.appendChild(svgElement("rect", {
                x: -25, y: -13, width: 50, height: 8,
                rx: 3, class: "router-top"
            }));

            // Ports
            [-17, -7, 3, 13].forEach((x) => {
                group.appendChild(svgElement("rect", {
                    x, y: 7, width: 6, height: 4, rx: 1,
                    class: "router-port"
                }));
            });

            // Status indicator
            group.appendChild(svgElement("circle", {
                cx: 20, cy: -9, r: 2.5,
                class: "router-led"
            }));

            group.appendChild(svgElement("text", {
                x: 0, y: 37, class: "router-label"
            }, router.id));

            const status = failed
                ? "FAILED"
                : isSource
                    ? "SOURCE"
                    : isDestination
                        ? "DESTINATION"
                        : "ONLINE";

            group.appendChild(svgElement("text", {
                x: 0, y: 50, class: "router-sub-label"
            }, status));

            group.addEventListener("click", () => selectRouter(router.id));

            group.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectRouter(router.id);
                }
            });

            elements.routersLayer.appendChild(group);
        });
    }

    function renderComputerEndpoint(x, y, label, routerId) {
        const group = svgElement("g", {
            class: "computer-endpoint",
            "aria-label": `${label}, illustrative endpoint`
        });

        const target = getRouter(routerId);

        if (target) {
            const startX = x < target.x ? x + 15 : x - 15;

            group.appendChild(svgElement("line", {
                x1: startX,
                y1: y,
                x2: target.x + (x < target.x ? -30 : 30),
                y2: target.y,
                class: "endpoint-link"
            }));
        }

        group.appendChild(svgElement("rect", {
            x: x - 14, y: y - 12,
            width: 28, height: 21,
            rx: 3, class: "computer-icon"
        }));

        group.appendChild(svgElement("rect", {
            x: x - 10, y: y - 8,
            width: 20, height: 13,
            rx: 1, class: "computer-screen"
        }));

        group.appendChild(svgElement("path", {
            d: `M ${x} ${y + 9} v 5 m -6 0 h 12`,
            class: "computer-stand"
        }));

        group.appendChild(svgElement("text", {
            x, y: y + 29, class: "endpoint-label"
        }, label));

        elements.routersLayer.appendChild(group);
    }

    function selectRouter(routerId) {
        state.selectedRouter = routerId;
        renderRouters();
        renderRouterDetails(routerId);
    }

    function renderRouterDetails(routerId) {
        if (!elements.routerDetails) return;

        if (!routerId) {
            elements.routerDetails.innerHTML =
                '<p class="empty-state">Select a router in the network to see its details.</p>';
            return;
        }

        const router = getRouter(routerId);
        if (!router) return;

        const failed = state.failedRouters.has(routerId) || !router.active;

        const availableNeighbors = neighbors(routerId);
        const allNeighbors = state.links
            .filter((link) => link.a === routerId || link.b === routerId)
            .map((link) => {
                const other = link.a === routerId ? link.b : link.a;
                return {
                    id: other,
                    cost: link.cost,
                    active: isLinkAvailable(link)
                };
            });

        const statusText = failed ? "Failed" : "Operational";

        const neighborsMarkup = allNeighbors.length
            ? allNeighbors.map((neighbor) => `
                <span class="neighbor-chip ${neighbor.active ? "" : "inactive"}">
                    ${neighbor.id} · ${neighbor.cost}
                    ${neighbor.active ? "" : " · Offline"}
                </span>
            `).join("")
            : '<span class="empty-state">No connected routers.</span>';

        elements.routerDetails.innerHTML = `
            <div class="router-detail-top">
                <div class="router-detail-icon" aria-hidden="true">⌘</div>
                <div>
                    <h3>${router.id}</h3>
                    <p>Network routing device</p>
                    <span class="device-status ${failed ? "failed" : ""}">
                        ${statusText}
                    </span>
                </div>
            </div>

            <div class="router-detail-stats">
                <div class="router-detail-stat">
                    <span>Total links</span>
                    <strong>${allNeighbors.length}</strong>
                </div>
                <div class="router-detail-stat">
                    <span>Active links</span>
                    <strong>${availableNeighbors.length}</strong>
                </div>
                <div class="router-detail-stat">
                    <span>Route member</span>
                    <strong>${state.route.includes(routerId) ? "Yes" : "No"}</strong>
                </div>
            </div>

            <p class="neighbor-heading">CONNECTED ROUTERS</p>
            <div class="neighbor-list">${neighborsMarkup}</div>
        `;
    }

    function describePath(path) {
        return path.join(" → ");
    }

    function invalidateAlgorithmRequests() {
        state.routeRequestSequence++;
        state.comparisonRequestSequence++;
        state.routeRequestPending = false;
        state.comparisonRequestPending = false;
        syncFailureButtonState();
        cancelPacketAnimation();
    }

    function clearRouteHighlights() {
        cancelPacketAnimation();
        state.route = [];
        state.lastRouteResult = null;
        renderLinks();
        renderRouters();
        renderRouterDetails(state.selectedRouter);
    }

    function getAlgorithmName(algorithm) {
        const names = {
            bfs: "BFS",
            dfs: "DFS",
            dijkstra: "Dijkstra",
            adaptive: "Adaptive"
        };
        return names[algorithm] || "";
    }

    function mapBackendRoute(route, sourceRouter, destinationRouter) {
        if (!Array.isArray(route) || route.length < 2) {
            throw new Error("The backend returned an invalid or empty route.");
        }

        const displayedRoute = route.map((backendId) => {
            const id = Number(backendId);
            const router = state.routers.find((item) => item.backendId === id);

            if (!Number.isInteger(id) || !router) {
                throw new Error("The backend route contains an unknown router ID.");
            }

            return router.id;
        });

        if (
            displayedRoute[0] !== sourceRouter.id ||
            displayedRoute[displayedRoute.length - 1] !== destinationRouter.id
        ) {
            throw new Error("The backend route does not match the selected endpoints.");
        }

        return displayedRoute;
    }

    function validateRouteResult(result, expectedAlgorithm, sourceRouter, destinationRouter) {
        if (!result || typeof result !== "object") {
            throw new Error("The backend returned an invalid route response.");
        }

        if (result.reachable === false) {
            return {
                reachable: false,
                algorithm: result.algorithm || expectedAlgorithm,
                error: typeof result.error === "string" && result.error.length > 0
                    ? result.error
                    : "No route exists between " + sourceRouter.id + " and " + destinationRouter.id + "."
            };
        }

        if (
            result.reachable !== true ||
            result.algorithm !== expectedAlgorithm ||
            !Number.isFinite(result.cost) ||
            !Number.isInteger(result.hops) ||
            result.hops < 0 ||
            !Number.isFinite(result.executionTimeMs) ||
            result.executionTimeMs < 0
        ) {
            throw new Error("The backend route response is missing valid route metrics.");
        }

        if (!Array.isArray(result.route) || result.route.length < 2) {
            return {
                reachable: false,
                algorithm: result.algorithm || expectedAlgorithm,
                error: "No route exists between " + sourceRouter.id + " and " + destinationRouter.id + ". The backend returned an empty route."
            };
        }

        const route = mapBackendRoute(result.route, sourceRouter, destinationRouter);
        if (result.hops !== result.route.length - 1) {
            throw new Error("The backend route hop count does not match its route.");
        }

        return {
            reachable: true,
            algorithm: result.algorithm,
            route: route,
            cost: result.cost,
            hops: result.hops,
            executionTimeMs: result.executionTimeMs
        };
    }

    function routeSummary(result, priority) {
        return describePath(result.route) +
            " · " + result.hops + " hop(s)" +
            " · Cost " + result.cost +
            " · " + result.algorithm +
            " · " + result.executionTimeMs + " ms" +
            " · Reachable" +
            " · " + priority + " priority";
    }

    function isCurrentRouteRequest(requestSequence, sessionSequence, simulationId, source, destination, algorithm) {
        return requestSequence === state.routeRequestSequence &&
            sessionSequence === state.sessionRequestSequence &&
            simulationId === state.simulationId &&
            source === elements.sourceSelect.value &&
            destination === elements.destinationSelect.value &&
            algorithm === elements.algorithmSelect.value;
    }

    function normalizePacketOutcomes(processedPackets) {
        const historyById = new Map(state.packetHistory.map((packet) => [Number(packet.id), packet]));
        const seen = new Set();
        return processedPackets.map((packet) => {
            if (!packet || !Number.isInteger(packet.id) || seen.has(packet.id)) {
                throw new Error("The backend returned an invalid or duplicate packet result.");
            }
            seen.add(packet.id);
            const history = historyById.get(packet.id);
            if (!history || history.status !== packet.status || history.delivered !== packet.delivered) {
                throw new Error("Packet #" + packet.id + " does not match refreshed backend history.");
            }
            if (packet.status === "lost" && packet.delivered === false) {
                return { id: packet.id, delivered: false, status: "lost",
                    error: typeof packet.error === "string" ? packet.error : "The backend marked this packet lost." };
            }
            if (packet.status !== "delivered" || packet.delivered !== true) {
                throw new Error("Packet #" + packet.id + " has an unsupported backend status.");
            }

            const source = state.routers.find((router) => router.backendId === Number(packet.source));
            const destination = state.routers.find((router) => router.backendId === Number(packet.destination));
            if (!source || !destination) throw new Error("Packet #" + packet.id + " refers to an unknown router.");
            const route = mapBackendRoute(packet.route, source, destination);
            for (const routerId of route) {
                const router = getRouter(routerId);
                if (!router || !router.active || state.failedRouters.has(routerId)) {
                    throw new Error("Packet #" + packet.id + " route contains an unavailable router.");
                }
            }
            for (let i = 1; i < route.length; i++) {
                const link = getLink(route[i - 1], route[i]);
                if (!link || !isLinkAvailable(link)) {
                    throw new Error("Packet #" + packet.id + " route contains an unavailable link.");
                }
            }
            const cost = Number.isFinite(packet.cost) ? packet.cost : null;
            return {
                id: packet.id, delivered: true, status: "delivered", route, cost,
                summary: describePath(route) + " · " + (route.length - 1) + " hop(s)" +
                    (cost === null ? "" : " · Cost " + cost) + " · " +
                    (packet.algorithm || "Backend route") + " · Packet #" + packet.id + " delivered"
            };
        });
    }

    async function simulateRoute() {
        if (state.routeRequestPending || state.packetWorkflowPending) return;
        if (state.failureOperationPending || state.resetRequestPending) {
            setSummary("Network update in progress", "Wait for failure, repair, or reset to finish.", "error");
            return;
        }

        const simulationId = state.simulationId;
        const sessionSequence = state.sessionRequestSequence;
        const source = elements.sourceSelect.value;
        const destination = elements.destinationSelect.value;
        const selectedAlgorithm = elements.algorithmSelect.value;
        const algorithm = getAlgorithmName(selectedAlgorithm);
        const sourceRouter = state.routers.find((router) => router.id === source);
        const destinationRouter = state.routers.find((router) => router.id === destination);

        if (!simulationId || !sourceRouter || !destinationRouter || !algorithm ||
            sourceRouter.backendId === destinationRouter.backendId) {
            clearRouteHighlights();
            setSummary("Invalid simulation selection", "Select an active session, different routers, and a supported algorithm.", "error");
            return;
        }

        const requestSequence = ++state.routeRequestSequence;
        const workflowSequence = ++state.packetWorkflowSequence;
        const priorityKey = elements.prioritySelect ? elements.prioritySelect.value : "normal";
        const priority = PRIORITY_MAP[priorityKey] || 1;
        let createdPacket = null;
        state.routeRequestPending = true;
        state.packetWorkflowPending = true;
        syncFailureButtonState();
        cancelPacketAnimation();
        clearRouteHighlights();
        setSummary("Simulating packet route", "Creating and processing packet from " + source + " to " + destination + " via " + algorithm + ".");

        try {
            const created = await window.NETROUTE_API.post(
                "/simulations/" + encodeURIComponent(simulationId) + "/packets",
                { source: sourceRouter.backendId, destination: destinationRouter.backendId, priority, count: 1 }
            );
            if (!created || !Array.isArray(created.packets) || created.packets.length !== 1 ||
                !Number.isInteger(created.packets[0].id)) {
                throw new Error("The backend did not return the created packet record.");
            }
            createdPacket = created.packets[0];

            // Keep packet creation and processing paired even when the selection changes.
            // Results for an old session are processed there but never painted in a new session.
            if (isCurrentSession(simulationId, sessionSequence)) {
                await syncPackets({ simulationId, sessionSequence });
            }

            const processed = [];
            let passes = 0;
            do {
                if (++passes > 100) throw new Error("The backend still has pending packets after 100 processing passes.");
                const result = await window.NETROUTE_API.post(
                    "/simulations/" + encodeURIComponent(simulationId) + "/packets/process",
                    { algorithm }
                );
                if (!result || !Array.isArray(result.packets)) {
                    throw new Error("The backend returned an invalid packet processing response.");
                }
                processed.push(...result.packets);
                if (!isCurrentSession(simulationId, sessionSequence)) return;
                const refreshed = await syncPackets({ simulationId, sessionSequence, required: true });
                if (!refreshed) return;
            } while (state.pendingPackets.length > 0);

            if (!isCurrentSession(simulationId, sessionSequence)) return;
            const refreshed = await Promise.all([
                syncPackets({ simulationId, sessionSequence, required: true }),
                syncMetrics({ simulationId, sessionSequence, required: true }),
                syncEvents({ simulationId, sessionSequence, required: true })
            ]);
            if (refreshed.some((ok) => !ok)) return;
            if (!isCurrentRouteRequest(requestSequence, sessionSequence, simulationId, source, destination, selectedAlgorithm)) return;
            if (processed.length === 0) throw new Error("The backend returned no processed packet results.");

            const outcomes = normalizePacketOutcomes(processed);
            if (!outcomes.some((packet) => packet.id === createdPacket.id)) {
                throw new Error("The newly created packet was not included in the processing results.");
            }
            const delivered = outcomes.filter((packet) => packet.delivered);
            const lost = outcomes.filter((packet) => !packet.delivered);
            const summary = "Processed " + outcomes.length + " packet" + (outcomes.length === 1 ? "" : "s") +
                ": " + delivered.length + " delivered, " + lost.length + " lost.";

            delivered.forEach((packet) => logEvent(
                "Packet #" + packet.id + " delivered via " + describePath(packet.route) +
                    (packet.cost === null ? "." : " (cost " + packet.cost + ")."), "success"));
            lost.forEach((packet) => logEvent("Packet #" + packet.id + " lost: " + packet.error, "error"));
            state.simulationNumber += outcomes.length;

            if (delivered.length) {
                state.route = delivered[0].route;
                state.lastRouteResult = delivered[delivered.length - 1];
                renderLinks();
                renderRouters();
                renderRouterDetails(state.selectedRouter);
            } else {
                clearRouteHighlights();
            }

            if (delivered.length === 0) {
                setSummary("Packets lost", summary + " " + lost.map((p) => "#" + p.id + ": " + p.error).join(" "), "error");
            } else if (lost.length || outcomes.length > 1) {
                setSummary("Packet processing complete", summary, lost.length ? "error" : "success");
            } else {
                setSummary("Packet delivered", delivered[0].summary, "success");
            }
            animatePackets(delivered, requestSequence, sessionSequence, {
                title: delivered.length > 1 ? "Packets processed" : "Packet delivered",
                message: summary,
                type: lost.length ? "error" : "success"
            });
        } catch (error) {
            if (isCurrentSession(simulationId, sessionSequence)) {
                await Promise.all([
                    syncPackets({ simulationId, sessionSequence }),
                    syncMetrics({ simulationId, sessionSequence }),
                    syncEvents({ simulationId, sessionSequence })
                ]);
            }
            if (!isCurrentRouteRequest(requestSequence, sessionSequence, simulationId, source, destination, selectedAlgorithm)) return;
            clearRouteHighlights();
            const message = String(error && (error.backendError || error.message) || "The packet simulation request failed.");
            const unreachable = /unreachable|no route/i.test(message);
            setSummary(unreachable ? "Route unreachable" : "Simulation failed",
                unreachable ? "The backend could not deliver the packet because no route is available. " + message : message,
                "error");
            logEvent(message, "error");
        } finally {
            if (workflowSequence === state.packetWorkflowSequence) {
                state.packetWorkflowPending = false;
                if (requestSequence === state.routeRequestSequence &&
                    sessionSequence === state.sessionRequestSequence && simulationId === state.simulationId) {
                    state.routeRequestPending = false;
                }
                syncFailureButtonState();
            }
        }
    }

    function animatePackets(packetResults, requestSequence, sessionSequence, completion) {
        if (!Array.isArray(packetResults) || packetResults.length === 0) {
            elements.packetsLayer.replaceChildren();
            return;
        }
        const animationSequence = ++state.packetAnimationSequence;
        const initial = getRouter(packetResults[0].route[0]);
        if (!initial) return;
        const dot = svgElement("circle", { cx: initial.x, cy: initial.y, r: 6, class: "packet-dot" });
        elements.packetsLayer.replaceChildren(dot);
        let packetIndex = 0;
        let hopIndex = 0;

        function current() {
            return animationSequence === state.packetAnimationSequence &&
                requestSequence === state.routeRequestSequence &&
                sessionSequence === state.sessionRequestSequence;
        }
        function nextPacket() {
            if (!current()) return;
            if (packetIndex >= packetResults.length) {
                elements.packetsLayer.replaceChildren();
                setSummary(completion.title, completion.message, completion.type);
                renderRouterDetails(state.selectedRouter);
                return;
            }
            const result = packetResults[packetIndex];
            const points = result.route.map(getRouter);
            if (points.some((point) => !point)) {
                cancelPacketAnimation();
                setSummary("Packet animation stopped", "A router in the confirmed route is unavailable in this session.", "error");
                return;
            }
            state.route = result.route;
            state.lastRouteResult = result;
            renderLinks();
            renderRouters();
            renderRouterDetails(state.selectedRouter);
            dot.setAttribute("cx", points[0].x);
            dot.setAttribute("cy", points[0].y);
            hopIndex = 0;
            nextHop(points);
        }
        function nextHop(points) {
            if (!current()) return;
            if (hopIndex >= points.length - 1) {
                packetIndex++;
                nextPacket();
                return;
            }
            const from = points[hopIndex];
            const to = points[hopIndex + 1];
            const start = performance.now();
            const priority = elements.prioritySelect && elements.prioritySelect.value;
            const duration = priority === "critical" ? 260 : priority === "high" ? 380 : 520;
            function frame(now) {
                if (!dot.isConnected || !current()) return;
                const progress = Math.min((now - start) / duration, 1);
                dot.setAttribute("cx", from.x + (to.x - from.x) * progress);
                dot.setAttribute("cy", from.y + (to.y - from.y) * progress);
                if (progress < 1) state.packetAnimation = requestAnimationFrame(frame);
                else { hopIndex++; nextHop(points); }
            }
            state.packetAnimation = requestAnimationFrame(frame);
        }
        nextPacket();
    }

    function cancelPacketAnimation() {
        state.packetAnimationSequence++;
        if (state.packetAnimation !== null) {
            cancelAnimationFrame(state.packetAnimation);
            state.packetAnimation = null;
        }

        state.animationTimers.forEach(clearTimeout);
        state.animationTimers = [];

        if (elements.packetsLayer) {
            elements.packetsLayer.replaceChildren();
        }
    }

    function syncFailureButtonState() {
        const noSession = !state.simulationId;
        const networkBusy = state.failureOperationPending || state.resetRequestPending ||
            state.packetWorkflowPending || state.routeRequestPending || state.comparisonRequestPending;
        [elements.failRouterBtn, elements.repairRouterBtn, elements.breakLinkBtn, elements.restoreLinkBtn]
            .forEach((button) => { if (button) button.disabled = noSession || networkBusy; });
        if (elements.simulateBtn) {
            elements.simulateBtn.disabled = noSession || state.failureOperationPending ||
                state.resetRequestPending || state.packetWorkflowPending || state.routeRequestPending;
        }
        if (elements.compareBtn) {
            elements.compareBtn.disabled = noSession || state.failureOperationPending ||
                state.resetRequestPending || state.packetWorkflowPending || state.comparisonRequestPending;
        }
        if (elements.resetBtn) {
            elements.resetBtn.disabled = noSession || state.failureOperationPending ||
                state.resetRequestPending || state.packetWorkflowPending || state.routeRequestPending;
        }
    }

    function invalidateFailureOperation() {
        state.failureRequestSequence++;
        state.failureOperationPending = false;
        syncFailureButtonState();
    }

    function applyFailureTopology(response) {
        const topology = response && response.topology;
        if (
            !topology ||
            !Array.isArray(topology.routers) ||
            !Array.isArray(topology.links) ||
            topology.routers.length !== state.routers.length ||
            topology.links.length !== state.links.length
        ) {
            throw new Error("The backend did not return a complete current topology.");
        }

        const routerStates = new Map();
        topology.routers.forEach((router) => {
            const id = Number(router.id);
            if (!Number.isInteger(id) || typeof router.active !== "boolean" || routerStates.has(id)) {
                throw new Error("The backend returned invalid router status data.");
            }
            routerStates.set(id, router.active);
        });

        const nameById = new Map(state.routers.map((router) => [router.backendId, router.id]));
        const linkStates = new Map();
        topology.links.forEach((link) => {
            const sourceId = Number(link.source);
            const destinationId = Number(link.destination);
            const key = [sourceId, destinationId].sort((a, b) => a - b).join(":");
            if (
                !Number.isInteger(sourceId) ||
                !Number.isInteger(destinationId) ||
                typeof link.active !== "boolean" ||
                !Number.isFinite(Number(link.cost)) ||
                linkStates.has(key)
            ) {
                throw new Error("The backend returned invalid link status data.");
            }
            linkStates.set(key, { active: link.active, cost: Number(link.cost) });
        });

        const routers = state.routers.map((router) => {
            if (!routerStates.has(router.backendId)) {
                throw new Error("The backend topology omitted router " + router.id + ".");
            }
            return { ...router, active: routerStates.get(router.backendId) };
        });
        const links = state.links.map((link) => {
            const key = [link.sourceId, link.destinationId].sort((a, b) => a - b).join(":");
            const status = linkStates.get(key);
            if (!status || !nameById.has(link.sourceId) || !nameById.has(link.destinationId)) {
                throw new Error("The backend topology omitted a current network link.");
            }
            return { ...link, active: status.active, cost: status.cost };
        });

        state.topology = topology;
        state.routers = routers;
        state.links = links;
        state.failedRouters = new Set(
            routers.filter((router) => !router.active).map((router) => router.id)
        );
        state.brokenLinks = new Set(
            links.filter((link) => !link.active).map((link) => linkKey(link.a, link.b))
        );
        if (response.metrics && typeof response.metrics === "object") {
            state.metrics = response.metrics;
        }

        clearRouteHighlights();
        renderAll();
        updateMetrics();
    }

    function isCurrentFailureRequest(requestSequence, sessionSequence, simulationId) {
        return requestSequence === state.failureRequestSequence &&
            sessionSequence === state.sessionRequestSequence &&
            simulationId === state.simulationId;
    }

    async function runFailureAction(action, selectedValue) {
        if (state.failureOperationPending) return;
        if (state.routeRequestPending || state.packetWorkflowPending || state.comparisonRequestPending || state.resetRequestPending) {
            setSummary(
                "Request in progress",
                "Wait for the current route or comparison request to finish before changing the network.",
                "error"
            );
            return;
        }

        const simulationId = state.simulationId;
        const sessionSequence = state.sessionRequestSequence;
        if (!simulationId) {
            setSummary("Backend unavailable", "Create a backend simulation session first.", "error");
            return;
        }

        const isRouter = action === "fail-router" || action === "repair-router";
        const entity = isRouter
            ? state.routers.find((router) => router.id === selectedValue)
            : state.links.find((link) => linkKey(link.a, link.b) === selectedValue);
        if (!entity) {
            setSummary(
                "Invalid selection",
                isRouter ? "Select a router from the current topology." : "Select a link from the current topology.",
                "error"
            );
            return;
        }

        const isRepair = action === "repair-router" || action === "restore-link";
        const endpoint = isRouter
            ? "/routers/" + (isRepair ? "repair" : "fail")
            : "/links/" + (isRepair ? "repair" : "fail");
        const body = isRouter
            ? { routerId: entity.backendId }
            : { source: entity.sourceId, destination: entity.destinationId };
        const displayName = isRouter ? entity.id : entity.a + " ↔ " + entity.b;
        const priorState = isRouter ? entity.active : entity.active;
        const desiredState = isRepair;
        const requestSequence = ++state.failureRequestSequence;

        cancelPacketAnimation();
        state.failureOperationPending = true;
        syncFailureButtonState();
        setSummary(
            "Updating backend network",
            (isRouter ? "Sending router " : "Sending link ") +
                (isRepair ? "repair" : "failure") + " request for " + displayName + "."
        );

        try {
            const response = await window.NETROUTE_API.post(
                "/simulations/" + encodeURIComponent(simulationId) + endpoint,
                body
            );
            if (!isCurrentFailureRequest(requestSequence, sessionSequence, simulationId)) return;

            applyFailureTopology(response);
            const confirmedEntity = isRouter
                ? state.routers.find((router) => router.id === selectedValue)
                : state.links.find((link) => linkKey(link.a, link.b) === selectedValue);
            const confirmedState = confirmedEntity && confirmedEntity.active;
            if (confirmedState !== desiredState) {
                throw new Error("The backend response did not confirm the requested network state.");
            }

            const actionLabel = isRouter ? "Router" : "Link";
            const stateLabel = isRepair ? "restored" : "failed";
            const already = priorState === desiredState;
            let detail = already
                ? actionLabel + " " + displayName + " was already " + (isRepair ? "active" : "unavailable") + "; the backend confirmed its state."
                : actionLabel + " " + displayName + " " + stateLabel + " in the backend network.";

            if (!isRouter && isRepair &&
                (state.failedRouters.has(entity.a) || state.failedRouters.has(entity.b))) {
                detail += " It remains unavailable while an endpoint router is offline.";
            }

            setSummary(
                already ? actionLabel + " state confirmed" : actionLabel + " " + stateLabel,
                detail,
                "success"
            );
        } catch (error) {
            if (!isCurrentFailureRequest(requestSequence, sessionSequence, simulationId)) return;

            // A lost response can occur after the server committed a mutation.
            // Re-read the same session before reporting its current visualization.
            try {
                const current = await window.NETROUTE_API.get(
                    "/simulations/" + encodeURIComponent(simulationId)
                );
                if (!isCurrentFailureRequest(requestSequence, sessionSequence, simulationId)) return;
                applyFailureTopology(current);
            } catch (refreshError) {
                // Keep the last confirmed frontend state if the session cannot be read.
            }

            const message = error && error.message
                ? error.message
                : "The backend network operation failed.";
            setSummary("Network update failed", message, "error");
        } finally {
            if (isCurrentFailureRequest(requestSequence, sessionSequence, simulationId)) {
                state.failureOperationPending = false;
                syncFailureButtonState();
            }
        }
    }

    function failSelectedRouter() {
        runFailureAction("fail-router", elements.failureRouterSelect && elements.failureRouterSelect.value);
    }

    function repairSelectedRouter() {
        runFailureAction("repair-router", elements.failureRouterSelect && elements.failureRouterSelect.value);
    }

    function breakSelectedLink() {
        runFailureAction("break-link", elements.failureLinkSelect && elements.failureLinkSelect.value);
    }

    function restoreSelectedLink() {
        runFailureAction("restore-link", elements.failureLinkSelect && elements.failureLinkSelect.value);
    }

    function isCurrentComparisonRequest(requestSequence, sessionSequence, simulationId, source, destination) {
        return requestSequence === state.comparisonRequestSequence &&
            sessionSequence === state.sessionRequestSequence &&
            simulationId === state.simulationId &&
            source === elements.sourceSelect.value &&
            destination === elements.destinationSelect.value;
    }

    function renderComparisonResult(result, source, destination) {
        const row = document.createElement("div");
        row.className = "comparison-row" + (result.reachable ? "" : " unreachable");

        const top = document.createElement("div");
        top.className = "comparison-row-top";

        const title = document.createElement("strong");
        title.textContent = result.algorithm;

        const costNode = document.createElement("span");
        costNode.className = "comparison-cost" + (result.reachable ? "" : " unreachable");
        costNode.textContent = result.reachable
            ? "Cost: " + result.cost
            : "Unreachable";

        top.append(title, costNode);

        const description = document.createElement("p");
        if (result.reachable) {
            description.textContent =
                "Route: " + describePath(result.route) +
                " · Hops: " + result.hops +
                " · Execution: " + result.executionTimeMs + " ms" +
                " · Reachable: Yes";
        } else {
            description.textContent =
                "No route exists from " + (source || state.source) + " to " + (destination || state.destination) +
                " · Cost: N/A · Hops: N/A · Execution: N/A" +
                (result.error ? " (" + result.error + ")" : "");
        }

        row.append(top, description);
        elements.comparisonResults.appendChild(row);
    }

    async function compareAlgorithms() {
        if (state.comparisonRequestPending) return;
        if (state.packetWorkflowPending || state.resetRequestPending) {
            setSummary("Network update in progress", "Wait for packet processing or reset to finish before comparing.", "error");
            return;
        }
        if (state.failureOperationPending) {
            setSummary("Network update in progress", "Wait for the backend failure or repair request to finish.", "error");
            return;
        }

        const simulationId = state.simulationId;
        const sessionSequence = state.sessionRequestSequence;
        const source = elements.sourceSelect.value;
        const destination = elements.destinationSelect.value;
        const sourceRouter = state.routers.find((router) => router.id === source);
        const destinationRouter = state.routers.find((router) => router.id === destination);

        if (!simulationId) {
            setSummary("Backend unavailable",
                "Wait for a backend simulation session before comparing algorithms.", "error");
            return;
        }
        if (!sourceRouter || !destinationRouter) {
            setSummary("Invalid router selection",
                "Select a source and destination from the current topology.", "error");
            return;
        }
        if (sourceRouter.backendId === destinationRouter.backendId) {
            setSummary("Choose different routers",
                "Select different source and destination routers before comparing.", "error");
            return;
        }

        const requestSequence = ++state.comparisonRequestSequence;
        state.comparisonRequestPending = true;
        elements.compareBtn.disabled = true;
        elements.comparisonResults.replaceChildren();
        elements.comparisonPanel.classList.remove("hidden");
        setSummary("Comparing algorithms", "Waiting for backend comparison results.");

        try {
            const response = await window.NETROUTE_API.post(
                "/simulations/" + encodeURIComponent(simulationId) + "/compare",
                {
                    source: sourceRouter.backendId,
                    destination: destinationRouter.backendId
                }
            );

            if (!isCurrentComparisonRequest(
                requestSequence, sessionSequence, simulationId, source, destination
            )) return;

            if (!response || !Array.isArray(response.results)) {
                throw new Error("The backend returned an invalid comparison response.");
            }

            const required = ["BFS", "DFS", "Dijkstra", "Adaptive"];
            const resultsByAlgorithm = new Map();

            response.results.forEach((item) => {
                if (
                    !item ||
                    !required.includes(item.algorithm) ||
                    resultsByAlgorithm.has(item.algorithm) ||
                    typeof item.reachable !== "boolean"
                ) {
                    throw new Error("The backend comparison contains an invalid algorithm result.");
                }

                if (item.reachable) {
                    if (
                        !Number.isFinite(item.cost) ||
                        !Number.isInteger(item.hops) ||
                        item.hops < 0 ||
                        !Number.isFinite(item.executionTimeMs) ||
                        item.executionTimeMs < 0
                    ) {
                        throw new Error(
                            "The backend comparison is missing route metrics for " +
                            item.algorithm + "."
                        );
                    }

                    const route = mapBackendRoute(
                        item.route, sourceRouter, destinationRouter
                    );
                    if (item.hops !== item.route.length - 1) {
                        throw new Error(
                            "The backend hop count does not match the " +
                            item.algorithm + " route."
                        );
                    }

                    resultsByAlgorithm.set(item.algorithm, {
                        algorithm: item.algorithm,
                        reachable: true,
                        route: route,
                        cost: item.cost,
                        hops: item.hops,
                        executionTimeMs: item.executionTimeMs
                    });
                } else {
                    resultsByAlgorithm.set(item.algorithm, {
                        algorithm: item.algorithm,
                        reachable: false,
                        error: typeof item.error === "string" ? item.error : ""
                    });
                }
            });

            if (required.some((name) => !resultsByAlgorithm.has(name))) {
                throw new Error("The backend comparison did not return all four algorithms.");
            }

            required.forEach((name) => {
                renderComparisonResult(resultsByAlgorithm.get(name), source, destination);
            });

            logEvent(
                "Compared BFS, DFS, Dijkstra, and Adaptive from " +
                    source + " to " + destination + ".",
                "success"
            );
            setSummary(
                "Comparison complete",
                "Displayed backend results for all four routing algorithms.",
                "success"
            );
        } catch (error) {
            if (!isCurrentComparisonRequest(
                requestSequence, sessionSequence, simulationId, source, destination
            )) return;

            const message = error && error.message
                ? error.message
                : "The backend comparison request failed.";
            elements.comparisonResults.replaceChildren();
            setSummary("Comparison failed", message, "error");
            logEvent(message, "error");
        } finally {
            if (
                requestSequence === state.comparisonRequestSequence &&
                sessionSequence === state.sessionRequestSequence &&
                simulationId === state.simulationId
            ) {
                state.comparisonRequestPending = false;
                elements.compareBtn.disabled = false;
            }
        }
    }

    function isCurrentReset(requestSequence, sessionSequence, simulationId) {
        return requestSequence === state.resetRequestSequence &&
            sessionSequence === state.sessionRequestSequence && simulationId === state.simulationId;
    }

    async function resetNetwork() {
        if (state.resetRequestPending) return;
        if (state.routeRequestPending || state.packetWorkflowPending || state.failureOperationPending) {
            setSummary("Request in progress", "Wait for packet processing or network failure/repair to finish before resetting.", "error");
            return;
        }
        const simulationId = state.simulationId;
        const sessionSequence = state.sessionRequestSequence;
        if (!simulationId) {
            setSummary("Backend unavailable", "Create a backend simulation session before resetting.", "error");
            return;
        }

        const requestSequence = ++state.resetRequestSequence;
        state.resetRequestPending = true;
        invalidateAlgorithmRequests();
        cancelPacketAnimation();
        clearRouteHighlights();
        if (elements.comparisonPanel) elements.comparisonPanel.classList.add("hidden");
        if (elements.networkViewport) elements.networkViewport.style.transform = "scale(1)";
        if (elements.zoomResetBtn) elements.zoomResetBtn.textContent = "100%";
        syncFailureButtonState();
        setSummary("Resetting network", "Waiting for backend confirmation for this simulation.");

        try {
            const response = await window.NETROUTE_API.post(
                "/simulations/" + encodeURIComponent(simulationId) + "/reset", {}
            );
            if (!isCurrentReset(requestSequence, sessionSequence, simulationId)) return;
            if (!response || response.id !== simulationId || response.reset !== true) {
                throw new Error("The backend did not confirm that this simulation was reset.");
            }
            const snapshot = await fetchSessionSnapshot(simulationId, sessionSequence);
            if (!isCurrentReset(requestSequence, sessionSequence, simulationId)) return;
            if (!snapshot) return;
            applySessionSnapshot(snapshot);
            setSummary("Network ready", "Backend topology, metrics, packets, and events are synchronized after reset.", "success");
        } catch (error) {
            if (!isCurrentReset(requestSequence, sessionSequence, simulationId)) return;
            let refreshed = false;
            try {
                const snapshot = await fetchSessionSnapshot(simulationId, sessionSequence);
                if (!isCurrentReset(requestSequence, sessionSequence, simulationId)) return;
                if (snapshot) {
                    applySessionSnapshot(snapshot);
                    refreshed = true;
                }
            } catch (refreshError) {
                console.warn("Could not reload backend state after reset failure:", refreshError);
            }
            setBackendStatus(refreshed ? "Backend Connected" : "Backend Unavailable");
            setSummary(
                "Reset failed",
                (error && error.message ? error.message : "The backend reset request failed.") +
                    (refreshed
                        ? " Current backend state was reloaded; reset success was not confirmed."
                        : " The last confirmed topology remains displayed because current backend state could not be loaded."),
                "error"
            );
        } finally {
            if (isCurrentReset(requestSequence, sessionSequence, simulationId)) {
                state.resetRequestPending = false;
                syncFailureButtonState();
            }
        }
    }

    function setZoom(nextZoom) {
        state.zoom = Math.min(1.5, Math.max(0.65, nextZoom));

        if (elements.networkViewport) {
            elements.networkViewport.style.transform = `scale(${state.zoom})`;
        }

        if (elements.zoomResetBtn) {
            elements.zoomResetBtn.textContent =
                `${Math.round(state.zoom * 100)}%`;
        }
    }

    elements.simulateBtn.addEventListener("click", simulateRoute);
    elements.resetBtn.addEventListener("click", resetNetwork);

    if (elements.failRouterBtn) {
        elements.failRouterBtn.addEventListener("click", failSelectedRouter);
    }

    if (elements.repairRouterBtn) {
        elements.repairRouterBtn.addEventListener("click", repairSelectedRouter);
    }

    if (elements.breakLinkBtn) {
        elements.breakLinkBtn.addEventListener("click", breakSelectedLink);
    }

    if (elements.restoreLinkBtn) {
        elements.restoreLinkBtn.addEventListener("click", restoreSelectedLink);
    }

    if (elements.compareBtn) {
        elements.compareBtn.addEventListener("click", compareAlgorithms);
    }

    if (elements.closeComparisonBtn) {
        elements.closeComparisonBtn.addEventListener("click", () => {
            elements.comparisonPanel.classList.add("hidden");
        });
    }

    if (elements.clearLogBtn) {
        elements.clearLogBtn.addEventListener("click", () => {
            elements.eventLog.replaceChildren();

            const empty = document.createElement("p");
            empty.className = "log-empty";
            empty.textContent = "Your simulation events will appear here.";

            elements.eventLog.appendChild(empty);
        });
    }

    if (elements.zoomInBtn) {
        elements.zoomInBtn.addEventListener("click", () => {
            setZoom(state.zoom + 0.1);
        });
    }

    if (elements.zoomOutBtn) {
        elements.zoomOutBtn.addEventListener("click", () => {
            setZoom(state.zoom - 0.1);
        });
    }

    if (elements.zoomResetBtn) {
        elements.zoomResetBtn.addEventListener("click", () => {
            setZoom(1);
        });
    }

    elements.topologySelect.addEventListener("change", () => {
        const count = Number(elements.topologySelect.value);

        if (Number.isInteger(count) && count >= 4 && count <= 20) {
            createSimulation(count);
        }
    });

    elements.algorithmSelect.addEventListener("change", () => {
        invalidateAlgorithmRequests();
        clearRouteHighlights();
        setSummary("Ready to simulate", "Choose a source, destination, and algorithm.");
    });

    elements.sourceSelect.addEventListener("change", () => {
        invalidateAlgorithmRequests();
        clearRouteHighlights();
        state.source = elements.sourceSelect.value;

        if (state.source === state.destination) {
            const alternative = state.routers.find(
                (router) =>
                    router.id !== state.source &&
                    !state.failedRouters.has(router.id)
            );

            if (alternative) {
                state.destination = alternative.id;
            }
        }

        renderSelects();
        renderLinks();
        renderRouters();
        renderRouterDetails(state.selectedRouter);
        setSummary("Ready to simulate", "Choose a source, destination, and algorithm.");
    });

    elements.destinationSelect.addEventListener("change", () => {
        invalidateAlgorithmRequests();
        clearRouteHighlights();
        state.destination = elements.destinationSelect.value;

        if (state.destination === state.source) {
            const alternative = state.routers.find(
                (router) =>
                    router.id !== state.destination &&
                    !state.failedRouters.has(router.id)
            );

            if (alternative) {
                state.source = alternative.id;
            }
        }

        renderSelects();
        renderLinks();
        renderRouters();
        renderRouterDetails(state.selectedRouter);
        setSummary("Ready to simulate", "Choose a source, destination, and algorithm.");
    });

    syncFailureButtonState();
    createSimulation(Number(elements.topologySelect.value) || 8);
});
