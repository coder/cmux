import React, { useMemo } from "react";
import styled from "@emotion/styled";
import type { WorkspaceState } from "@/hooks/useWorkspaceAggregators";
import { MessageRenderer } from "./Messages/MessageRenderer";
import { ChatProvider } from "@/contexts/ChatContext";
import { mergeConsecutiveStreamErrors } from "@/utils/messages/messageUtils";

interface AIViewPreviewProps {
  workspaceId: string;
  projectName: string;
  branch: string;
  workspacePath: string;
  workspaceState: WorkspaceState;
  maxMessages?: number;
  className?: string;
}

const PreviewContainer = styled.div`
  width: 300px; /* match Tooltip width=\"wide\" max-width */
  max-width: min(300px, 80vw);
  max-height: 340px;
  display: flex;
  flex-direction: column;
  background: #1f1f1f;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  color: #d4d4d4;
  overflow: hidden;
  pointer-events: none; /* Keep non-interactive to avoid stealing hover */
`;

const PreviewHeader = styled.div`
  padding: 6px 10px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
  font-size: 12px;
  font-weight: 600;
  color: #cccccc;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const HeaderPath = styled.span`
  font-family: var(--font-monospace);
  color: #888;
  font-weight: 400;
  font-size: 11px;
`;

const PreviewContent = styled.div`
  padding: 10px;
  overflow: hidden;
`;

const MessagesScroll = styled.div`
  overflow: hidden; /* non-interactive */
`;

const FadeBottom = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 36px;
  background: linear-gradient(to bottom, rgba(31, 31, 31, 0), rgba(31, 31, 31, 1));
  pointer-events: none;
`;

const ContentWrapper = styled.div`
  position: relative;
`;

/**
 * Lightweight read-only view of recent messages for hover previews.
 * Uses the same MessageRenderer components to ensure visual parity with AIView.
 */
export const AIViewPreview: React.FC<AIViewPreviewProps> = ({
  workspaceId,
  projectName,
  branch,
  workspacePath,
  workspaceState,
  maxMessages = 6,
  className,
}) => {
  const merged = useMemo(() => mergeConsecutiveStreamErrors(workspaceState.messages), [
    workspaceState.messages,
  ]);

  // Select only the last N messages for brevity
  const messages = useMemo(() => merged.slice(Math.max(0, merged.length - maxMessages)), [
    merged,
    maxMessages,
  ]);

  return (
    <ChatProvider
      messages={messages}
      cmuxMessages={workspaceState.cmuxMessages}
      model={workspaceState.currentModel}
    >
      <PreviewContainer className={className} role="dialog" aria-label="Workspace preview">
        <PreviewHeader>
          <span>
            {projectName} / {branch}
          </span>
          <HeaderPath>{workspacePath}</HeaderPath>
        </PreviewHeader>
        <PreviewContent>
          <ContentWrapper>
            <MessagesScroll>
              {messages.length === 0 ? (
                <div style={{ color: "#6b6b6b", textAlign: "center", padding: "12px 0" }}>
                  No messages yet
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} style={{ marginBottom: 8 }}>
                    <MessageRenderer
                      message={msg}
                      workspaceId={workspaceId}
                      model={workspaceState.currentModel}
                    />
                  </div>
                ))
              )}
            </MessagesScroll>
            <FadeBottom />
          </ContentWrapper>
        </PreviewContent>
      </PreviewContainer>
    </ChatProvider>
  );
};

