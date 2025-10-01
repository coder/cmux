import React from "react";
import styled from "@emotion/styled";
import { useChatContext } from "../../contexts/ChatContext";
import { TooltipWrapper, Tooltip } from "../Tooltip";
import { getMaxTokensForModel } from "../../utils/modelTokenLimits";
import { sumUsageHistory } from "../../utils/tokenStatsCalculator";
import { usePersistedState } from "../../hooks/usePersistedState";
import { ToggleGroup, type ToggleOption } from "../ToggleGroup";

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

// Component color mapping - single source of truth for all cost component colors
const COMPONENT_COLORS = {
  cached: "var(--color-token-cached)",
  input: "var(--color-token-input)",
  output: "var(--color-token-output)",
  thinking: "var(--color-thinking-mode)",
} as const;

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
  background: ${COMPONENT_COLORS.input};
  transition: width 0.3s ease;
`;

const OutputSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: ${COMPONENT_COLORS.output};
  transition: width 0.3s ease;
`;

const ThinkingSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: ${COMPONENT_COLORS.thinking};
  transition: width 0.3s ease;
`;

const CachedSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: ${COMPONENT_COLORS.cached};
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

const SectionHeader = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-bottom: 12px;
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

type ViewMode = "last-request" | "session";

const VIEW_MODE_OPTIONS: ToggleOption<ViewMode>[] = [
  { value: "last-request", label: "Last Request" },
  { value: "session", label: "Session" },
];

export const CostsTab: React.FC = () => {
  const { stats, isCalculating } = useChatContext();
  const [viewMode, setViewMode] = usePersistedState<ViewMode>("costsTab:viewMode", "last-request");

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

  // Compute displayUsage based on view mode
  const displayUsage =
    viewMode === "last-request"
      ? stats.usageHistory[stats.usageHistory.length - 1]
      : sumUsageHistory(stats.usageHistory);

  return (
    <Container>
      {stats.usageHistory.length > 0 && (
        <Section>
          <SectionHeader>
            <ToggleGroup options={VIEW_MODE_OPTIONS} value={viewMode} onChange={setViewMode} />
          </SectionHeader>
          <ConsumerList>
            {(() => {
              // Get max tokens for the model
              const maxTokens = getMaxTokensForModel(stats.model);
              const totalUsed = displayUsage
                ? displayUsage.input.tokens +
                  displayUsage.cached.tokens +
                  displayUsage.output.tokens +
                  displayUsage.reasoning.tokens
                : 0;

              // Calculate percentages
              let inputPercentage: number;
              let outputPercentage: number;
              let cachedPercentage: number;
              let reasoningPercentage: number;
              let showWarning = false;
              let totalPercentage: number;

              // For session mode, always show bar as full (100%) based on relative token distribution
              if (viewMode === "session" && displayUsage && totalUsed > 0) {
                // Scale to total tokens used (bar always full)
                inputPercentage = (displayUsage.input.tokens / totalUsed) * 100;
                outputPercentage = (displayUsage.output.tokens / totalUsed) * 100;
                cachedPercentage = (displayUsage.cached.tokens / totalUsed) * 100;
                reasoningPercentage = (displayUsage.reasoning.tokens / totalUsed) * 100;
                totalPercentage = 100;
              } else if (maxTokens && displayUsage) {
                // We know the model's max tokens - show actual context window usage
                inputPercentage = (displayUsage.input.tokens / maxTokens) * 100;
                outputPercentage = (displayUsage.output.tokens / maxTokens) * 100;
                cachedPercentage = (displayUsage.cached.tokens / maxTokens) * 100;
                reasoningPercentage = (displayUsage.reasoning.tokens / maxTokens) * 100;
                totalPercentage = (totalUsed / maxTokens) * 100;
              } else if (displayUsage) {
                // Unknown model - scale to total tokens used
                inputPercentage = totalUsed > 0 ? (displayUsage.input.tokens / totalUsed) * 100 : 0;
                outputPercentage =
                  totalUsed > 0 ? (displayUsage.output.tokens / totalUsed) * 100 : 0;
                cachedPercentage =
                  totalUsed > 0 ? (displayUsage.cached.tokens / totalUsed) * 100 : 0;
                reasoningPercentage =
                  totalUsed > 0 ? (displayUsage.reasoning.tokens / totalUsed) * 100 : 0;
                totalPercentage = 100;
                showWarning = true;
              } else {
                inputPercentage = 0;
                outputPercentage = 0;
                cachedPercentage = 0;
                reasoningPercentage = 0;
                totalPercentage = 0;
              }

              const totalDisplay = formatTokens(totalUsed);
              // For session mode, don't show max tokens or percentage
              const maxDisplay =
                viewMode === "session" ? "" : maxTokens ? ` / ${formatTokens(maxTokens)}` : "";
              const showPercentage = viewMode !== "session";

              // Calculate cost percentages
              const totalCost = displayUsage
                ? displayUsage.input.cost_usd +
                  displayUsage.cached.cost_usd +
                  displayUsage.cacheCreate.cost_usd +
                  displayUsage.output.cost_usd +
                  displayUsage.reasoning.cost_usd
                : 0;

              const inputCostPercentage =
                totalCost > 0 && displayUsage ? (displayUsage.input.cost_usd / totalCost) * 100 : 0;
              const cachedCostPercentage =
                totalCost > 0 && displayUsage
                  ? (displayUsage.cached.cost_usd / totalCost) * 100
                  : 0;
              const cacheCreateCostPercentage =
                totalCost > 0 && displayUsage
                  ? (displayUsage.cacheCreate.cost_usd / totalCost) * 100
                  : 0;
              const outputCostPercentage =
                totalCost > 0 && displayUsage
                  ? (displayUsage.output.cost_usd / totalCost) * 100
                  : 0;
              const reasoningCostPercentage =
                totalCost > 0 && displayUsage
                  ? (displayUsage.reasoning.cost_usd / totalCost) * 100
                  : 0;

              // Build component data for table
              const components = displayUsage
                ? [
                    {
                      name: "Cache Read",
                      tokens: displayUsage.cached.tokens,
                      cost: displayUsage.cached.cost_usd,
                      color: COMPONENT_COLORS.cached,
                      show: displayUsage.cached.tokens > 0,
                    },
                    {
                      name: "Cache Create",
                      tokens: displayUsage.cacheCreate.tokens,
                      cost: displayUsage.cacheCreate.cost_usd,
                      color: COMPONENT_COLORS.cached,
                      show: displayUsage.cacheCreate.tokens > 0,
                    },
                    {
                      name: "Input",
                      tokens: displayUsage.input.tokens,
                      cost: displayUsage.input.cost_usd,
                      color: COMPONENT_COLORS.input,
                      show: true,
                    },
                    {
                      name: "Output",
                      tokens: displayUsage.output.tokens,
                      cost: displayUsage.output.cost_usd,
                      color: COMPONENT_COLORS.output,
                      show: true,
                    },
                    {
                      name: "Thinking",
                      tokens: displayUsage.reasoning.tokens,
                      cost: displayUsage.reasoning.cost_usd,
                      color: COMPONENT_COLORS.thinking,
                      show: displayUsage.reasoning.tokens > 0,
                    },
                  ].filter((c) => c.show)
                : [];

              return (
                <>
                  <ConsumerRow>
                    <ConsumerHeader>
                      <ConsumerName>Token Usage</ConsumerName>
                      <ConsumerTokens>
                        {totalDisplay}
                        {maxDisplay}
                        {showPercentage && ` (${totalPercentage.toFixed(1)}%)`}
                      </ConsumerTokens>
                    </ConsumerHeader>
                    <PercentageBarWrapper>
                      <PercentageBar>
                        {/* Cache create is excluded from token usage bar since it's a separate
                            billing concept and doesn't count toward the context window limit */}
                        {cachedPercentage > 0 && <CachedSegment percentage={cachedPercentage} />}
                        <InputSegment percentage={inputPercentage} />
                        <OutputSegment percentage={outputPercentage} />
                        {reasoningPercentage > 0 && (
                          <ThinkingSegment percentage={reasoningPercentage} />
                        )}
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
                            <ThinkingSegment percentage={reasoningCostPercentage} />
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
        <SectionTitle dimmed>Breakdown by Consumer</SectionTitle>
        <TokenizerInfo>
          Estimated using tokenizer: <span>{stats.tokenizerName}</span>
        </TokenizerInfo>
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
