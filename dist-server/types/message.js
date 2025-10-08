"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCmuxMessage = createCmuxMessage;
// Helper to create a simple text message
function createCmuxMessage(id, role, content, metadata, additionalParts) {
    const textPart = content
        ? [{ type: "text", text: content, state: "done" }]
        : [];
    const parts = [...textPart, ...(additionalParts ?? [])];
    // Validation: User messages must have at least one part with content
    // This prevents empty user messages from being created (defense-in-depth)
    if (role === "user" && parts.length === 0) {
        throw new Error("Cannot create user message with no parts. Empty messages should be rejected upstream.");
    }
    return {
        id,
        role,
        metadata,
        parts,
    };
}
//# sourceMappingURL=message.js.map