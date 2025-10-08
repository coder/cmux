"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.modeToToolPolicy = modeToToolPolicy;
/**
 * Get the tool policy for a given UI mode
 */
function modeToToolPolicy(mode) {
    if (mode === "plan") {
        return [
            { regex_match: "file_edit_.*", action: "disable" },
            { regex_match: "compact_summary", action: "disable" },
            { regex_match: "propose_plan", action: "enable" },
        ];
    }
    // exec mode
    return [
        { regex_match: "propose_plan", action: "disable" },
        { regex_match: "compact_summary", action: "disable" },
        { regex_match: "file_edit_.*", action: "enable" },
    ];
}
//# sourceMappingURL=modeUtils.js.map