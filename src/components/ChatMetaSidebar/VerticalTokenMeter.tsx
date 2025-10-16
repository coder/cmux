import React from "react";
import styled from "@emotion/styled";
import { TooltipWrapper, Tooltip } from "../Tooltip";
import { TokenMeter } from "./TokenMeter";
import { type TokenMeterData, formatTokens, getSegmentLabel } from "@/utils/tokens/tokenMeterUtils";

const Container = styled.div`
  width: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  background: #252526;
  border-left: 1px solid #3e3e42;
`;

const PercentageLabel = styled.div`
  font-family: var(--font-primary);
  font-size: 8px;
  font-weight: 600;
  color: #cccccc;
  margin-bottom: 4px;
  text-align: center;
  flex-shrink: 0;
`;

const MeterWrapper = styled.div`
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 0;
`;

const EmptySpace = styled.div<{ percentage: number }>`
  flex: ${(props) => Math.max(0, 100 - props.percentage)};
  width: 100%;
`;

const MeterContainer = styled.div<{ percentage: number }>`
  flex: ${(props) => props.percentage};
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 20px;
`;

const BarWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;

  /* Force TooltipWrapper to expand to fill height */
  > * {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: var(--font-primary);
  font-size: 12px;
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 16px;
`;

const Dot = styled.div<{ color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(props) => props.color};
  flex-shrink: 0;
`;

const Divider = styled.div`
  border-top: 1px solid #3e3e42;
  margin: 4px 0;
`;

const VerticalTokenMeterComponent: React.FC<{ data: TokenMeterData }> = ({ data }) => {
  if (data.segments.length === 0) return null;

  // Scale the bar based on context window usage (0-100%)
  const usagePercentage = data.maxTokens ? data.totalPercentage : 100;

  return (
    <Container data-component="vertical-token-meter">
      {data.maxTokens && (
        <PercentageLabel data-label="context-percentage">
          {Math.round(data.totalPercentage)}
        </PercentageLabel>
      )}
      <MeterWrapper data-wrapper="meter-wrapper">
        <MeterContainer
          percentage={usagePercentage}
          data-container="meter-container"
          data-usage-percentage={Math.round(usagePercentage)}
        >
          <BarWrapper data-bar-wrapper="expand">
            <TooltipWrapper data-tooltip-wrapper="vertical-meter">
              <TokenMeter
                segments={data.segments}
                orientation="vertical"
                data-meter="token-bar"
                data-segment-count={data.segments.length}
              />
              <Tooltip data-tooltip="meter-details">
                <Content data-tooltip-content="usage-breakdown">
                  <div
                    style={{ fontWeight: 600, fontSize: 13, color: "#cccccc" }}
                    data-tooltip-title="last-request"
                  >
                    Last Request
                  </div>
                  <Divider data-divider="top" />
                  {data.segments.map((seg, i) => (
                    <Row
                      key={i}
                      data-row="segment"
                      data-segment-type={seg.type}
                      data-segment-tokens={seg.tokens}
                      data-segment-percentage={seg.percentage.toFixed(1)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Dot color={seg.color} data-dot={seg.type} />
                        <span data-label="segment-name">{getSegmentLabel(seg.type)}</span>
                      </div>
                      <span style={{ color: "#cccccc", fontWeight: 500 }} data-value="tokens">
                        {formatTokens(seg.tokens)}
                      </span>
                    </Row>
                  ))}
                  <Divider data-divider="bottom" />
                  <div
                    style={{ color: "#888888", fontSize: 11 }}
                    data-summary="total"
                    data-total-tokens={data.totalTokens}
                    data-max-tokens={data.maxTokens}
                  >
                    Total: {formatTokens(data.totalTokens)}
                    {data.maxTokens && ` / ${formatTokens(data.maxTokens)}`}
                    {data.maxTokens && ` (${data.totalPercentage.toFixed(1)}%)`}
                  </div>
                  <div
                    style={{ color: "#666666", fontSize: 10, marginTop: 8, fontStyle: "italic" }}
                  >
                    💡 Expand your viewport to see full details
                  </div>
                </Content>
              </Tooltip>
            </TooltipWrapper>
          </BarWrapper>
        </MeterContainer>
        <EmptySpace
          percentage={usagePercentage}
          data-space="empty-space"
          data-empty-percentage={Math.round(100 - usagePercentage)}
        />
      </MeterWrapper>
    </Container>
  );
};

// Memoize to prevent re-renders when data hasn't changed
export const VerticalTokenMeter = React.memo(VerticalTokenMeterComponent);
