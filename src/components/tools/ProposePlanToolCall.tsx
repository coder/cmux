import React, { useState } from "react";
import styled from "@emotion/styled";
import type { ProposePlanToolArgs, ProposePlanToolResult } from "../../types/tools";
import {
  ToolContainer,
  ToolHeader,
  ExpandIcon,
  ToolName,
  StatusIndicator,
  ToolDetails,
} from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, type ToolStatus } from "./shared/toolUtils";
import { MarkdownRenderer } from "../Messages/MarkdownRenderer";
import { formatKeybind, KEYBINDS } from "../../utils/ui/keybinds";

const PlanContainer = styled.div`
  padding: 12px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-plan-mode), transparent 92%) 0%,
    color-mix(in srgb, var(--color-plan-mode), transparent 95%) 100%
  );
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--color-plan-mode), transparent 70%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
`;

const PlanHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-plan-mode), transparent 80%);
`;

const PlanHeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
`;

const PlanHeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const PlanIcon = styled.div`
  font-size: 16px;
`;

const PlanTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-plan-mode);
  font-family: var(--font-monospace);
`;

const PlanButton = styled.button<{ active?: boolean }>`
  padding: 4px 8px;
  font-size: 10px;
  font-family: var(--font-monospace);
  color: ${(props) => (props.active ? "var(--color-plan-mode)" : "#888")};
  background: ${(props) =>
    props.active ? "color-mix(in srgb, var(--color-plan-mode), transparent 90%)" : "transparent"};
  border: 1px solid
    ${(props) =>
      props.active
        ? "color-mix(in srgb, var(--color-plan-mode), transparent 70%)"
        : "rgba(136, 136, 136, 0.3)"};
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: color-mix(in srgb, var(--color-plan-mode), transparent 85%);
    color: var(--color-plan-mode);
    border-color: color-mix(in srgb, var(--color-plan-mode), transparent 60%);
  }

  &:active {
    transform: translateY(1px);
  }
`;

const RawContent = styled.pre`
  font-family: var(--font-monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
`;

const PlanContent = styled.div`
  font-size: 12px;
  line-height: 1.6;
  color: #d4d4d4;

  // Style markdown headings in plan
  h1,
  h2,
  h3,
  h4 {
    margin-top: 16px;
    margin-bottom: 10px;
    font-weight: 600;
    line-height: 1.3;
  }

  h1,
  h2 {
    color: color-mix(in srgb, var(--color-plan-mode) 60%, var(--color-text) 40%);
  }

  h1 {
    font-size: 18px;
    border-bottom: 2px solid color-mix(in srgb, var(--color-plan-mode), transparent 70%);
    padding-bottom: 6px;
  }

  h2 {
    font-size: 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-plan-mode), transparent 80%);
    padding-bottom: 4px;
  }

  h3,
  h4,
  h5,
  h6 {
    color: var(--color-text);
  }

  h3 {
    font-size: 14px;
    font-weight: 600;
  }

  h4 {
    font-size: 13px;
    font-weight: 500;
  }

  // Style lists
  ul,
  ol {
    margin: 8px 0;
    padding-left: 20px;
  }

  li {
    margin: 4px 0;

    // Code blocks inside list items should have clean spacing
    > pre,
    > div > pre {
      margin-top: 8px;
      margin-bottom: 8px;
      border: none;
    }
  }

  // Style code blocks (multi-line without language)
  // Only target plain pre elements (not SyntaxHighlighter which uses customStyle)
  pre:not([class*="language-"]) {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    padding: 8px;
    margin: 8px 0;
    border: none;
    outline: none;

    code {
      font-family: var(--font-monospace);
      font-size: 11px;
      background: none;
      padding: 0;
      color: inherit;
    }
  }

  // Style all pre elements (including SyntaxHighlighter)
  pre {
    border: none;
    outline: none;
  }

  // Style inline code (only direct children, not code inside pre)
  p > code,
  li > code,
  h1 > code,
  h2 > code,
  h3 > code,
  h4 > code,
  td > code {
    background: color-mix(in srgb, var(--color-plan-mode), transparent 85%);
    padding: 2px 5px;
    border-radius: 3px;
    font-family: var(--font-monospace);
    font-size: 11px;
    color: #4fc3f7;
    border: 1px solid color-mix(in srgb, var(--color-plan-mode), transparent 80%);
  }

  // Style blockquotes
  blockquote {
    border-left: 3px solid var(--color-plan-mode);
    padding-left: 12px;
    margin: 8px 0;
    color: #a0a0a0;
    font-style: italic;
  }
`;

const GuidanceText = styled.div`
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--color-plan-mode), transparent 80%);
  font-size: 11px;
  color: #888;
  font-style: italic;
  line-height: 1.5;
`;

const KeybindDisplay = styled.span`
  font-family: var(--font-primary);
  font-style: normal;
`;

interface ProposePlanToolCallProps {
  args: ProposePlanToolArgs;
  result?: ProposePlanToolResult;
  status?: ToolStatus;
}

export const ProposePlanToolCall: React.FC<ProposePlanToolCallProps> = ({
  args,
  result: _result,
  status = "pending",
}) => {
  const { expanded, toggleExpanded } = useToolExpansion(true); // Expand by default
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const statusDisplay = getStatusDisplay(status);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(args.plan);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <ToolContainer expanded={expanded}>
      <ToolHeader onClick={toggleExpanded}>
        <ExpandIcon expanded={expanded}>▶</ExpandIcon>
        <ToolName>propose_plan</ToolName>
        <StatusIndicator status={status}>{statusDisplay}</StatusIndicator>
      </ToolHeader>

      {expanded && (
        <ToolDetails>
          <PlanContainer>
            <PlanHeader>
              <PlanHeaderLeft>
                <PlanIcon>📋</PlanIcon>
                <PlanTitle>{args.title}</PlanTitle>
              </PlanHeaderLeft>
              <PlanHeaderRight>
                <PlanButton onClick={() => void handleCopy()}>
                  {copied ? "✓ Copied" : "Copy"}
                </PlanButton>
                <PlanButton active={showRaw} onClick={() => setShowRaw(!showRaw)}>
                  {showRaw ? "Show Markdown" : "Show Text"}
                </PlanButton>
              </PlanHeaderRight>
            </PlanHeader>

            {showRaw ? (
              <RawContent>{args.plan}</RawContent>
            ) : (
              <PlanContent>
                <MarkdownRenderer content={args.plan} />
              </PlanContent>
            )}

            {status === "completed" && (
              <GuidanceText>
                Respond with revisions or switch to Exec mode (
                <KeybindDisplay>{formatKeybind(KEYBINDS.TOGGLE_MODE)}</KeybindDisplay>) and ask to
                implement.
              </GuidanceText>
            )}
          </PlanContainer>
        </ToolDetails>
      )}
    </ToolContainer>
  );
};
