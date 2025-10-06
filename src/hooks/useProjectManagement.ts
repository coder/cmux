import { useState, useEffect } from "react";
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
      console.log("Loading projects from config...");
      const config = await window.api.config.load();
      console.log("Received config:", config);

      if (config && Array.isArray(config.projects)) {
        console.log("Projects array length:", config.projects.length);
        const projectsMap = new Map<string, ProjectConfig>(config.projects);
        console.log("Created projects map, size:", projectsMap.size);
        setProjects(projectsMap);
      } else {
        console.log("No projects or invalid format");
        setProjects(new Map());
      }
    } catch (error) {
      console.error("Failed to load config:", error);
      setProjects(new Map());
    }
  };

  const addProject = async () => {
    try {
      const selectedPath = await window.api.dialog.selectDirectory();
      if (selectedPath && !projects.has(selectedPath)) {
        const newProjects = new Map(projects);
        newProjects.set(selectedPath, { path: selectedPath, workspaces: [] });
        setProjects(newProjects);

        await window.api.config.save({
          projects: Array.from(newProjects.entries()),
        });
      }
    } catch (error) {
      console.error("Failed to add project:", error);
    }
  };

  const removeProject = async (path: string) => {
    const newProjects = new Map(projects);
    newProjects.delete(path);
    setProjects(newProjects);

    try {
      await window.api.config.save({
        projects: Array.from(newProjects.entries()),
      });
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  };

  return {
    projects,
    setProjects,
    addProject,
    removeProject,
    loadProjects,
  };
}
