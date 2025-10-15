import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
import type { ChatStats } from "@/types/chatStats";
import type { CmuxMessage } from "@/types/message";
import { prepareTokenization, calculateConsumers } from "@/utils/tokens/consumerCalculator";

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

const FixedSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: var(--color-token-fixed);
`;

const VariableSegment = styled.div<SegmentProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: var(--color-token-variable);
`;

const LoadingState = styled.div`
  color: #888888;
  font-size: 13px;
  padding: 12px 0;
`;

// Format large numbers with k/M suffix
const formatTokens = (tokens: number): string => {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return tokens.toString();
};

interface TokenConsumerBreakdownProps {
  messages: CmuxMessage[];
  model: string;
}

export const TokenConsumerBreakdown: React.FC<TokenConsumerBreakdownProps> = ({
  messages,
  model,
}) => {
  const [stats, setStats] = useState<ChatStats | null>(null);
  const [isCalculating, setIsCalculating] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function calculate() {
      // Don't call IPC if there are no messages
      if (messages.length === 0) {
        setIsCalculating(false);
        setStats(null);
        return;
      }

      setIsCalculating(true);

      try {
        // Prepare all text for tokenization (pure function)
        const { texts, consumerMap, toolDefinitions } = prepareTokenization(messages, model);

        // Combine message texts + tool definition strings for bulk tokenization
        const allTexts = [...texts, ...Array.from(toolDefinitions.values())];

        // Batch tokenize everything in one IPC call
        const tokenCounts = await window.api.tokens.countBulk(model, allTexts);

        if (cancelled || !tokenCounts) {
          return; // Tokenizer not loaded or component unmounted
        }

        // Split results back into message tokens and tool definition tokens
        const messageTokens = tokenCounts.slice(0, texts.length);
        const toolDefCounts = new Map<string, number>();
        let defIndex = texts.length;
        for (const [toolName] of toolDefinitions) {
          toolDefCounts.set(toolName, tokenCounts[defIndex]);
          defIndex++;
        }

        // Calculate consumers (pure function)
        const consumers = calculateConsumers(messageTokens, consumerMap, toolDefCounts);
        const totalTokens = consumers.reduce((sum, c) => sum + c.tokens, 0);

        // Derive tokenizer name from model
        const tokenizerName = model.startsWith("anthropic:") ? "claude" : "o200k_base";

        setStats({
          consumers,
          totalTokens,
          model,
          tokenizerName,
          usageHistory: [], // Not used in this component
        });
      } catch (error) {
        console.error(`[TokenConsumerBreakdown] Failed to calculate stats:`, error);
      } finally {
        if (!cancelled) {
          setIsCalculating(false);
        }
      }
    }

    void calculate();

    return () => {
      cancelled = true;
    };
  }, [messages, model]);

  if (isCalculating) {
    return (
      <Section>
        <SectionTitle dimmed>Breakdown by Consumer</SectionTitle>
        <LoadingState>Calculating breakdown...</LoadingState>
      </Section>
    );
  }

  if (!stats || stats.consumers.length === 0) {
    return null;
  }

  return (
    <Section>
      <SectionTitle dimmed>Breakdown by Consumer</SectionTitle>
      <TokenizerInfo>
        Tokenizer: <span>{stats.tokenizerName}</span>
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
                <ConsumerName>{consumer.name}</ConsumerName>
                <ConsumerTokens>
                  {tokenDisplay} ({consumer.percentage.toFixed(1)}%)
                </ConsumerTokens>
              </ConsumerHeader>
              <PercentageBarWrapper>
                <PercentageBar>
                  {fixedPercentage > 0 && <FixedSegment percentage={fixedPercentage} />}
                  {variablePercentage > 0 && <VariableSegment percentage={variablePercentage} />}
                </PercentageBar>
              </PercentageBarWrapper>
            </ConsumerRow>
          );
        })}
      </ConsumerList>
    </Section>
  );
};
