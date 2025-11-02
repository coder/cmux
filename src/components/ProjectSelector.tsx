import { useMemo } from "react";
import type { ProjectConfig } from "@/types/project";

interface ProjectSelectorProps {
  projects: Map<string, ProjectConfig>;
  selectedProject: string | null;
  onSelect: (projectPath: string) => void;
}

/**
 * ProjectSelector - Dropdown for selecting a project when no workspace exists
 *
 * Shows project list in a dropdown. If only one project exists, it's auto-selected
 * and the dropdown is not shown.
 */
export function ProjectSelector({ projects, selectedProject, onSelect }: ProjectSelectorProps) {
  const projectList = useMemo(() => Array.from(projects.keys()), [projects]);

  // Extract project name from path for display
  const getProjectName = (projectPath: string): string => {
    return projectPath.split("/").pop() ?? projectPath.split("\\").pop() ?? projectPath;
  };

  if (projectList.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-gray-400">
        No projects added. Use Command Palette (⌘⇧P) to add a project.
      </div>
    );
  }

  // If only one project, don't show selector (it's auto-selected by parent)
  if (projectList.length === 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 border-b border-gray-700 p-4">
      <label htmlFor="project-selector" className="text-sm text-gray-400">
        Project:
      </label>
      <select
        id="project-selector"
        className="flex-1 rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-gray-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        value={selectedProject ?? ""}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="" disabled>
          Select a project...
        </option>
        {projectList.map((projectPath) => (
          <option key={projectPath} value={projectPath}>
            {getProjectName(projectPath)}
          </option>
        ))}
      </select>
    </div>
  );
}
