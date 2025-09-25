import React, { useState } from 'react';
import styled from '@emotion/styled';
import { UIMessage } from '../../types/claude';

const BreadcrumbContainer = styled.div<{ type: string }>`
  margin: 4px 0;
  padding: 4px 8px;
  background: ${props => props.type === 'result' ? '#1f3c1f' : 'rgba(255, 255, 255, 0.03)'};
  border-left: 2px solid ${props => props.type === 'result' ? '#b5cea8' : '#3e3e42'};
  border-radius: 2px;
  font-size: 10px;
  color: ${props => props.type === 'result' ? '#b5cea8' : '#808080'};
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 20px;
`;

const BreadcrumbContent = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
`;

const BreadcrumbIcon = styled.span<{ type: string }>`
  font-size: 8px;
  color: ${props => {
    switch(props.type) {
      case 'system': return '#808080';
      case 'result': return '#b5cea8';
      default: return '#6b6b6b';
    }
  }};
`;

const BreadcrumbText = styled.span`
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const BreadcrumbDetails = styled.span`
  color: #6b6b6b;
  font-weight: normal;
  margin-left: 4px;
`;

const BreadcrumbToggle = styled.button`
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #808080;
  padding: 1px 4px;
  border-radius: 2px;
  cursor: pointer;
  font-size: 8px;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
  }
`;

const BreadcrumbJson = styled.pre`
  margin: 4px 0 0 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 9px;
  line-height: 1.3;
  color: #d4d4d4;
  background: rgba(0, 0, 0, 0.2);
  padding: 4px 6px;
  border-radius: 2px;
  overflow-x: auto;
  max-height: 100px;
  overflow-y: auto;
`;

interface BreadcrumbProps {
  message: UIMessage;
  className?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ message, className }) => {
  const [showJson, setShowJson] = useState(false);
  
  const getIcon = (): string => {
    switch (message.type) {
      case 'system': return '⚙️';
      case 'result': return '✓';
      default: return '•';
    }
  };
  
  const formatDuration = (ms?: number): string => {
    if (!ms) return '';
    
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(1);
      return `${minutes}m ${seconds}s`;
    }
  };

  const getDisplayText = (): string => {
    switch (message.type) {
      case 'system':
        const model = message.metadata?.originalSDKMessage?.model || 'unknown';
        return `Session initialized • ${model}`;
      case 'result':
        const cost = message.metadata?.cost;
        const duration = message.metadata?.duration;
        const costStr = cost ? ` • $${cost.toFixed(5)}` : '';
        const durationStr = duration ? ` • ${formatDuration(duration)}` : '';
        return `Completed${costStr}${durationStr}`;
      default:
        return message.content.slice(0, 50);
    }
  };
  
  return (
    <div className={className}>
      <BreadcrumbContainer type={message.type}>
        <BreadcrumbContent>
          <BreadcrumbIcon type={message.type}>{getIcon()}</BreadcrumbIcon>
          <BreadcrumbText>{message.type}</BreadcrumbText>
          <BreadcrumbDetails>{getDisplayText()}</BreadcrumbDetails>
        </BreadcrumbContent>
        <BreadcrumbToggle onClick={() => setShowJson(!showJson)}>
          {showJson ? '−' : '+'}
        </BreadcrumbToggle>
      </BreadcrumbContainer>
      
      {showJson && (
        <BreadcrumbJson>
          {JSON.stringify(message.metadata?.originalSDKMessage || message, null, 2)}
        </BreadcrumbJson>
      )}
    </div>
  );
};