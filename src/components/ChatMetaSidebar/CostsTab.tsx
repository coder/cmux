import React from "react";
import styled from "@emotion/styled";
import { useWorkspaceUsage, useWorkspaceConsumers } from "@/stores/WorkspaceStore";
import { TooltipWrapper, Tooltip, HelpIndicator } from "../Tooltip";
import { getModelStats } from "@/utils/tokens/modelStats";
import { sumUsageHistory } from "@/utils/tokens/usageAggregator";
import { usePersistedState } from "@/hooks/usePersistedState";
import { ToggleGroup, type ToggleOption } from "../ToggleGroup";
import { use1MContext } from "@/hooks/use1MContext";
import { supports1MContext } from "@/utils/ai/models";
import { TOKEN_COMPONENT_COLORS } from "@/utils/tokens/tokenMeterUtils";
import { ConsumerBreakdown } from "./ConsumerBreakdown";

const Container = styled.div`
  color: #d4d4d4;
  font-family: var(--font-primary);
  font-size: 13px;
  line-height: 1.6;
`;

const Section = styled.div<{ marginTop?: string; marginBottom?: string }>`
  margin-bottom: ${(props) => props.marginBottom ?? "24px"};
  margin-top: ${(props) => props.marginTop ?? "0"};
`;

const SectionTitle = styled.h3<{ dimmed?: boolean }>`
  color: ${(props) => (props.dimmed ? "#999999" : "#cccccc")};
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
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

const InputSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: ${TOKEN_COMPONENT_COLORS.input};
  transition: width 0.3s ease;
`;

const OutputSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: ${TOKEN_COMPONENT_COLORS.output};
  transition: width 0.3s ease;
`;

const ThinkingSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: ${TOKEN_COMPONENT_COLORS.thinking};
  transition: width 0.3s ease;
`;

const CachedSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: ${TOKEN_COMPONENT_COLORS.cached};
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
const calculateElevatedCost = (tokens: number, standardRate: number, isInput: boolean): number => {
  if (tokens <= 200_000) {
    return tokens * standardRate;
  }
  const baseCost = 200_000 * standardRate;
  const elevatedTokens = tokens - 200_000;
  const elevatedMultiplier = isInput ? 2.0 : 1.5;
  const elevatedCost = elevatedTokens * standardRate * elevatedMultiplier;
  return baseCost + elevatedCost;
};

type ViewMode = "last-request" | "session";

const VIEW_MODE_OPTIONS: Array<ToggleOption<ViewMode>> = [
  { value: "session", label: "Session" },
  { value: "last-request", label: "Last Request" },
];

interface CostsTabProps {
  workspaceId: string;
}

export const CostsTab: React.FC<CostsTabProps> = ({ workspaceId }) => {
  const usage = useWorkspaceUsage(workspaceId);
  const consumers = useWorkspaceConsumers(workspaceId);
  const [viewMode, setViewMode] = usePersistedState<ViewMode>("costsTab:viewMode", "session");
  const [use1M] = use1MContext();

  // Check if we have any data to display
  const hasUsageData = usage && usage.usageHistory.length > 0;
  const hasConsumerData = consumers && (consumers.totalTokens > 0 || consumers.isCalculating);
  const hasAnyData = hasUsageData || hasConsumerData;

  // Only show empty state if truly no data anywhere
  if (!hasAnyData) {
    return (
      <Container>
        <EmptyState>
          <p>No messages yet.</p>
          <p>Send a message to see token usage statistics.</p>
        </EmptyState>
      </Container>
    );
  }

  // Context Usage always shows Last Request data
  const lastRequestUsage = hasUsageData ? usage.usageHistory[usage.usageHistory.length - 1] : undefined;

  // Cost and Details table use viewMode
  const displayUsage =
    viewMode === "last-request"
      ? usage.usageHistory[usage.usageHistory.length - 1]
      : sumUsageHistory(usage.usageHistory);

  return (
    <Container>
      {hasUsageData && (
        <Section data-testid="context-usage-section" marginTop="8px" marginBottom="20px">
          <ConsumerList data-testid="context-usage-list">
            {(() => {
              // Context Usage always uses last request
              const contextUsage = lastRequestUsage;
              
              // Get model from last request (for context window display)
              const model = lastRequestUsage?.model ?? "unknown";
              
              // Get max tokens for the model from the model stats database
              const modelStats = getModelStats(model);
              const baseMaxTokens = modelStats?.max_input_tokens;
              // Check if 1M context is active and supported
              const is1MActive = use1M && supports1MContext(model);
              const maxTokens = is1MActive ? 1_000_000 : baseMaxTokens;
              
              // Total tokens includes cache creation (they're input tokens sent for caching)
              const totalUsed = contextUsage
                ? contextUsage.input.tokens +
                  contextUsage.cached.tokens +
                  contextUsage.cacheCreate.tokens +
                  contextUsage.output.tokens +
                  contextUsage.reasoning.tokens
                : 0;

              // Calculate percentages based on max tokens (actual context window usage)
              let inputPercentage: number;
              let outputPercentage: number;
              let cachedPercentage: number;
              let cacheCreatePercentage: number;
              let reasoningPercentage: number;
              let showWarning = false;
              let totalPercentage: number;

              if (maxTokens && contextUsage) {
                // We know the model's max tokens - show actual context window usage
                inputPercentage = (contextUsage.input.tokens / maxTokens) * 100;
                outputPercentage = (contextUsage.output.tokens / maxTokens) * 100;
                cachedPercentage = (contextUsage.cached.tokens / maxTokens) * 100;
                cacheCreatePercentage = (contextUsage.cacheCreate.tokens / maxTokens) * 100;
                reasoningPercentage = (contextUsage.reasoning.tokens / maxTokens) * 100;
                totalPercentage = (totalUsed / maxTokens) * 100;
              } else if (contextUsage) {
                // Unknown model - scale to total tokens used
                inputPercentage = totalUsed > 0 ? (contextUsage.input.tokens / totalUsed) * 100 : 0;
                outputPercentage = totalUsed > 0 ? (contextUsage.output.tokens / totalUsed) * 100 : 0;
                cachedPercentage = totalUsed > 0 ? (contextUsage.cached.tokens / totalUsed) * 100 : 0;
                cacheCreatePercentage = totalUsed > 0 ? (contextUsage.cacheCreate.tokens / totalUsed) * 100 : 0;
                reasoningPercentage = totalUsed > 0 ? (contextUsage.reasoning.tokens / totalUsed) * 100 : 0;
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
              const maxDisplay = maxTokens ? ` / ${formatTokens(maxTokens)}` : "";

              return (
                <>
                  <ConsumerRow data-testid="context-usage">
                    <ConsumerHeader>
                      <ConsumerName>Context Usage</ConsumerName>
                      <ConsumerTokens>
                        {totalDisplay}
                        {maxDisplay}
                        {` (${totalPercentage.toFixed(1)}%)`}
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
                  {showWarning && (
                    <ModelWarning>Unknown model limits - showing relative usage only</ModelWarning>
                  )}
                </>
              );
            })()}
          </ConsumerList>
        </Section>
      )}

      {hasUsageData && (
        <Section data-testid="cost-section">
          <SectionHeader data-testid="cost-header" style={{ display: "flex", gap: "12px" }}>
            <ConsumerName>Cost</ConsumerName>
            <ToggleGroup options={VIEW_MODE_OPTIONS} value={viewMode} onChange={setViewMode} />
          </SectionHeader>
          <ConsumerList>
            {(() => {
              // Cost and Details use viewMode-dependent data
              // Get model from the displayUsage (which could be last request or session sum)
              const model = displayUsage?.model ?? lastRequestUsage?.model ?? "unknown";
              const modelStats = getModelStats(model);
              const is1MActive = use1M && supports1MContext(model);

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
                  true // isInput
                );
                // Recalculate output cost with elevated pricing
                adjustedOutputCost = calculateElevatedCost(
                  displayUsage.output.tokens,
                  modelStats.output_cost_per_token,
                  false // isOutput
                );
                // Recalculate reasoning cost with elevated pricing
                adjustedReasoningCost = calculateElevatedCost(
                  displayUsage.reasoning.tokens,
                  modelStats.output_cost_per_token,
                  false // isOutput
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
                      color: TOKEN_COMPONENT_COLORS.cached,
                      show: displayUsage.cached.tokens > 0,
                    },
                    {
                      name: "Cache Create",
                      tokens: displayUsage.cacheCreate.tokens,
                      cost: displayUsage.cacheCreate.cost_usd,
                      color: TOKEN_COMPONENT_COLORS.cached,
                      show: displayUsage.cacheCreate.tokens > 0,
                    },
                    {
                      name: "Input",
                      tokens: displayUsage.input.tokens,
                      cost: adjustedInputCost,
                      color: TOKEN_COMPONENT_COLORS.input,
                      show: true,
                    },
                    {
                      name: "Output",
                      tokens: displayUsage.output.tokens,
                      cost: adjustedOutputCost,
                      color: TOKEN_COMPONENT_COLORS.output,
                      show: true,
                    },
                    {
                      name: "Thinking",
                      tokens: displayUsage.reasoning.tokens,
                      cost: adjustedReasoningCost,
                      color: TOKEN_COMPONENT_COLORS.thinking,
                      show: displayUsage.reasoning.tokens > 0,
                    },
                  ].filter((c) => c.show)
                : [];

              return (
                <>
                  {totalCost !== undefined && totalCost >= 0 && (
                    <ConsumerRow data-testid="cost-bar">
                      <ConsumerHeader>
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
                  <DetailsTable data-testid="cost-details">
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
                </>
              );
            })()}
          </ConsumerList>
        </Section>
      )}

      <Section>
        <SectionTitle dimmed>Breakdown by Consumer</SectionTitle>
        <ConsumerBreakdown consumers={consumers} />
      </Section>
    </Container>
  );
};
