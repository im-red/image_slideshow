(function enhanceConsole() {
    function makeEnhanced(fnName) {
        const original = console[fnName];
        console[fnName] = function (...args) {
            const timestamp = new Date().toISOString();
            const stack = new Error().stack || "";
            const caller = stack.split("\n")[2]?.trim() ?? "";
            const location = caller.replace(/^at\s+/, '');

            if (fnName === "error") {
                original.call(console, `%c[${timestamp}] [${location}]`, "color: red;", ...args);
            } else if (fnName === "warn") {
                original.call(console, `%c[${timestamp}] [${location}]`, "color: orange;", ...args);
            } else {
                original.call(console, `[${timestamp}] [${location}]`, ...args);
            }
        };
    }
    const targets = ["log", "warn", "error", "info", "debug"];
    targets.forEach(makeEnhanced);
})();