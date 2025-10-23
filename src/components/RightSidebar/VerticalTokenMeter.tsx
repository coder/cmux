import React from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { TokenMeter } from "./TokenMeter";
import { type TokenMeterData, formatTokens, getSegmentLabel } from "@/utils/tokens/tokenMeterUtils";

const VerticalTokenMeterComponent: React.FC<{ data: TokenMeterData }> = ({ data }) => {
  if (data.segments.length === 0) return null;

  // Scale the bar based on context window usage (0-100%)
  const usagePercentage = data.maxTokens ? data.totalPercentage : 100;

  return (
    <div
      className="bg-separator border-border-light flex h-full w-5 flex-col items-center border-l py-3"
      data-component="vertical-token-meter"
    >
      {data.maxTokens && (
        <div
          className="font-primary text-foreground mb-1 shrink-0 text-center text-[8px] font-semibold"
          data-label="context-percentage"
        >
          {Math.round(data.totalPercentage)}
        </div>
      )}
      <div
        className="flex min-h-0 w-full flex-1 flex-col items-center"
        data-wrapper="meter-wrapper"
      >
        <div
          className="flex min-h-[20px] w-full flex-col items-center"
          style={{ flex: usagePercentage }}
          data-container="meter-container"
          data-usage-percentage={Math.round(usagePercentage)}
        >
          <div
            className="flex w-full flex-1 flex-col items-center [&>*]:flex [&>*]:flex-1 [&>*]:flex-col"
            data-bar-wrapper="expand"
          >
            <Tooltip>
              <TooltipTrigger asChild data-tooltip-wrapper="vertical-meter">
                <TokenMeter
                  segments={data.segments}
                  orientation="vertical"
                  data-meter="token-bar"
                  data-segment-count={data.segments.length}
                />
              </TooltipTrigger>
              <TooltipContent data-tooltip="meter-details">
                <div
                  className="font-primary flex flex-col gap-2 text-xs"
                  data-tooltip-content="usage-breakdown"
                >
                  <div
                    className="text-foreground text-[13px] font-semibold"
                    data-tooltip-title="last-request"
                  >
                    Last Request
                  </div>
                  <div className="border-border-light my-1 border-t" data-divider="top" />
                  {data.segments.map((seg, i) => (
                    <div
                      key={i}
                      className="flex justify-between gap-4"
                      data-row="segment"
                      data-segment-type={seg.type}
                      data-segment-tokens={seg.tokens}
                      data-segment-percentage={seg.percentage.toFixed(1)}
                    >
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: seg.color }}
                          data-dot={seg.type}
                        />
                        <span data-label="segment-name">{getSegmentLabel(seg.type)}</span>
                      </div>
                      <span className="text-foreground font-medium" data-value="tokens">
                        {formatTokens(seg.tokens)}
                      </span>
                    </div>
                  ))}
                  <div className="border-border-light my-1 border-t" data-divider="bottom" />
                  <div
                    className="text-muted text-[11px]"
                    data-summary="total"
                    data-total-tokens={data.totalTokens}
                    data-max-tokens={data.maxTokens}
                  >
                    Total: {formatTokens(data.totalTokens)}
                    {data.maxTokens && ` / ${formatTokens(data.maxTokens)}`}
                    {data.maxTokens && ` (${data.totalPercentage.toFixed(1)}%)`}
                  </div>
                  <div className="text-text-dim mt-2 text-[10px] italic">
                    💡 Expand your viewport to see full details
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div
          className="w-full"
          style={{ flex: Math.max(0, 100 - usagePercentage) }}
          data-space="empty-space"
          data-empty-percentage={Math.round(100 - usagePercentage)}
        />
      </div>
    </div>
  );
};

// Memoize to prevent re-renders when data hasn't changed
export const VerticalTokenMeter = React.memo(VerticalTokenMeterComponent);
