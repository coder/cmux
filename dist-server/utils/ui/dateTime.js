"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTimestamp = formatTimestamp;
exports.formatFullTimestamp = formatFullTimestamp;
/**
 * Formats a Unix timestamp (milliseconds) into a "kitchen" format:
 * - "8:13 PM" if the timestamp is from today
 * - "Oct 23, 8:13 PM" if the timestamp is from a different day
 *
 * @param timestamp Unix timestamp in milliseconds
 * @returns Formatted time string
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    // Check if the timestamp is from today
    const isToday = date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();
    if (isToday) {
        // Format: "8:13 PM"
        return date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
    }
    else {
        // Format: "Oct 23, 8:13 PM"
        return date.toLocaleTimeString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });
    }
}
/**
 * Formats a Unix timestamp (milliseconds) into a full date/time string with high precision.
 * Used for tooltips and detailed views.
 *
 * @param timestamp Unix timestamp in milliseconds
 * @returns Formatted full timestamp string (e.g., "October 23, 2025, 8:13:42 PM")
 */
function formatFullTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });
}
//# sourceMappingURL=dateTime.js.map