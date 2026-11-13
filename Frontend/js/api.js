
(function () {
    "use strict";

    const BASE_URL = "http://127.0.0.1:8080/api/v1";

    async function request(method, path, body) {
        const url = BASE_URL + "/" + path.replace(/^\/+/, "");

        const options = {
            method,
            headers: {
                Accept: "application/json"
            }
        };

        if (method === "POST") {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body || {});
        }

        let response;

        try {
            response = await fetch(url, options);
        } catch (error) {
            throw new Error(
                "Cannot connect to C++ backend at " + BASE_URL
            );
        }

        const text = await response.text();
        let data = {};

        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error("Backend returned invalid JSON.");
            }
        }

        if (!response.ok) {
            throw new Error(
                data.error ||
                data.message ||
                "Backend request failed: HTTP " + response.status
            );
        }

        return data;
    }

    window.NETROUTE_API = Object.freeze({
        get(path) {
            return request("GET", path);
        },

        post(path, body) {
            return request("POST", path, body);
        },

        getBaseUrl() {
            return BASE_URL;
        }
    });
})();
