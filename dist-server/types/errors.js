"use strict";
/**
 * Strongly-typed error types for send message operations.
 * This discriminated union allows the frontend to handle different error cases appropriately.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isApiKeyError = isApiKeyError;
exports.isUnknownError = isUnknownError;
/**
 * Type guard to check if error is an API key error
 */
function isApiKeyError(error) {
    return error.type === "api_key_not_found";
}
/**
 * Type guard to check if error is an unknown error
 */
function isUnknownError(error) {
    return error.type === "unknown";
}
//# sourceMappingURL=errors.js.map