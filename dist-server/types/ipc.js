"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChatChannel = exports.IPC_CHANNELS = void 0;
exports.isCaughtUpMessage = isCaughtUpMessage;
exports.isStreamError = isStreamError;
exports.isDeleteMessage = isDeleteMessage;
exports.isStreamStart = isStreamStart;
exports.isStreamDelta = isStreamDelta;
exports.isStreamEnd = isStreamEnd;
exports.isStreamAbort = isStreamAbort;
exports.isToolCallStart = isToolCallStart;
exports.isToolCallDelta = isToolCallDelta;
exports.isToolCallEnd = isToolCallEnd;
exports.isReasoningDelta = isReasoningDelta;
exports.isReasoningEnd = isReasoningEnd;
// Import constants from constants module (single source of truth)
const ipc_constants_1 = require("../constants/ipc-constants");
Object.defineProperty(exports, "IPC_CHANNELS", { enumerable: true, get: function () { return ipc_constants_1.IPC_CHANNELS; } });
Object.defineProperty(exports, "getChatChannel", { enumerable: true, get: function () { return ipc_constants_1.getChatChannel; } });
// Type guard for caught up messages
function isCaughtUpMessage(msg) {
    return "type" in msg && msg.type === "caught-up";
}
// Type guard for stream error messages
function isStreamError(msg) {
    return "type" in msg && msg.type === "stream-error";
}
// Type guard for delete messages
function isDeleteMessage(msg) {
    return "type" in msg && msg.type === "delete";
}
// Type guard for stream start events
function isStreamStart(msg) {
    return "type" in msg && msg.type === "stream-start";
}
// Type guard for stream delta events
function isStreamDelta(msg) {
    return "type" in msg && msg.type === "stream-delta";
}
// Type guard for stream end events
function isStreamEnd(msg) {
    return "type" in msg && msg.type === "stream-end";
}
// Type guard for stream abort events
function isStreamAbort(msg) {
    return "type" in msg && msg.type === "stream-abort";
}
// Type guard for tool call start events
function isToolCallStart(msg) {
    return "type" in msg && msg.type === "tool-call-start";
}
// Type guard for tool call delta events
function isToolCallDelta(msg) {
    return "type" in msg && msg.type === "tool-call-delta";
}
// Type guard for tool call end events
function isToolCallEnd(msg) {
    return "type" in msg && msg.type === "tool-call-end";
}
// Type guard for reasoning delta events
function isReasoningDelta(msg) {
    return "type" in msg && msg.type === "reasoning-delta";
}
// Type guard for reasoning end events
function isReasoningEnd(msg) {
    return "type" in msg && msg.type === "reasoning-end";
}
//# sourceMappingURL=ipc.js.map