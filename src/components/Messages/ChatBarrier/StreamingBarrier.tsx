import React from "react";
import styled from "@emotion/styled";
import { BaseBarrier } from "./BaseBarrier";

const BarrierWithTokens = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
`;

const TokenInfo = styled.div`
  font-family: var(--font-mono);
  font-size: 11px;
  color: #888;
  display: flex;
  gap: 12px;
  user-select: none;
  margin-left: auto;
`;

const TokenCount = styled.span`
  color: var(--color-assistant-border);
`;

const TPS = styled.span`
  color: #666;
`;

interface StreamingBarrierProps {
  className?: string;
  text?: string;
  tokenCount?: number;
  tps?: number;
}

export const StreamingBarrier: React.FC<StreamingBarrierProps> = ({
  className,
  text = "streaming... hit Esc to cancel",
  tokenCount,
  tps,
}) => {
  console.log(`[StreamingBarrier] Rendering with tokenCount=${tokenCount}, tps=${tps}`);
  return (
    <BarrierWithTokens className={className}>
      <BaseBarrier text={text} color="var(--color-assistant-border)" animate />
      {tokenCount !== undefined && (
        <TokenInfo>
          <TokenCount>~{tokenCount.toLocaleString()} tokens</TokenCount>
          {tps !== undefined && tps > 0 && <TPS>@ {tps} t/s</TPS>}
        </TokenInfo>
      )}
    </BarrierWithTokens>
  );
};
