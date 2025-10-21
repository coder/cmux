import React from "react";
import styled from "@emotion/styled";
import type { ProjectConfig } from "@/config";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import type { WorkspaceSelection } from "./ProjectSidebar";
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
  position: relative;
  z-index: 100;

  /* Mobile: Sidebar becomes overlay */
  @media (max-width: 768px) {
    position: fixed;
    left: 0;
    top: 0;
    width: 280px;
    z-index: 1000;
    transform: ${(props) => (props.collapsed ? "translateX(-100%)" : "translateX(0)")};
    transition: transform 0.3s ease;
    box-shadow: ${(props) => (props.collapsed ? "none" : "2px 0 8px rgba(0, 0, 0, 0.5)")};
  }
`;

const Overlay = styled.div<{ visible: boolean }>`
  display: none;

  /* Mobile: Show overlay backdrop when sidebar is open */
  @media (max-width: 768px) {
    display: ${(props) => (props.visible ? "block" : "none")};
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
    backdrop-filter: blur(2px);
  }
`;

const HamburgerButton = styled.button`
  display: none;

  /* Mobile: Show hamburger menu */
  @media (max-width: 768px) {
    display: flex;
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 998;
    width: 40px;
    height: 40px;
    background: #252526;
    border: 1px solid #3c3c3c;
    border-radius: 6px;
    cursor: pointer;
    align-items: center;
    justify-content: center;
    color: #cccccc;
    font-size: 20px;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);

    &:hover {
      background: #2a2a2b;
      border-color: #4c4c4c;
    }

    &:active {
      transform: scale(0.95);
    }
  }
`;

interface LeftSidebarProps {
  projects: Map<string, ProjectConfig>;
  workspaceMetadata: Map<string, FrontendWorkspaceMetadata>;
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

  return (
    <>
      {/* Hamburger menu button - only visible on mobile */}
      {collapsed && (
        <HamburgerButton
          onClick={onToggleCollapsed}
          title="Open sidebar"
          aria-label="Open sidebar menu"
        >
          ☰
        </HamburgerButton>
      )}

      {/* Overlay backdrop - only visible on mobile when sidebar is open */}
      <Overlay visible={!collapsed} onClick={onToggleCollapsed} />

      {/* Sidebar */}
      <LeftSidebarContainer collapsed={collapsed}>
        {!collapsed && <TitleBar />}
        <ProjectSidebar
          {...projectSidebarProps}
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
        />
      </LeftSidebarContainer>
    </>
  );
}
