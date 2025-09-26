import React, { useState } from 'react';
import styled from '@emotion/styled';
import { UIMessage } from '../../types/claude';
import { PlanMarkdownRenderer } from './MarkdownRenderer';

const PlanContainer = styled.div<{ expanded: boolean }>`
  margin: 8px 0;
  background: var(--color-plan-mode-alpha);
  border: 1px solid var(--color-plan-mode);
  border-radius: 6px;
  overflow: hidden;
`;

const PlanHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  gap: 8px;
`;

const PlanIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: var(--color-plan-mode);
  color: white;
  border-radius: 3px;
  font-size: 11px;
  font-weight: bold;
  flex-shrink: 0;
`;

const PlanTitle = styled.span`
  color: var(--color-plan-mode);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex: 1;
`;

const ExpandIcon = styled.span<{ expanded: boolean }>`
  color: var(--color-plan-mode);
  font-size: 10px;
  transform: rotate(${props => props.expanded ? '90deg' : '0deg'});
  transition: transform 0.2s ease;
  opacity: 0.8;
`;

const PlanContent = styled.div`
  padding: 0 14px 14px 14px;
`;

interface PlanMessageProps {
  message: UIMessage;
  className?: string;
}

export const PlanMessage: React.FC<PlanMessageProps> = ({ message, className }) => {
  const [expanded, setExpanded] = useState(true);
  
  // Extract the plan content from the tool input
  const getPlanContent = () => {
    // Check for plan in toolInput
    if (message.metadata?.toolInput?.plan) {
      return message.metadata.toolInput.plan;
    }
    
    // Check in content array for tool_use block
    if (message.content && Array.isArray(message.content)) {
      const toolBlock = message.content.find((block: any) => 
        block.type === 'tool_use' && block.name === 'ExitPlanMode'
      );
      if (toolBlock?.input?.plan) {
        return toolBlock.input.plan;
      }
    }
    
    // Check in original SDK message
    const original = message.metadata?.originalSDKMessage;
    if (original?.message?.content && Array.isArray(original.message.content)) {
      const toolBlock = original.message.content.find((block: any) => 
        block.type === 'tool_use' && block.name === 'ExitPlanMode'
      );
      if (toolBlock?.input?.plan) {
        return toolBlock.input.plan;
      }
    }
    
    // Fallback to any string content
    if (typeof message.content === 'string') {
      return message.content;
    }
    
    return 'Plan details not available';
  };
  
  const planContent = getPlanContent();
  
  return (
    <div className={className}>
      <PlanContainer expanded={expanded}>
        <PlanHeader onClick={() => setExpanded(!expanded)}>
          <PlanIcon>P</PlanIcon>
          <PlanTitle>Plan</PlanTitle>
          <ExpandIcon expanded={expanded}>▶</ExpandIcon>
        </PlanHeader>
        
        {expanded && (
          <PlanContent>
            <PlanMarkdownRenderer content={planContent} />
          </PlanContent>
        )}
      </PlanContainer>
    </div>
  );
};