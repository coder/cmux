import React from "react";
import styled from "@emotion/styled";
import { useChatContext } from "../../contexts/ChatContext";

const Container = styled.div`
  color: #d4d4d4;
  font-family: var(--font-primary);
  font-size: 13px;
  line-height: 1.6;
`;

const Section = styled.div`
  margin-bottom: 24px;
`;

const SectionTitle = styled.h3`
  color: #cccccc;
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
  font-size: 24px;
  font-weight: 700;
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
`;

const ConsumerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
`;

const ConsumerName = styled.span`
  color: #cccccc;
  font-weight: 500;
`;

const ConsumerTokens = styled.span`
  color: #888888;
  font-size: 12px;
`;

const PercentageBar = styled.div`
  width: 100%;
  height: 6px;
  background: #3e3e42;
  border-radius: 3px;
  overflow: hidden;
`;

interface PercentageFillProps {
  percentage: number;
}

const PercentageFill = styled.div<PercentageFillProps>`
  height: 100%;
  width: ${(props) => props.percentage}%;
  background: linear-gradient(90deg, #007acc 0%, #005a9e 100%);
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

export const CostsTab: React.FC = () => {
  const { stats, isCalculating } = useChatContext();

  if (isCalculating) {
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
      <Section>
        <SectionTitle>Content Tokens</SectionTitle>
        <TokenizerInfo>Estimated using {stats.tokenizerName}</TokenizerInfo>
        <TotalTokens>{stats.totalTokens.toLocaleString()} tokens</TotalTokens>
        <InfoNote>
          Actual API costs include system overhead (prompts, tool definitions, etc.)
        </InfoNote>
      </Section>

      <Section>
        <SectionTitle>Breakdown by Consumer</SectionTitle>
        <ConsumerList>
          {stats.consumers.map((consumer) => (
            <ConsumerRow key={consumer.name}>
              <ConsumerHeader>
                <ConsumerName>{consumer.name}</ConsumerName>
                <ConsumerTokens>
                  {consumer.tokens.toLocaleString()} ({consumer.percentage.toFixed(1)}%)
                </ConsumerTokens>
              </ConsumerHeader>
              <PercentageBar>
                <PercentageFill percentage={consumer.percentage} />
              </PercentageBar>
            </ConsumerRow>
          ))}
        </ConsumerList>
      </Section>

      {stats.lastUsage && (
        <Section>
          <SectionTitle>Last API Response</SectionTitle>
          <ConsumerList>
            <ConsumerRow>
              <ConsumerHeader>
                <ConsumerName>Prompt Tokens</ConsumerName>
                <ConsumerTokens>{stats.lastUsage.promptTokens.toLocaleString()}</ConsumerTokens>
              </ConsumerHeader>
            </ConsumerRow>
            <ConsumerRow>
              <ConsumerHeader>
                <ConsumerName>Completion Tokens</ConsumerName>
                <ConsumerTokens>{stats.lastUsage.completionTokens.toLocaleString()}</ConsumerTokens>
              </ConsumerHeader>
            </ConsumerRow>
            <ConsumerRow>
              <ConsumerHeader>
                <ConsumerName>Total Tokens</ConsumerName>
                <ConsumerTokens>{stats.lastUsage.totalTokens.toLocaleString()}</ConsumerTokens>
              </ConsumerHeader>
            </ConsumerRow>
          </ConsumerList>
        </Section>
      )}
    </Container>
  );
};
