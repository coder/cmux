import React from "react";
import styled from "@emotion/styled";
import { useChatContext } from "../../contexts/ChatContext";
import { TooltipWrapper, Tooltip } from "../Tooltip";
import { getMaxTokensForModel } from "../../utils/modelTokenLimits";

const Container = styled.div`
  color: #d4d4d4;
  font-family: var(--font-primary);
  font-size: 13px;
  line-height: 1.6;
`;

const Section = styled.div`
  margin-bottom: 24px;
`;

const SectionTitle = styled.h3<{ dimmed?: boolean }>`
  color: ${(props) => (props.dimmed ? "#999999" : "#cccccc")};
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const TokenizerInfo = styled.div`
  color: #888888;
  font-size: 12px;
  margin-bottom: 8px;
  font-style: italic;
`;

const InfoNote = styled.div`
  color: #888888;
  font-size: 11px;
  margin-top: 4px;
  font-style: italic;
`;

const TotalTokens = styled.div`
  font-size: 16px;
  font-weight: 400;
  color: #ffffff;
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
  position: relative;
`;

const ConsumerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
`;

const ConsumerName = styled.span`
  color: #cccccc;
  font-weight: 500;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
`;

const HelpIndicator = styled.span`
  color: #666666;
  font-size: 8px;
  cursor: help;
  display: inline-block;
  vertical-align: baseline;
  border: 1px solid #666666;
  border-radius: 50%;
  width: 11px;
  height: 11px;
  line-height: 9px;
  text-align: center;
  font-weight: bold;
`;

const ConsumerTokens = styled.span`
  color: #888888;
  font-size: 12px;
`;

const PercentageBarWrapper = styled.div`
  position: relative;
  width: 100%;
`;

const PercentageBar = styled.div`
  width: 100%;
  height: 6px;
  background: #3e3e42;
  border-radius: 3px;
  overflow: hidden;
  display: flex;
`;

interface SegmentProps {
  percentage: number;
}

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

const InputSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: var(--color-token-input);
  transition: width 0.3s ease;
`;

const OutputSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: var(--color-token-output);
  transition: width 0.3s ease;
`;

const CachedSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: var(--color-token-cached);
  transition: width 0.3s ease;
`;

interface PercentageFillProps {
  percentage: number;
}

const PercentageFill = styled.div<PercentageFillProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: var(--color-token-completion);
  transition: width 0.3s ease;
`;

const LoadingState = styled.div`
  color: #888888;
  font-style: italic;
`;

const EmptyState = styled.div`
  color: #888888;
  text-align: center;
  padding: 40px 20px;
`;

const ModelWarning = styled.div`
  color: #999999;
  font-size: 11px;
  margin-top: 8px;
  font-style: italic;
`;

const TokenDetails = styled.div`
  color: #888888;
  font-size: 11px;
  margin-top: 6px;
  padding-left: 4px;
  line-height: 1.4;
`;

// Format token display - show k for thousands with 1 decimal
const formatTokens = (tokens: number) =>
  tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens.toLocaleString();

export const CostsTab: React.FC = () => {
  const { stats, isCalculating } = useChatContext();

  // Only show loading if we don't have any stats yet
  if (isCalculating && !stats) {
    return (
      <Container>
        <LoadingState>Calculating token usage...</LoadingState>
      </Container>
    );
  }

  if (!stats || stats.totalTokens === 0) {
    return (
      <Container>
        <EmptyState>
          <p>No messages yet.</p>
          <p>Send a message to see token usage statistics.</p>
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container>
      {stats.lastUsage && (
        <Section>
          <SectionTitle>Last API Response</SectionTitle>
          <ConsumerList>
            {(() => {
              // Get max tokens for the model
              const maxTokens = getMaxTokensForModel(stats.model);
              const totalUsed =
                stats.lastUsage.tokens.input +
                stats.lastUsage.tokens.cached +
                stats.lastUsage.tokens.output +
                stats.lastUsage.tokens.reasoning;

              // Calculate percentages
              let inputPercentage: number;
              let outputPercentage: number;
              let cachedPercentage: number;
              let showWarning = false;
              let totalPercentage: number;

              if (maxTokens) {
                // We know the model's max tokens
                inputPercentage = (stats.lastUsage.tokens.input / maxTokens) * 100;
                outputPercentage = (stats.lastUsage.tokens.output / maxTokens) * 100;
                cachedPercentage = (stats.lastUsage.tokens.cached / maxTokens) * 100;
                totalPercentage = (totalUsed / maxTokens) * 100;
              } else {
                // Unknown model - scale to total tokens used
                inputPercentage =
                  totalUsed > 0 ? (stats.lastUsage.tokens.input / totalUsed) * 100 : 0;
                outputPercentage =
                  totalUsed > 0 ? (stats.lastUsage.tokens.output / totalUsed) * 100 : 0;
                cachedPercentage =
                  totalUsed > 0 ? (stats.lastUsage.tokens.cached / totalUsed) * 100 : 0;
                totalPercentage = 100;
                showWarning = true;
              }

              const totalDisplay = formatTokens(totalUsed);
              const maxDisplay = maxTokens ? ` / ${formatTokens(maxTokens)}` : "";

              return (
                <>
                  <ConsumerRow>
                    <ConsumerHeader>
                      <ConsumerName>Token Usage</ConsumerName>
                      <ConsumerTokens>
                        {totalDisplay}
                        {maxDisplay} ({totalPercentage.toFixed(1)}%)
                      </ConsumerTokens>
                    </ConsumerHeader>
                    <PercentageBarWrapper>
                      <PercentageBar>
                        {cachedPercentage > 0 && <CachedSegment percentage={cachedPercentage} />}
                        <InputSegment percentage={inputPercentage} />
                        <OutputSegment percentage={outputPercentage} />
                      </PercentageBar>
                      <TokenDetails>
                        {stats.lastUsage.tokens.cached > 0 && (
                          <>Cached: {formatTokens(stats.lastUsage.tokens.cached)} • </>
                        )}
                        Input: {formatTokens(stats.lastUsage.tokens.input)} • Output:{" "}
                        {formatTokens(stats.lastUsage.tokens.output)}
                        {stats.lastUsage.tokens.reasoning > 0 && (
                          <> • Reasoning: {formatTokens(stats.lastUsage.tokens.reasoning)}</>
                        )}
                      </TokenDetails>
                    </PercentageBarWrapper>
                  </ConsumerRow>
                  {showWarning && (
                    <ModelWarning>Unknown model limits - showing relative usage only</ModelWarning>
                  )}
                </>
              );
            })()}
          </ConsumerList>
        </Section>
      )}

      <Section>
        <SectionTitle dimmed>Content Tokens</SectionTitle>
        <TokenizerInfo>Estimated using {stats.tokenizerName}</TokenizerInfo>
        <TotalTokens>{stats.totalTokens.toLocaleString()} tokens</TotalTokens>
        <InfoNote>
          Actual API costs include system overhead (prompts, tool definitions, etc.)
        </InfoNote>
      </Section>

      <Section>
        <SectionTitle dimmed>Breakdown by Consumer</SectionTitle>
        <ConsumerList>
          {stats.consumers.map((consumer) => {
            // Calculate percentages for fixed and variable segments
            const fixedPercentage = consumer.fixedTokens
              ? (consumer.fixedTokens / stats.totalTokens) * 100
              : 0;
            const variablePercentage = consumer.variableTokens
              ? (consumer.variableTokens / stats.totalTokens) * 100
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
                          Web search results are encrypted and decrypted server-side. This estimate
                          is approximate.
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
      </Section>
    </Container>
  );
};
