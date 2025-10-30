import { useState, useEffect, useCallback } from "react";
import type { ProjectConfig } from "@/config";

/**
 * Hook to manage projects (add, remove, load)
 */
export function useProjectManagement() {
  const [projects, setProjects] = useState<Map<string, ProjectConfig>>(new Map());

  useEffect(() => {
    void loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const projectsList = await window.api.projects.list();
      const projectsMap = new Map<string, ProjectConfig>(projectsList);
      setProjects(projectsMap);
    } catch (error) {
      console.error("Failed to load projects:", error);
      setProjects(new Map());
    }
  };

  const addProject = useCallback(
    (normalizedPath: string, projectConfig: ProjectConfig) => {
      // Add successfully created project to local state
      const newProjects = new Map(projects);
      newProjects.set(normalizedPath, projectConfig);
      setProjects(newProjects);
    },
    [projects]
  );

  const removeProject = useCallback(
    async (path: string) => {
      try {
        const result = await window.api.projects.remove(path);
        if (result.success) {
          const newProjects = new Map(projects);
          newProjects.delete(path);
          setProjects(newProjects);
        } else {
          console.error("Failed to remove project:", result.error);
          // TODO: Show error to user in UI - they might need to remove workspaces first
        }
      } catch (error) {
        console.error("Failed to remove project:", error);
      }
    },
    [projects]
  );

  return {
    projects,
    setProjects,
    addProject,
    removeProject,
    loadProjects,
  };
}
