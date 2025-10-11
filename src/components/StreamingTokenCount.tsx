import React from "react";
import styled from "@emotion/styled";
import type { StreamingMessageAggregator } from "@/utils/messages/StreamingMessageAggregator";

const TokenCountContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #888;
  font-family: var(--font-mono);
  user-select: none;
`;

const TokenCount = styled.span`
  color: var(--color-assistant-border);
`;

const TPS = styled.span`
  color: #666;
`;

interface StreamingTokenCountProps {
  messageId: string;
  aggregator: StreamingMessageAggregator;
  isStreaming: boolean;
}

export const StreamingTokenCount: React.FC<StreamingTokenCountProps> = ({
  messageId,
  aggregator,
  isStreaming,
}) => {
  if (!isStreaming) return null;

  const tokenCount = aggregator.getStreamingTokenCount(messageId);
  const tps = aggregator.getStreamingTPS(messageId);

  // Debug logging
  console.log("[StreamingTokenCount] messageId:", messageId);
  console.log("[StreamingTokenCount] tokenCount:", tokenCount);
  console.log("[StreamingTokenCount] tps:", tps);

  // Don't show until we have some tokens
  if (tokenCount === 0) return null;

  return (
    <TokenCountContainer>
      <TokenCount>~{tokenCount.toLocaleString()} tokens</TokenCount>
      {tps > 0 && <TPS>@ {tps} t/s</TPS>}
    </TokenCountContainer>
  );
};
