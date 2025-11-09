(function enhanceConsole() {
    function formatTimestamp() {
        const d = new Date();
        const pad = (n, w = 2) => n.toString().padStart(w, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
            + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
            + `.${pad(d.getMilliseconds(), 3)}`;
    }

    function parseStackLine(line) {
        const regex = /at\s+(?:(.*?)\s+\()?(.+?):(\d+):\d+\)?/;
        const m = line.match(regex);
        if (!m) return { func: "<unknown>", file: "<unknown>", line: "0" };
        return {
            func: m[1] || "<anonymous>",
            file: m[2],
            line: m[3]
        };
    }

    function makeEnhanced(fnName) {
        const original = console[fnName];
        console[fnName] = function (...args) {
            const ts = formatTimestamp();
            const stack = new Error().stack?.split("\n") ?? [];
            const callerLine = stack[2]?.trim() ?? "";
            const { func, file, line } = parseStackLine(callerLine);

            const prefix = `${ts} [${fnName.toUpperCase()}] (${file}:${line}) ${func} -`;

            if (fnName === "error") {
                original.call(console, `%c${prefix}`, "color: red;", ...args);
            } else if (fnName === "warn") {
                original.call(console, `%c${prefix}`, "color: orange;", ...args);
            } else {
                original.call(console, prefix, ...args);
            }
        };
    }
    const targets = ["log", "warn", "error", "info", "debug"];
    targets.forEach(makeEnhanced);
})();