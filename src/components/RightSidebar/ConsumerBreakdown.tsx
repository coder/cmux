import React from "react";
import styled from "@emotion/styled";
import type { WorkspaceConsumersState } from "@/stores/WorkspaceStore";
import { TooltipWrapper, Tooltip, HelpIndicator } from "../Tooltip";

const TokenizerInfo = styled.div`
  color: #888888;
  font-size: 12px;
  margin-bottom: 8px;
`;

const ConsumerList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ConsumerRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const ConsumerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
`;

const ConsumerName = styled.span`
  color: #cccccc;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
`;

const ConsumerTokens = styled.span`
  color: #888888;
  font-size: 12px;
`;

const PercentageBarWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const PercentageBar = styled.div`
  width: 100%;
  height: 8px;
  background: #2a2a2a;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
`;

interface SegmentProps {
  percentage: number;
}

const PercentageFill = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: linear-gradient(90deg, #4a9eff 0%, #6b5ce7 100%);
  transition: width 0.3s ease;
`;

const FixedSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: var(--color-token-fixed);
  transition: width 0.3s ease;
`;

const VariableSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: var(--color-token-variable);
  transition: width 0.3s ease;
`;

const TokenDetails = styled.div`
  color: #666666;
  font-size: 11px;
  text-align: left;
`;

const LoadingState = styled.div`
  color: #888888;
  font-style: italic;
  padding: 12px 0;
`;

const EmptyState = styled.div`
  color: #666666;
  font-style: italic;
  padding: 12px 0;
  text-align: left;

  p {
    margin: 4px 0;
  }
`;

// Format token display - show k for thousands with 1 decimal
const formatTokens = (tokens: number) =>
  tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens.toLocaleString();

interface ConsumerBreakdownProps {
  consumers: WorkspaceConsumersState;
}

const ConsumerBreakdownComponent: React.FC<ConsumerBreakdownProps> = ({ consumers }) => {
  if (consumers.isCalculating) {
    return <LoadingState>Calculating consumer breakdown...</LoadingState>;
  }

  if (consumers.consumers.length === 0) {
    return <EmptyState>No consumer data available</EmptyState>;
  }

  return (
    <>
      <TokenizerInfo>
        Tokenizer: <span>{consumers.tokenizerName}</span>
      </TokenizerInfo>
      <ConsumerList>
        {consumers.consumers.map((consumer) => {
          // Calculate percentages for fixed and variable segments
          const fixedPercentage = consumer.fixedTokens
            ? (consumer.fixedTokens / consumers.totalTokens) * 100
            : 0;
          const variablePercentage = consumer.variableTokens
            ? (consumer.variableTokens / consumers.totalTokens) * 100
            : 0;

          const tokenDisplay = formatTokens(consumer.tokens);

          return (
            <ConsumerRow key={consumer.name}>
              <ConsumerHeader>
                <ConsumerName>
                  {consumer.name}
                  {consumer.name === "web_search" && (
                    <TooltipWrapper inline>
                      <HelpIndicator>?</HelpIndicator>
                      <Tooltip className="tooltip" align="center" width="wide">
                        Web search results are encrypted and decrypted server-side. This estimate is
                        approximate.
                      </Tooltip>
                    </TooltipWrapper>
                  )}
                </ConsumerName>
                <ConsumerTokens>
                  {tokenDisplay} ({consumer.percentage.toFixed(1)}%)
                </ConsumerTokens>
              </ConsumerHeader>
              <PercentageBarWrapper>
                <PercentageBar>
                  {consumer.fixedTokens && consumer.variableTokens ? (
                    <>
                      <FixedSegment percentage={fixedPercentage} />
                      <VariableSegment percentage={variablePercentage} />
                    </>
                  ) : (
                    <PercentageFill percentage={consumer.percentage} />
                  )}
                </PercentageBar>
                {consumer.fixedTokens && consumer.variableTokens && (
                  <TokenDetails>
                    Tool definition: {formatTokens(consumer.fixedTokens)} • Usage:{" "}
                    {formatTokens(consumer.variableTokens)}
                  </TokenDetails>
                )}
              </PercentageBarWrapper>
            </ConsumerRow>
          );
        })}
      </ConsumerList>
    </>
  );
};

// Memoize to prevent re-renders when parent re-renders but consumers data hasn't changed
// Only re-renders when consumers object reference changes (when store bumps it)
export const ConsumerBreakdown = React.memo(ConsumerBreakdownComponent);
