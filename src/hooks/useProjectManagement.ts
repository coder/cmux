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
      console.log("Loading projects...");
      const projectsList = await window.api.projects.list();
      console.log("Received projects:", projectsList);

      const projectsMap = new Map<string, ProjectConfig>(projectsList.map((p) => [p.path, p]));
      console.log("Created projects map, size:", projectsMap.size);
      setProjects(projectsMap);
    } catch (error) {
      console.error("Failed to load projects:", error);
      setProjects(new Map());
    }
  };

  const addProject = async () => {
    try {
      const selectedPath = await window.api.dialog.selectDirectory();
      if (!selectedPath) return;

      if (projects.has(selectedPath)) {
        console.log("Project already exists:", selectedPath);
        return;
      }

      const result = await window.api.projects.create(selectedPath);
      if (result.success) {
        const newProjects = new Map(projects);
        newProjects.set(selectedPath, result.data);
        setProjects(newProjects);
      } else {
        console.error("Failed to create project:", result.error);
      }
    } catch (error) {
      console.error("Failed to add project:", error);
    }
  };

  const removeProject = async (path: string) => {
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
  };

  return {
    projects,
    setProjects,
    addProject,
    removeProject,
    loadProjects,
  };
}
