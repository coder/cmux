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
      console.log("Loading projects...");
      const projectsList = await window.api.projects.list();
      console.log("Received projects:", projectsList);

      const projectsMap = new Map<string, ProjectConfig>(projectsList);
      console.log("Created projects map, size:", projectsMap.size);
      setProjects(projectsMap);
    } catch (error) {
      console.error("Failed to load projects:", error);
      setProjects(new Map());
    }
  };

  const addProject = useCallback(async () => {
    try {
      const selectedPath = await window.api.dialog.selectDirectory();
      if (!selectedPath) return;

      const result = await window.api.projects.create(selectedPath);
      if (result.success) {
        // Use the normalized path returned from backend
        const { normalizedPath, projectConfig } = result.data;

        // Check if already exists using normalized path
        if (projects.has(normalizedPath)) {
          console.log("Project already exists:", normalizedPath);
          alert("This project has already been added.");
          return;
        }

        const newProjects = new Map(projects);
        newProjects.set(normalizedPath, projectConfig);
        setProjects(newProjects);
      } else {
        // Show error to user
        const errorMessage =
          typeof result.error === "string" ? result.error : "Failed to add project";
        alert(errorMessage);
        console.error("Failed to create project:", result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      alert(`Failed to add project: ${errorMessage}`);
      console.error("Failed to add project:", error);
    }
  }, [projects]);

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
          // Show error to user - they might need to remove workspaces first
          alert(result.error);
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
