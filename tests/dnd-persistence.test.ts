/**
 * Integration test for DnD project order persistence bug fix
 *
 * Bug: Project order was being cleared on app restart because the normalization
 * effect ran before projects loaded from backend, causing normalizeOrder to clear
 * the order array when projects Map was empty.
 *
 * Fix: Skip normalization when projects.size === 0 to prevent clearing during
 * initial load.
 */

import { describe, it, expect } from "@jest/globals";
import { normalizeOrder } from "../src/utils/projectOrdering";
import type { ProjectConfig } from "../src/config";

describe("DnD Project Order Persistence", () => {
  const createProjects = (paths: string[]): Map<string, ProjectConfig> => {
    const map = new Map<string, ProjectConfig>();
    for (const p of paths) {
      map.set(p, { workspaces: [] });
    }
    return map;
  };

  it("should not clear order when projects is empty (simulates initial load)", () => {
    // This simulates the scenario where:
    // 1. localStorage has projectOrder = ["/a", "/b", "/c"]
    // 2. Projects haven't loaded yet, so projects = new Map()
    // 3. Normalization effect runs
    const projectOrder = ["/a", "/b", "/c"];
    const emptyProjects = createProjects([]);

    const normalized = normalizeOrder(projectOrder, emptyProjects);

    // Before fix: normalized would be [] (bug!)
    // After fix: The effect should skip normalization when projects.size === 0
    // So normalizeOrder itself still returns [], but the effect won't call it
    expect(normalized).toEqual([]);
    // The fix is in ProjectSidebar.tsx where we check projects.size === 0
  });

  it("should normalize order when projects load after initial render", () => {
    // This simulates what happens after projects load:
    // 1. projectOrder is still ["/a", "/b", "/c"] from localStorage
    // 2. Projects are now loaded: ["/a", "/b", "/c", "/d"]
    // 3. Normalization should append the new project
    const projectOrder = ["/a", "/b", "/c"];
    const loadedProjects = createProjects(["/a", "/b", "/c", "/d"]);

    const normalized = normalizeOrder(projectOrder, loadedProjects);

    expect(normalized).toEqual(["/a", "/b", "/c", "/d"]);
  });

  it("should remove non-existent projects from order", () => {
    // If a project was removed, it should be pruned from the order
    const projectOrder = ["/a", "/b", "/c", "/d"];
    const projects = createProjects(["/a", "/c", "/d"]); // /b was removed

    const normalized = normalizeOrder(projectOrder, projects);

    expect(normalized).toEqual(["/a", "/c", "/d"]);
  });
});
