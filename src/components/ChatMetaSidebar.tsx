import React from "react";
import styled from "@emotion/styled";
import { usePersistedState } from "@/hooks/usePersistedState";
import { CostsTab } from "./ChatMetaSidebar/CostsTab";
import { ToolsTab } from "./ChatMetaSidebar/ToolsTab";

const SidebarContainer = styled.div`
  width: 300px;
  background: #252526;
  border-left: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  @container (max-width: 949px) {
    display: none;
  }
`;

const TabBar = styled.div`
  display: flex;
  background: #2d2d2d;
  border-bottom: 1px solid #3e3e42;
`;

interface TabButtonProps {
  active: boolean;
}

const TabButton = styled.button<TabButtonProps>`
  flex: 1;
  padding: 10px 15px;
  background: ${(props) => (props.active ? "#252526" : "transparent")};
  color: ${(props) => (props.active ? "#ffffff" : "#888888")};
  border: none;
  border-bottom: 2px solid ${(props) => (props.active ? "#007acc" : "transparent")};
  cursor: pointer;
  font-family: var(--font-primary);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover {
    background: ${(props) => (props.active ? "#252526" : "#2d2d2d")};
    color: ${(props) => (props.active ? "#ffffff" : "#cccccc")};
  }
`;

const TabContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 15px;
`;

type TabType = "costs" | "tools";

interface ChatMetaSidebarProps {
  workspaceId: string;
}

export const ChatMetaSidebar: React.FC<ChatMetaSidebarProps> = ({ workspaceId }) => {
  const [selectedTab, setSelectedTab] = usePersistedState<TabType>(
    `chat-meta-sidebar-tab:${workspaceId}`,
    "costs"
  );

  return (
    <SidebarContainer>
      <TabBar>
        <TabButton active={selectedTab === "costs"} onClick={() => setSelectedTab("costs")}>
          Costs
        </TabButton>
        <TabButton active={selectedTab === "tools"} onClick={() => setSelectedTab("tools")}>
          Tools
        </TabButton>
      </TabBar>
      <TabContent>
        {selectedTab === "costs" && <CostsTab />}
        {selectedTab === "tools" && <ToolsTab />}
      </TabContent>
    </SidebarContainer>
  );
};
