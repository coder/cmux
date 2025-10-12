import React from "react";
import styled from "@emotion/styled";
import { BaseBarrier } from "./BaseBarrier";

const BarrierContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
`;

const LeftContent = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
`;

const TokenInfo = styled.span`
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-assistant-border);
  user-select: none;
  white-space: nowrap;
`;

const TPS = styled.span`
  color: #666;
  margin-left: 4px;
`;

const CancelInstructions = styled.div`
  font-size: 11px;
  color: #888;
  user-select: none;
  white-space: nowrap;
  margin-left: auto;
`;

interface StreamingBarrierProps {
  className?: string;
  statusText: string; // e.g., "claude-sonnet-4-5 streaming..."
  cancelText: string; // e.g., "hit Esc to cancel"
  tokenCount?: number;
  tps?: number;
}

export const StreamingBarrier: React.FC<StreamingBarrierProps> = ({
  className,
  statusText,
  cancelText,
  tokenCount,
  tps,
}) => {
  return (
    <BarrierContainer className={className}>
      <LeftContent>
        <BaseBarrier text={statusText} color="var(--color-assistant-border)" animate />
        {tokenCount !== undefined && (
          <TokenInfo>
            ~{tokenCount.toLocaleString()} tokens
            {tps !== undefined && tps > 0 && <TPS>@ {tps} t/s</TPS>}
          </TokenInfo>
        )}
      </LeftContent>
      <CancelInstructions>{cancelText}</CancelInstructions>
    </BarrierContainer>
  );
};
