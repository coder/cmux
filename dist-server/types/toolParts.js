"use strict";
/**
 * Type definitions for dynamic tool parts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDynamicToolPart = isDynamicToolPart;
exports.isDynamicToolPartAvailable = isDynamicToolPartAvailable;
exports.isDynamicToolPartPending = isDynamicToolPartPending;
function isDynamicToolPart(part) {
    return (typeof part === "object" && part !== null && "type" in part && part.type === "dynamic-tool");
}
function isDynamicToolPartAvailable(part) {
    return isDynamicToolPart(part) && part.state === "output-available";
}
function isDynamicToolPartPending(part) {
    return isDynamicToolPart(part) && part.state === "input-available";
}
//# sourceMappingURL=toolParts.js.map