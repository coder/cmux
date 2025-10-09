import React from "react";
import styled from "@emotion/styled";
import { useChatContext } from "@/contexts/ChatContext";
import { TooltipWrapper, Tooltip, HelpIndicator } from "../Tooltip";
import { getModelStats } from "@/utils/tokens/modelStats";
import { sumUsageHistory } from "@/utils/tokens/tokenStatsCalculator";
import { usePersistedState } from "@/hooks/usePersistedState";
import { ToggleGroup, type ToggleOption } from "../ToggleGroup";
import { use1MContext } from "@/hooks/use1MContext";
import { supports1MContext } from "@/utils/ai/models";

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

const Context1MBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(0, 122, 204, 0.15);
  border: 1px solid rgba(0, 122, 204, 0.4);
  border-radius: 3px;
  color: #007acc;
  font-size: 11px;
  font-weight: 500;
  margin-left: 8px;
`;

// Format token display - show k for thousands with 1 decimal
const formatTokens = (tokens: number) =>
  tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens.toLocaleString();

// Format cost display - show "??" if undefined, "<$0.01" for very small values, otherwise fixed precision
const formatCost = (cost: number | undefined): string => {
  if (cost === undefined) return "??";
  if (cost === 0) return "0.00";
  if (cost >= 0.01) return cost.toFixed(2);
  // For values < 0.01, show as "<$0.01" (without $ prefix when used)
  return "<0.01";
};

// Format cost with dollar sign
const formatCostWithDollar = (cost: number | undefined): string => {
  if (cost === undefined) return "??";
  if (cost > 0 && cost < 0.01) return "~$0.00";
  return `$${formatCost(cost)}`;
};

/**
 * Calculate cost with elevated pricing for 1M context (200k-1M tokens)
 * For tokens above 200k, use elevated pricing rates
 */
const calculateElevatedCost = (
  tokens: number,
  standardRate: number,
  elevatedRate: number | undefined
): number => {
  if (tokens <= 200_000) {
    return tokens * standardRate;
  }
  if (elevatedRate === undefined) {
    // Fallback to standard rate if elevated rate not available
    return tokens * standardRate;
  }
  const baseCost = 200_000 * standardRate;
  const elevatedTokens = tokens - 200_000;
  const elevatedCost = elevatedTokens * elevatedRate;
  return baseCost + elevatedCost;
};

type ViewMode = "last-request" | "session";

const VIEW_MODE_OPTIONS: Array<ToggleOption<ViewMode>> = [
  { value: "last-request", label: "Last Request" },
  { value: "session", label: "Session" },
];

export const CostsTab: React.FC = () => {
  const { stats, isCalculating, workspaceId } = useChatContext();
  const [viewMode, setViewMode] = usePersistedState<ViewMode>("costsTab:viewMode", "last-request");
  const [use1M] = use1MContext(workspaceId);

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
              // Get max tokens for the model from the model stats database
              const modelStats = getModelStats(stats.model);
              const baseMaxTokens = modelStats?.max_input_tokens;
              // Check if 1M context is active and supported
              const is1MActive = use1M && supports1MContext(stats.model);
              const maxTokens = is1MActive ? 1_000_000 : baseMaxTokens;
              // Total tokens includes cache creation (they're input tokens sent for caching)
              const totalUsed = displayUsage
                ? displayUsage.input.tokens +
                  displayUsage.cached.tokens +
                  displayUsage.cacheCreate.tokens +
                  displayUsage.output.tokens +
                  displayUsage.reasoning.tokens
                : 0;

              // Calculate percentages
              let inputPercentage: number;
              let outputPercentage: number;
              let cachedPercentage: number;
              let cacheCreatePercentage: number;
              let reasoningPercentage: number;
              let showWarning = false;
              let totalPercentage: number;

              // For session mode, always show bar as full (100%) based on relative token distribution
              if (viewMode === "session" && displayUsage && totalUsed > 0) {
                // Scale to total tokens used (bar always full)
                inputPercentage = (displayUsage.input.tokens / totalUsed) * 100;
                outputPercentage = (displayUsage.output.tokens / totalUsed) * 100;
                cachedPercentage = (displayUsage.cached.tokens / totalUsed) * 100;
                cacheCreatePercentage = (displayUsage.cacheCreate.tokens / totalUsed) * 100;
                reasoningPercentage = (displayUsage.reasoning.tokens / totalUsed) * 100;
                totalPercentage = 100;
              } else if (maxTokens && displayUsage) {
                // We know the model's max tokens - show actual context window usage
                inputPercentage = (displayUsage.input.tokens / maxTokens) * 100;
                outputPercentage = (displayUsage.output.tokens / maxTokens) * 100;
                cachedPercentage = (displayUsage.cached.tokens / maxTokens) * 100;
                cacheCreatePercentage = (displayUsage.cacheCreate.tokens / maxTokens) * 100;
                reasoningPercentage = (displayUsage.reasoning.tokens / maxTokens) * 100;
                totalPercentage = (totalUsed / maxTokens) * 100;
              } else if (displayUsage) {
                // Unknown model - scale to total tokens used
                inputPercentage = totalUsed > 0 ? (displayUsage.input.tokens / totalUsed) * 100 : 0;
                outputPercentage =
                  totalUsed > 0 ? (displayUsage.output.tokens / totalUsed) * 100 : 0;
                cachedPercentage =
                  totalUsed > 0 ? (displayUsage.cached.tokens / totalUsed) * 100 : 0;
                cacheCreatePercentage =
                  totalUsed > 0 ? (displayUsage.cacheCreate.tokens / totalUsed) * 100 : 0;
                reasoningPercentage =
                  totalUsed > 0 ? (displayUsage.reasoning.tokens / totalUsed) * 100 : 0;
                totalPercentage = 100;
                showWarning = true;
              } else {
                inputPercentage = 0;
                outputPercentage = 0;
                cachedPercentage = 0;
                cacheCreatePercentage = 0;
                reasoningPercentage = 0;
                totalPercentage = 0;
              }

              const totalDisplay = formatTokens(totalUsed);
              // For session mode, don't show max tokens or percentage
              const maxDisplay =
                viewMode === "session" ? "" : maxTokens ? ` / ${formatTokens(maxTokens)}` : "";
              const showPercentage = viewMode !== "session";

              // Helper to calculate cost percentage
              const getCostPercentage = (cost: number | undefined, total: number | undefined) =>
                total !== undefined && total > 0 && cost !== undefined ? (cost / total) * 100 : 0;

              // Recalculate costs with elevated pricing if 1M context is active
              let adjustedInputCost = displayUsage?.input.cost_usd;
              let adjustedOutputCost = displayUsage?.output.cost_usd;
              let adjustedReasoningCost = displayUsage?.reasoning.cost_usd;

              if (is1MActive && displayUsage && modelStats) {
                // Recalculate input cost with elevated pricing
                adjustedInputCost = calculateElevatedCost(
                  displayUsage.input.tokens,
                  modelStats.input_cost_per_token,
                  modelStats.input_cost_per_token_above_200k_tokens
                );
                // Recalculate output cost with elevated pricing
                adjustedOutputCost = calculateElevatedCost(
                  displayUsage.output.tokens,
                  modelStats.output_cost_per_token,
                  modelStats.output_cost_per_token_above_200k_tokens
                );
                // Recalculate reasoning cost with elevated pricing
                adjustedReasoningCost = calculateElevatedCost(
                  displayUsage.reasoning.tokens,
                  modelStats.output_cost_per_token,
                  modelStats.output_cost_per_token_above_200k_tokens
                );
              }

              // Calculate total cost (undefined if any cost is unknown)
              const totalCost: number | undefined = displayUsage
                ? adjustedInputCost !== undefined &&
                  displayUsage.cached.cost_usd !== undefined &&
                  displayUsage.cacheCreate.cost_usd !== undefined &&
                  adjustedOutputCost !== undefined &&
                  adjustedReasoningCost !== undefined
                  ? adjustedInputCost +
                    displayUsage.cached.cost_usd +
                    displayUsage.cacheCreate.cost_usd +
                    adjustedOutputCost +
                    adjustedReasoningCost
                  : undefined
                : undefined;

              // Calculate cost percentages (using adjusted costs for 1M context)
              const inputCostPercentage = getCostPercentage(adjustedInputCost, totalCost);
              const cachedCostPercentage = getCostPercentage(
                displayUsage?.cached.cost_usd,
                totalCost
              );
              const cacheCreateCostPercentage = getCostPercentage(
                displayUsage?.cacheCreate.cost_usd,
                totalCost
              );
              const outputCostPercentage = getCostPercentage(adjustedOutputCost, totalCost);
              const reasoningCostPercentage = getCostPercentage(adjustedReasoningCost, totalCost);

              // Build component data for table (using adjusted costs for 1M context)
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
                      cost: adjustedInputCost,
                      color: COMPONENT_COLORS.input,
                      show: true,
                    },
                    {
                      name: "Output",
                      tokens: displayUsage.output.tokens,
                      cost: adjustedOutputCost,
                      color: COMPONENT_COLORS.output,
                      show: true,
                    },
                    {
                      name: "Thinking",
                      tokens: displayUsage.reasoning.tokens,
                      cost: adjustedReasoningCost,
                      color: COMPONENT_COLORS.thinking,
                      show: displayUsage.reasoning.tokens > 0,
                    },
                  ].filter((c) => c.show)
                : [];

              return (
                <>
                  <ConsumerRow>
                    <ConsumerHeader>
                      <ConsumerName>
                        Token Usage
                        {is1MActive && <Context1MBadge>1M Context</Context1MBadge>}
                      </ConsumerName>
                      <ConsumerTokens>
                        {totalDisplay}
                        {maxDisplay}
                        {showPercentage && ` (${totalPercentage.toFixed(1)}%)`}
                      </ConsumerTokens>
                    </ConsumerHeader>
                    <PercentageBarWrapper>
                      <PercentageBar>
                        {cachedPercentage > 0 && <CachedSegment percentage={cachedPercentage} />}
                        {cacheCreatePercentage > 0 && (
                          <CachedSegment percentage={cacheCreatePercentage} />
                        )}
                        <InputSegment percentage={inputPercentage} />
                        <OutputSegment percentage={outputPercentage} />
                        {reasoningPercentage > 0 && (
                          <ThinkingSegment percentage={reasoningPercentage} />
                        )}
                      </PercentageBar>
                    </PercentageBarWrapper>
                  </ConsumerRow>
                  {totalCost !== undefined && totalCost >= 0 && (
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
                        const isNegligible =
                          component.cost !== undefined &&
                          component.cost > 0 &&
                          component.cost < 0.01;

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
