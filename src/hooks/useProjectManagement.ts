import { useState, useEffect, useCallback } from "react";
import type { ProjectConfig } from "@/config";

/**
 * Hook to manage projects (add, remove, load)
 */
export function useProjectManagement() {
  const [projects, setProjects] = useState<Map<string, ProjectConfig>>(new Map());
  const [error, setError] = useState<string | null>(null);

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

  const addProject = useCallback(async () => {
    setError(null);
    try {
      const selectedPath = await window.api.dialog.selectDirectory();
      if (!selectedPath) return;

      const result = await window.api.projects.create(selectedPath);
      if (result.success) {
        // Use the normalized path returned from backend
        const { normalizedPath, projectConfig } = result.data;

        // Check if already exists using normalized path
        if (projects.has(normalizedPath)) {
          setError("This project has already been added.");
          return;
        }

        const newProjects = new Map(projects);
        newProjects.set(normalizedPath, projectConfig);
        setProjects(newProjects);
      } else {
        // Show error to user
        const errorMessage =
          typeof result.error === "string" ? result.error : "Failed to add project";
        setError(errorMessage);
        console.error("Failed to create project:", result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      setError(`Failed to add project: ${errorMessage}`);
      console.error("Failed to add project:", error);
    }
  }, [projects]);

  const removeProject = useCallback(
    async (path: string) => {
      setError(null);
      try {
        const result = await window.api.projects.remove(path);
        if (result.success) {
          const newProjects = new Map(projects);
          newProjects.delete(path);
          setProjects(newProjects);
        } else {
          console.error("Failed to remove project:", result.error);
          // Show error to user - they might need to remove workspaces first
          setError(result.error);
        }
      } catch (error) {
        console.error("Failed to remove project:", error);
      }
    },
    [projects]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    projects,
    setProjects,
    addProject,
    removeProject,
    loadProjects,
    error,
    clearError,
  };
}
