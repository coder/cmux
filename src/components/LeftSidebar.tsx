import React from "react";
import styled from "@emotion/styled";
import type { ProjectConfig } from "@/config";
import type { WorkspaceMetadata } from "@/types/workspace";
import type { WorkspaceSelection } from "./ProjectSidebar";
import type { WorkspaceState } from "@/hooks/useWorkspaceAggregators";
import type { Secret } from "@/types/secrets";
import ProjectSidebar from "./ProjectSidebar";
import { TitleBar } from "./TitleBar";

const LeftSidebarContainer = styled.div<{ collapsed?: boolean }>`
  width: ${(props) => (props.collapsed ? "32px" : "280px")};
  height: 100vh;
  background: #252526;
  border-right: 1px solid #1e1e1e;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.2s ease;
  overflow: hidden;
`;

interface LeftSidebarProps {
  projects: Map<string, ProjectConfig>;
  workspaceMetadata: Map<string, WorkspaceMetadata>;
  selectedWorkspace: WorkspaceSelection | null;
  onSelectWorkspace: (selection: WorkspaceSelection) => void;
  onAddProject: () => void;
  onAddWorkspace: (projectPath: string) => void;
  onRemoveProject: (path: string) => void;
  onRemoveWorkspace: (
    workspaceId: string,
    options?: { force?: boolean }
  ) => Promise<{ success: boolean; error?: string }>;
  onRenameWorkspace: (
    workspaceId: string,
    newName: string
  ) => Promise<{ success: boolean; error?: string }>;
  getWorkspaceState: (workspaceId: string) => WorkspaceState;
  unreadStatus: Map<string, boolean>;
  onToggleUnread: (workspaceId: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onGetSecrets: (projectPath: string) => Promise<Secret[]>;
  onUpdateSecrets: (projectPath: string, secrets: Secret[]) => Promise<void>;
}

export function LeftSidebar(props: LeftSidebarProps) {
  const { collapsed, ...projectSidebarProps } = props;

  return (
    <LeftSidebarContainer collapsed={collapsed}>
      {!collapsed && <TitleBar />}
      <ProjectSidebar {...projectSidebarProps} collapsed={collapsed} />
    </LeftSidebarContainer>
  );
}
