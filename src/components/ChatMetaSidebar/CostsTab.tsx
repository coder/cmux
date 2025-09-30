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

const DetailsTable = styled.table`
  width: 100%;
  margin-top: 4px;
  border-collapse: collapse;
  font-size: 11px;
`;

const DetailsHeaderRow = styled.tr`
  border-bottom: 1px solid #3e3e42;
`;

const DetailsHeader = styled.th`
  text-align: left;
  color: #888888;
  font-weight: 500;
  padding: 4px 8px 4px 0;

  &:last-child {
    text-align: right;
    padding-right: 0;
  }
`;

const DetailsRow = styled.tr``;

const DetailsCell = styled.td`
  padding: 4px 8px 4px 0;
  color: #cccccc;

  &:last-child {
    text-align: right;
    padding-right: 0;
  }
`;

const ComponentName = styled.div<{ color: string }>`
  display: flex;
  align-items: center;
  gap: 6px;

  &::before {
    content: "";
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: ${(props) => props.color};
    flex-shrink: 0;
  }
`;

const DimmedCost = styled.span`
  color: #666666;
  font-style: italic;
`;

// Format token display - show k for thousands with 1 decimal
const formatTokens = (tokens: number) =>
  tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens.toLocaleString();

// Format cost display - show "<$0.01" for very small values, otherwise fixed precision
const formatCost = (cost: number): string => {
  if (cost === 0) return "0.00";
  if (cost >= 0.01) return cost.toFixed(2);
  // For values < 0.01, show as "<$0.01" (without $ prefix when used)
  return "<0.01";
};

// Format cost with dollar sign
const formatCostWithDollar = (cost: number): string => {
  if (cost > 0 && cost < 0.01) return "~$0.00";
  return `$${formatCost(cost)}`;
};

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
                stats.lastUsage.input.tokens +
                stats.lastUsage.cached.tokens +
                stats.lastUsage.output.tokens +
                stats.lastUsage.reasoning.tokens;

              // Calculate percentages
              let inputPercentage: number;
              let outputPercentage: number;
              let cachedPercentage: number;
              let showWarning = false;
              let totalPercentage: number;

              if (maxTokens) {
                // We know the model's max tokens
                inputPercentage = (stats.lastUsage.input.tokens / maxTokens) * 100;
                outputPercentage = (stats.lastUsage.output.tokens / maxTokens) * 100;
                cachedPercentage = (stats.lastUsage.cached.tokens / maxTokens) * 100;
                totalPercentage = (totalUsed / maxTokens) * 100;
              } else {
                // Unknown model - scale to total tokens used
                inputPercentage =
                  totalUsed > 0 ? (stats.lastUsage.input.tokens / totalUsed) * 100 : 0;
                outputPercentage =
                  totalUsed > 0 ? (stats.lastUsage.output.tokens / totalUsed) * 100 : 0;
                cachedPercentage =
                  totalUsed > 0 ? (stats.lastUsage.cached.tokens / totalUsed) * 100 : 0;
                totalPercentage = 100;
                showWarning = true;
              }

              const totalDisplay = formatTokens(totalUsed);
              const maxDisplay = maxTokens ? ` / ${formatTokens(maxTokens)}` : "";

              // Calculate cost percentages
              const totalCost =
                stats.lastUsage.input.cost_usd +
                stats.lastUsage.cached.cost_usd +
                stats.lastUsage.cacheCreate.cost_usd +
                stats.lastUsage.output.cost_usd +
                stats.lastUsage.reasoning.cost_usd;

              const inputCostPercentage =
                totalCost > 0 ? (stats.lastUsage.input.cost_usd / totalCost) * 100 : 0;
              const cachedCostPercentage =
                totalCost > 0 ? (stats.lastUsage.cached.cost_usd / totalCost) * 100 : 0;
              const cacheCreateCostPercentage =
                totalCost > 0 ? (stats.lastUsage.cacheCreate.cost_usd / totalCost) * 100 : 0;
              const outputCostPercentage =
                totalCost > 0 ? (stats.lastUsage.output.cost_usd / totalCost) * 100 : 0;
              const reasoningCostPercentage =
                totalCost > 0 ? (stats.lastUsage.reasoning.cost_usd / totalCost) * 100 : 0;

              // Build component data for table
              const components = [
                {
                  name: "Cache Read",
                  tokens: stats.lastUsage.cached.tokens,
                  cost: stats.lastUsage.cached.cost_usd,
                  color: "var(--color-token-cached)",
                  show: stats.lastUsage.cached.tokens > 0,
                },
                {
                  name: "Cache Create",
                  tokens: stats.lastUsage.cacheCreate.tokens,
                  cost: stats.lastUsage.cacheCreate.cost_usd,
                  color: "var(--color-token-cached)",
                  show: stats.lastUsage.cacheCreate.tokens > 0,
                },
                {
                  name: "Input",
                  tokens: stats.lastUsage.input.tokens,
                  cost: stats.lastUsage.input.cost_usd,
                  color: "var(--color-token-input)",
                  show: true,
                },
                {
                  name: "Output",
                  tokens: stats.lastUsage.output.tokens,
                  cost: stats.lastUsage.output.cost_usd,
                  color: "var(--color-token-output)",
                  show: true,
                },
                {
                  name: "Reasoning",
                  tokens: stats.lastUsage.reasoning.tokens,
                  cost: stats.lastUsage.reasoning.cost_usd,
                  color: "var(--color-token-output)",
                  show: stats.lastUsage.reasoning.tokens > 0,
                },
              ].filter((c) => c.show);

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
                        {/* Cache create is excluded from token usage bar since it's a separate
                            billing concept and doesn't count toward the context window limit */}
                        {cachedPercentage > 0 && <CachedSegment percentage={cachedPercentage} />}
                        <InputSegment percentage={inputPercentage} />
                        <OutputSegment percentage={outputPercentage} />
                      </PercentageBar>
                    </PercentageBarWrapper>
                  </ConsumerRow>
                  {totalCost > 0 && (
                    <ConsumerRow>
                      <ConsumerHeader>
                        <ConsumerName>Cost</ConsumerName>
                        <ConsumerTokens>{formatCostWithDollar(totalCost)}</ConsumerTokens>
                      </ConsumerHeader>
                      <PercentageBarWrapper>
                        <PercentageBar>
                          {cachedCostPercentage > 0 && (
                            <CachedSegment percentage={cachedCostPercentage} />
                          )}
                          {cacheCreateCostPercentage > 0 && (
                            <CachedSegment percentage={cacheCreateCostPercentage} />
                          )}
                          <InputSegment percentage={inputCostPercentage} />
                          <OutputSegment percentage={outputCostPercentage} />
                          {reasoningCostPercentage > 0 && (
                            <OutputSegment percentage={reasoningCostPercentage} />
                          )}
                        </PercentageBar>
                      </PercentageBarWrapper>
                    </ConsumerRow>
                  )}
                  <DetailsTable>
                    <thead>
                      <DetailsHeaderRow>
                        <DetailsHeader>Component</DetailsHeader>
                        <DetailsHeader>Tokens</DetailsHeader>
                        <DetailsHeader>Cost</DetailsHeader>
                      </DetailsHeaderRow>
                    </thead>
                    <tbody>
                      {components.map((component) => {
                        const costDisplay = formatCostWithDollar(component.cost);
                        const isNegligible = component.cost > 0 && component.cost < 0.01;

                        return (
                          <DetailsRow key={component.name}>
                            <DetailsCell>
                              <ComponentName color={component.color}>
                                {component.name}
                              </ComponentName>
                            </DetailsCell>
                            <DetailsCell>{formatTokens(component.tokens)}</DetailsCell>
                            <DetailsCell>
                              {isNegligible ? <DimmedCost>{costDisplay}</DimmedCost> : costDisplay}
                            </DetailsCell>
                          </DetailsRow>
                        );
                      })}
                    </tbody>
                  </DetailsTable>
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
