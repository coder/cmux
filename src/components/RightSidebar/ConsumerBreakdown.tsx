import React from "react";
import type { WorkspaceConsumersState } from "@/stores/WorkspaceStore";
import { TooltipWrapper, Tooltip, HelpIndicator } from "../Tooltip";

// Format token display - show k for thousands with 1 decimal
const formatTokens = (tokens: number) =>
  tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens.toLocaleString();

interface ConsumerBreakdownProps {
  consumers: WorkspaceConsumersState;
}

const ConsumerBreakdownComponent: React.FC<ConsumerBreakdownProps> = ({ consumers }) => {
  if (consumers.isCalculating) {
    return <div className="text-text-secondary italic py-3">Calculating consumer breakdown...</div>;
  }

  if (consumers.consumers.length === 0) {
    return <div className="text-[#666666] italic py-3 text-left">No consumer data available</div>;
  }

  return (
    <>
      <div className="text-[#888888] text-xs mb-2">
        Tokenizer: <span>{consumers.tokenizerName}</span>
      </div>
      <div className="flex flex-col gap-3">
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
            <div key={consumer.name} className="flex flex-col gap-1 mb-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[#cccccc] font-medium flex items-center gap-1">
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
                </span>
                <span className="text-[#888888] text-xs">
                  {tokenDisplay} ({consumer.percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="w-full h-2 bg-[#2a2a2a] rounded overflow-hidden flex">
                  {consumer.fixedTokens && consumer.variableTokens ? (
                    <>
                      <div
                        className="h-full transition-[width] duration-300"
                        style={{
                          width: `${fixedPercentage}%`,
                          background: "var(--color-token-fixed)",
                        }}
                      />
                      <div
                        className="h-full transition-[width] duration-300"
                        style={{
                          width: `${variablePercentage}%`,
                          background: "var(--color-token-variable)",
                        }}
                      />
                    </>
                  ) : (
                    <div
                      className="h-full transition-[width] duration-300"
                      style={{
                        width: `${consumer.percentage}%`,
                        background: "linear-gradient(90deg, #4a9eff 0%, #6b5ce7 100%)",
                      }}
                    />
                  )}
                </div>
                {consumer.fixedTokens && consumer.variableTokens && (
                  <div className="text-[#666666] text-[11px] text-left">
                    Tool definition: {formatTokens(consumer.fixedTokens)} • Usage:{" "}
                    {formatTokens(consumer.variableTokens)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

// Memoize to prevent re-renders when parent re-renders but consumers data hasn't changed
// Only re-renders when consumers object reference changes (when store bumps it)
export const ConsumerBreakdown = React.memo(ConsumerBreakdownComponent);
