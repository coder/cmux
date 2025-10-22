import React from "react";
import { useWorkspaceUsage, useWorkspaceConsumers } from "@/stores/WorkspaceStore";
import { getModelStats } from "@/utils/tokens/modelStats";
import { sumUsageHistory } from "@/utils/tokens/usageAggregator";
import { usePersistedState } from "@/hooks/usePersistedState";
import { ToggleGroup, type ToggleOption } from "../ToggleGroup";
import { use1MContext } from "@/hooks/use1MContext";
import { supports1MContext } from "@/utils/ai/models";
import { TOKEN_COMPONENT_COLORS } from "@/utils/tokens/tokenMeterUtils";
import { ConsumerBreakdown } from "./ConsumerBreakdown";
import { cn } from "@/lib/utils";

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

const CostsTabComponent: React.FC<CostsTabProps> = ({ workspaceId }) => {
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
      <div className="text-[#d4d4d4] font-[var(--font-primary)] text-[13px] leading-relaxed">
        <div className="text-text-secondary text-center py-10 px-5">
          <p>No messages yet.</p>
          <p>Send a message to see token usage statistics.</p>
        </div>
      </div>
    );
  }

  // Context Usage always shows Last Request data
  const lastRequestUsage = hasUsageData
    ? usage.usageHistory[usage.usageHistory.length - 1]
    : undefined;

  // Cost and Details table use viewMode
  const displayUsage =
    viewMode === "last-request"
      ? usage.usageHistory[usage.usageHistory.length - 1]
      : sumUsageHistory(usage.usageHistory);

  return (
    <div className="text-[#d4d4d4] font-[var(--font-primary)] text-[13px] leading-relaxed">
      {hasUsageData && (
        <div data-testid="context-usage-section" className="mt-2 mb-5">
          <div data-testid="context-usage-list" className="flex flex-col gap-3">
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
                outputPercentage =
                  totalUsed > 0 ? (contextUsage.output.tokens / totalUsed) * 100 : 0;
                cachedPercentage =
                  totalUsed > 0 ? (contextUsage.cached.tokens / totalUsed) * 100 : 0;
                cacheCreatePercentage =
                  totalUsed > 0 ? (contextUsage.cacheCreate.tokens / totalUsed) * 100 : 0;
                reasoningPercentage =
                  totalUsed > 0 ? (contextUsage.reasoning.tokens / totalUsed) * 100 : 0;
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
                  <div data-testid="context-usage" className="flex flex-col gap-1 mb-2 relative">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[#cccccc] font-medium inline-flex items-baseline gap-1">
                        Context Usage
                      </span>
                      <span className="text-[#888888] text-xs">
                        {totalDisplay}
                        {maxDisplay}
                        {` (${totalPercentage.toFixed(1)}%)`}
                      </span>
                    </div>
                    <div className="relative w-full">
                      <div className="w-full h-1.5 bg-[#3e3e42] rounded-[3px] overflow-hidden flex">
                        {cachedPercentage > 0 && (
                          <div
                            className="h-full transition-[width] duration-300"
                            style={{
                              width: `${cachedPercentage}%`,
                              background: TOKEN_COMPONENT_COLORS.cached,
                            }}
                          />
                        )}
                        {cacheCreatePercentage > 0 && (
                          <div
                            className="h-full transition-[width] duration-300"
                            style={{
                              width: `${cacheCreatePercentage}%`,
                              background: TOKEN_COMPONENT_COLORS.cached,
                            }}
                          />
                        )}
                        <div
                          className="h-full transition-[width] duration-300"
                          style={{
                            width: `${inputPercentage}%`,
                            background: TOKEN_COMPONENT_COLORS.input,
                          }}
                        />
                        <div
                          className="h-full transition-[width] duration-300"
                          style={{
                            width: `${outputPercentage}%`,
                            background: TOKEN_COMPONENT_COLORS.output,
                          }}
                        />
                        {reasoningPercentage > 0 && (
                          <div
                            className="h-full transition-[width] duration-300"
                            style={{
                              width: `${reasoningPercentage}%`,
                              background: TOKEN_COMPONENT_COLORS.thinking,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  {showWarning && (
                    <div className="text-[#999999] text-[11px] mt-2 italic">
                      Unknown model limits - showing relative usage only
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {hasUsageData && (
        <div data-testid="cost-section" className="mb-6">
          <div className="flex flex-col gap-3">
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
                    <div data-testid="cost-bar" className="flex flex-col gap-1 mb-2 relative">
                      <div
                        data-testid="cost-header"
                        className="flex justify-between items-baseline mb-2"
                      >
                        <div className="flex gap-3 items-center">
                          <span className="text-[#cccccc] font-medium inline-flex items-baseline gap-1">
                            Cost
                          </span>
                          <ToggleGroup
                            options={VIEW_MODE_OPTIONS}
                            value={viewMode}
                            onChange={setViewMode}
                          />
                        </div>
                        <span className="text-[#888888] text-xs">
                          {formatCostWithDollar(totalCost)}
                        </span>
                      </div>
                      <div className="relative w-full">
                        <div className="w-full h-1.5 bg-[#3e3e42] rounded-[3px] overflow-hidden flex">
                          {cachedCostPercentage > 0 && (
                            <div
                              className="h-full transition-[width] duration-300"
                              style={{
                                width: `${cachedCostPercentage}%`,
                                background: TOKEN_COMPONENT_COLORS.cached,
                              }}
                            />
                          )}
                          {cacheCreateCostPercentage > 0 && (
                            <div
                              className="h-full transition-[width] duration-300"
                              style={{
                                width: `${cacheCreateCostPercentage}%`,
                                background: TOKEN_COMPONENT_COLORS.cached,
                              }}
                            />
                          )}
                          <div
                            className="h-full transition-[width] duration-300"
                            style={{
                              width: `${inputCostPercentage}%`,
                              background: TOKEN_COMPONENT_COLORS.input,
                            }}
                          />
                          <div
                            className="h-full transition-[width] duration-300"
                            style={{
                              width: `${outputCostPercentage}%`,
                              background: TOKEN_COMPONENT_COLORS.output,
                            }}
                          />
                          {reasoningCostPercentage > 0 && (
                            <div
                              className="h-full transition-[width] duration-300"
                              style={{
                                width: `${reasoningCostPercentage}%`,
                                background: TOKEN_COMPONENT_COLORS.thinking,
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <table
                    data-testid="cost-details"
                    className="w-full mt-1 border-collapse text-[11px]"
                  >
                    <thead>
                      <tr className="border-b border-[#3e3e42]">
                        <th className="text-left text-[#888888] font-medium py-1 pr-2 [&:last-child]:text-right [&:last-child]:pr-0">
                          Component
                        </th>
                        <th className="text-left text-[#888888] font-medium py-1 pr-2 [&:last-child]:text-right [&:last-child]:pr-0">
                          Tokens
                        </th>
                        <th className="text-left text-[#888888] font-medium py-1 pr-2 [&:last-child]:text-right [&:last-child]:pr-0">
                          Cost
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {components.map((component) => {
                        const costDisplay = formatCostWithDollar(component.cost);
                        const isNegligible =
                          component.cost !== undefined &&
                          component.cost > 0 &&
                          component.cost < 0.01;

                        return (
                          <tr key={component.name}>
                            <td className="py-1 pr-2 text-[#cccccc] [&:last-child]:text-right [&:last-child]:pr-0">
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="w-2 h-2 rounded-sm flex-shrink-0"
                                  style={{ background: component.color }}
                                />
                                {component.name}
                              </div>
                            </td>
                            <td className="py-1 pr-2 text-[#cccccc] [&:last-child]:text-right [&:last-child]:pr-0">
                              {formatTokens(component.tokens)}
                            </td>
                            <td className="py-1 pr-2 text-[#cccccc] [&:last-child]:text-right [&:last-child]:pr-0">
                              {isNegligible ? (
                                <span className="text-[#666666] italic">{costDisplay}</span>
                              ) : (
                                costDisplay
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-[#999999] text-sm font-semibold m-0 mb-3 uppercase tracking-wide">
          Breakdown by Consumer
        </h3>
        <ConsumerBreakdown consumers={consumers} />
      </div>
    </div>
  );
};

// Memoize to prevent re-renders when parent (AIView) re-renders during streaming
// Only re-renders when workspaceId changes or internal hook data (usage/consumers) updates
export const CostsTab = React.memo(CostsTabComponent);
