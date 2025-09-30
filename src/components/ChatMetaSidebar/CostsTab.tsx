import React from "react";
import styled from "@emotion/styled";
import { useChatContext } from "../../contexts/ChatContext";
import { Tooltip, TooltipWrapper } from "../Tooltip";
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

  &:hover .tooltip {
    visibility: visible;
    opacity: 1;
  }
`;

const PercentageBar = styled.div`
  width: 100%;
  height: 6px;
  background: #3e3e42;
  border-radius: 3px;
  overflow: hidden;
  display: flex;
  cursor: help;
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

const PromptSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: var(--color-token-prompt);
  transition: width 0.3s ease;
`;

const CompletionSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: var(--color-token-completion);
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

// Format token display - show k for thousands with 1 decimal
const formatTokens = (tokens: number) =>
  tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens.toLocaleString();

export const CostsTab: React.FC = () => {
  const { stats, isCalculating } = useChatContext();

  if (isCalculating) {
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
              const totalUsed = stats.lastUsage.totalTokens;

              // Calculate percentages
              let promptPercentage: number;
              let completionPercentage: number;
              let showWarning = false;
              let totalPercentage: number;

              if (maxTokens) {
                // We know the model's max tokens
                promptPercentage = (stats.lastUsage.promptTokens / maxTokens) * 100;
                completionPercentage = (stats.lastUsage.completionTokens / maxTokens) * 100;
                totalPercentage = (totalUsed / maxTokens) * 100;
              } else {
                // Unknown model - scale to total tokens used
                promptPercentage = (stats.lastUsage.promptTokens / totalUsed) * 100;
                completionPercentage = (stats.lastUsage.completionTokens / totalUsed) * 100;
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
                        <PromptSegment percentage={promptPercentage} />
                        <CompletionSegment percentage={completionPercentage} />
                      </PercentageBar>
                      <Tooltip className="tooltip" align="center" width="wide">
                        <div>Prompt: {formatTokens(stats.lastUsage.promptTokens)} tokens</div>
                        <div>
                          Completion: {formatTokens(stats.lastUsage.completionTokens)} tokens
                        </div>
                      </Tooltip>
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
                  <Tooltip className="tooltip" align="center">
                    {consumer.fixedTokens && consumer.variableTokens ? (
                      <>
                        <div>Tool definition: {consumer.fixedTokens.toLocaleString()} tokens</div>
                        <div>Usage: {consumer.variableTokens.toLocaleString()} tokens</div>
                      </>
                    ) : (
                      <div>{consumer.tokens.toLocaleString()} tokens</div>
                    )}
                  </Tooltip>
                </PercentageBarWrapper>
              </ConsumerRow>
            );
          })}
        </ConsumerList>
      </Section>
    </Container>
  );
};
