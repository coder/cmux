import React, { useState } from "react";
import styled from "@emotion/styled";
import { Message } from "../../types/claude";

const SystemContainer = styled.div`
  margin: 4px 0;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-left: 2px solid #3e3e42;
  border-radius: 2px;
  font-size: 10px;
  color: #808080;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 20px;
`;

const SystemContent = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
`;

const SystemIcon = styled.span`
  font-size: 8px;
`;

const SystemText = styled.span`
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const SystemDetails = styled.span`
  color: #6b6b6b;
  font-weight: normal;
  margin-left: 4px;
`;

const ToggleButton = styled.button`
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #808080;
  padding: 1px 4px;
  border-radius: 2px;
  cursor: pointer;
  font-size: 8px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
  }
`;

const JsonContent = styled.pre`
  margin: 4px 0 0 0;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 9px;
  line-height: 1.3;
  color: #d4d4d4;
  background: rgba(0, 0, 0, 0.2);
  padding: 4px 6px;
  border-radius: 2px;
  overflow-x: auto;
  max-height: 100px;
  overflow-y: auto;
`;

interface SystemMessageProps {
  message: Message;
  className?: string;
}

export const SystemMessage: React.FC<SystemMessageProps> = ({ message, className }) => {
  const [showJson, setShowJson] = useState(false);

  const displayText = formatSystemMessage(message);

  return (
    <div className={className}>
      <SystemContainer>
        <SystemContent>
          <SystemIcon>⚙️</SystemIcon>
          <SystemText>SYSTEM</SystemText>
          <SystemDetails>{displayText}</SystemDetails>
        </SystemContent>
        <ToggleButton onClick={() => setShowJson(!showJson)}>{showJson ? "−" : "+"}</ToggleButton>
      </SystemContainer>

      {showJson && (
        <JsonContent>
          {JSON.stringify(message.metadata?.originalSDKMessage || message, null, 2)}
        </JsonContent>
      )}
    </div>
  );
};

function formatSystemMessage(message: Message): string {
  const original = message.metadata?.originalSDKMessage;

  // Check for specific system message subtypes
  if (original?.subtype === "init") {
    const model = original.model || "unknown";
    const tools = original.tools?.length || 0;
    return `Session initialized • ${model} • ${tools} tools available`;
  }

  if (original?.subtype === "compact_boundary") {
    const metadata = original.compact_metadata || {};
    const trigger = metadata.trigger === "manual" ? "Manual" : "Automatic";
    const preTokens = metadata.pre_tokens || 0;
    return `📦 ${trigger} compaction completed • Compressed ${preTokens.toLocaleString()} tokens`;
  }

  // Default formatting
  if (typeof message.content === "string") {
    return message.content;
  }

  return original?.subtype || "System message";
}
