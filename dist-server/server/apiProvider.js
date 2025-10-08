"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWebMode = exports.api = void 0;
const webApi_1 = require("./webApi");
// Check if we're running in Electron or Web
const isElectron = typeof window !== "undefined" && "api" in window && window.api !== undefined;
// Platform detection for web mode
const getPlatform = () => {
    if (typeof navigator === "undefined")
        return "unknown";
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac"))
        return "darwin";
    if (ua.includes("win"))
        return "win32";
    if (ua.includes("linux"))
        return "linux";
    return "unknown";
};
// Create a mock versions object for web mode
const webVersions = {
    node: "N/A",
    chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || "N/A",
    electron: "N/A (Web Mode)",
};
// Export the appropriate API based on environment
exports.api = isElectron
    ? window.api
    : {
        ...webApi_1.webApi,
        platform: getPlatform(),
        versions: webVersions,
    };
exports.isWebMode = !isElectron;
// For debugging
if (typeof window !== "undefined") {
    console.log(`Running in ${isElectron ? "Electron" : "Web"} mode`);
    console.log("Platform:", exports.api.platform);
    console.log("Versions:", exports.api.versions);
}
//# sourceMappingURL=apiProvider.js.map