import React from "react";
import { cn } from "@/lib/utils";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import type { Secret } from "@/types/secrets";
import ProjectSidebar from "./ProjectSidebar";
import { TitleBar } from "./TitleBar";
import { useApp } from "@/contexts/AppContext";
import type { WorkspaceSelection } from "./ProjectSidebar";

interface LeftSidebarProps {
  onSelectWorkspace: (selection: WorkspaceSelection) => void;
  onAddProject: () => void;
  onAddWorkspace: (projectPath: string) => void;
  onRemoveProject: (path: string) => void;
  lastReadTimestamps: Record<string, number>;
  onToggleUnread: (workspaceId: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onGetSecrets: (projectPath: string) => Promise<Secret[]>;
  onUpdateSecrets: (projectPath: string, secrets: Secret[]) => Promise<void>;
  sortedWorkspacesByProject: Map<string, FrontendWorkspaceMetadata[]>;
  workspaceRecency: Record<string, number>;
}

export function LeftSidebar(props: LeftSidebarProps) {
  const { collapsed, onToggleCollapsed, ...projectSidebarProps } = props;

  // Get app-level state from context
  const { projects, workspaceMetadata, selectedWorkspace, removeWorkspace, renameWorkspace } =
    useApp();

  return (
    <>
      {/* Hamburger menu button - only visible on mobile */}
      {collapsed && (
        <button
          onClick={onToggleCollapsed}
          title="Open sidebar"
          aria-label="Open sidebar menu"
          className={cn(
            "hidden max-md:flex fixed top-3 left-3 z-[998]",
            "w-10 h-10 bg-separator border border-border-light rounded-md cursor-pointer",
            "items-center justify-center text-neutral-300 text-xl transition-all duration-200",
            "shadow-[0_2px_4px_rgba(0,0,0,0.3)]",
            "hover:bg-hover hover:border-border-light",
            "active:scale-95"
          )}
        >
          ☰
        </button>
      )}

      {/* Overlay backdrop - only visible on mobile when sidebar is open */}
      <div
        className={cn(
          "hidden max-md:block fixed inset-0 bg-black/50 z-[999] backdrop-blur-sm",
          collapsed && "max-md:hidden"
        )}
        onClick={onToggleCollapsed}
      />

      {/* Sidebar */}
      <div
        className={cn(
          "h-screen bg-separator border-r border-border flex flex-col shrink-0",
          "transition-all duration-200 overflow-hidden relative z-[100]",
          collapsed ? "w-8" : "w-72",
          "max-md:fixed max-md:left-0 max-md:top-0 max-md:w-72 max-md:z-[1000]",
          "max-md:transition-transform max-md:duration-300",
          collapsed
            ? "max-md:-translate-x-full max-md:shadow-none"
            : "max-md:translate-x-0 max-md:shadow-[2px_0_8px_rgba(0,0,0,0.5)]"
        )}
      >
        {!collapsed && <TitleBar />}
        <ProjectSidebar
          {...projectSidebarProps}
          projects={projects}
          workspaceMetadata={workspaceMetadata}
          selectedWorkspace={selectedWorkspace}
          onRemoveWorkspace={removeWorkspace}
          onRenameWorkspace={renameWorkspace}
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
        />
      </div>
    </>
  );
}
