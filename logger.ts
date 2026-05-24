function formatTimestamp(): string {
    const d = new Date();
    const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
        + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
        + `.${pad(d.getMilliseconds(), 3)}`;
}

function parseStackLine(line: string) {
    const regex = /at\s+(?:(.*?)\s+\()?(.+?):(\d+):\d+\)?/;
    const m = line.match(regex);
    if (!m) return { func: "<unknown>", fileUrl: "<unknown>", line: "0" };
    
    return {
        func: m[1] || "<anonymous>",
        fileUrl: m[2],
        line: m[3]
    };
}

function createLogFunction(type: 'log' | 'error' | 'warn' | 'info' | 'success') {
    return (...args: any[]) => {
        const ts = formatTimestamp();
        const stack = new Error().stack?.split("\n") ?? [];
        // Stack index 2 is usually the caller of logger.xxx
        const callerLine = stack[2]?.trim() ?? "";
        const { func, fileUrl, line } = parseStackLine(callerLine);

        // Normalize log type name for prefix
        const fnName = type === 'success' ? 'info' : type;
        const prefix = `${ts} [${fnName.toUpperCase()}] (${fileUrl}:${line}) ${func} -`;

        if (type === "error") {
            console.error(`%c${prefix}`, "color: red;", ...args);
        } else if (type === "warn") {
            console.warn(`%c${prefix}`, "color: orange;", ...args);
        } else if (type === "success") {
            console.log(`%c${prefix}`, "color: #4CAF50;", ...args);
        } else if (type === "info") {
            console.info(`%c${prefix}`, "color: #00BCD4;", ...args);
        } else {
            console.log(prefix, ...args);
        }
    };
}

export const logger = {
    info: createLogFunction('info'),
    error: createLogFunction('error'),
    success: createLogFunction('success'),
    warn: createLogFunction('warn'),
    log: createLogFunction('log'),
};