"use strict";
/**
 * Web Worker for calculating token statistics off the main thread
 * This prevents UI blocking during expensive tokenization operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
const tokenStatsCalculator_1 = require("./tokenStatsCalculator");
// Handle incoming calculation requests
self.onmessage = (e) => {
    const { id, messages, model } = e.data;
    try {
        const stats = (0, tokenStatsCalculator_1.calculateTokenStats)(messages, model);
        const response = {
            id,
            success: true,
            stats,
        };
        self.postMessage(response);
    }
    catch (error) {
        const errorResponse = {
            id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
        self.postMessage(errorResponse);
    }
};
//# sourceMappingURL=tokenStats.worker.js.map