import React from "react";
import { TooltipWrapper, Tooltip } from "../Tooltip";
import { TokenMeter } from "./TokenMeter";
import { type TokenMeterData, formatTokens, getSegmentLabel } from "@/utils/tokens/tokenMeterUtils";

const VerticalTokenMeterComponent: React.FC<{ data: TokenMeterData }> = ({ data }) => {
  if (data.segments.length === 0) return null;

  // Scale the bar based on context window usage (0-100%)
  const usagePercentage = data.maxTokens ? data.totalPercentage : 100;

  return (
    <div
      className="w-5 h-full flex flex-col items-center py-3 bg-[#252526] border-l border-[#3e3e42]"
      data-component="vertical-token-meter"
    >
      {data.maxTokens && (
        <div
          className="font-primary text-[8px] font-semibold text-[#cccccc] mb-1 text-center flex-shrink-0"
          data-label="context-percentage"
        >
          {Math.round(data.totalPercentage)}
        </div>
      )}
      <div
        className="flex-1 w-full flex flex-col items-center min-h-0"
        data-wrapper="meter-wrapper"
      >
        <div
          className="w-full flex flex-col items-center min-h-[20px]"
          style={{ flex: usagePercentage }}
          data-container="meter-container"
          data-usage-percentage={Math.round(usagePercentage)}
        >
          <div
            className="flex-1 flex flex-col items-center w-full [&>*]:flex-1 [&>*]:flex [&>*]:flex-col"
            data-bar-wrapper="expand"
          >
            <TooltipWrapper data-tooltip-wrapper="vertical-meter">
              <TokenMeter
                segments={data.segments}
                orientation="vertical"
                data-meter="token-bar"
                data-segment-count={data.segments.length}
              />
              <Tooltip data-tooltip="meter-details">
                <div
                  className="flex flex-col gap-2 font-primary text-xs"
                  data-tooltip-content="usage-breakdown"
                >
                  <div
                    className="font-semibold text-[13px] text-[#cccccc]"
                    data-tooltip-title="last-request"
                  >
                    Last Request
                  </div>
                  <div className="border-t border-[#3e3e42] my-1" data-divider="top" />
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
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: seg.color }}
                          data-dot={seg.type}
                        />
                        <span data-label="segment-name">{getSegmentLabel(seg.type)}</span>
                      </div>
                      <span className="text-[#cccccc] font-medium" data-value="tokens">
                        {formatTokens(seg.tokens)}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-[#3e3e42] my-1" data-divider="bottom" />
                  <div
                    className="text-[#888] text-[11px]"
                    data-summary="total"
                    data-total-tokens={data.totalTokens}
                    data-max-tokens={data.maxTokens}
                  >
                    Total: {formatTokens(data.totalTokens)}
                    {data.maxTokens && ` / ${formatTokens(data.maxTokens)}`}
                    {data.maxTokens && ` (${data.totalPercentage.toFixed(1)}%)`}
                  </div>
                  <div className="text-[#666] text-[10px] mt-2 italic">
                    💡 Expand your viewport to see full details
                  </div>
                </div>
              </Tooltip>
            </TooltipWrapper>
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
