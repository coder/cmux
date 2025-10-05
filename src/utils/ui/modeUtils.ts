import type { UIMode } from "@/types/mode";
import type { ToolPolicy } from "../tools/toolPolicy";

/**
 * Get the tool policy for a given UI mode
 */
export function modeToToolPolicy(mode: UIMode): ToolPolicy {
  if (mode === "plan") {
    return [
      { regex_match: "file_edit_.*", action: "disable" },
      { regex_match: "propose_plan", action: "enable" },
    ];
  }

  // exec mode
  return [
    { regex_match: "propose_plan", action: "disable" },
    { regex_match: "file_edit_.*", action: "enable" },
  ];
}
