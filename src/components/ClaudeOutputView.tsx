import React, { useState, useEffect, useRef } from 'react';
import styled from '@emotion/styled';

const OutputContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  overflow: hidden;
`;

const OutputHeader = styled.div`
  padding: 10px 15px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const WorkspaceTitle = styled.div`
  font-weight: 600;
  color: #cccccc;
`;

const StatusIndicator = styled.div<{ active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: ${props => props.active ? '#4ec9b0' : '#6b6b6b'};
  
  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${props => props.active ? '#4ec9b0' : '#6b6b6b'};
  }
`;

const OutputContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6b6b6b;
  text-align: center;
  
  h3 {
    margin: 0 0 10px 0;
    font-size: 16px;
    font-weight: 500;
  }
  
  p {
    margin: 0;
    font-size: 13px;
  }
`;

const MessageBlock = styled.div<{ type: string; isError?: boolean }>`
  margin-bottom: 15px;
  padding: 10px;
  background: ${props => {
    switch(props.type) {
      case 'user': return '#2d2d30';
      case 'assistant': return '#1e1e1e';
      case 'system': return '#1a1d29';
      case 'result': return props.isError ? '#3c1f1f' : '#1f3c1f';
      default: return '#1e1e1e';
    }
  }};
  border-left: 3px solid ${props => {
    switch(props.type) {
      case 'user': return '#569cd6';
      case 'assistant': return '#4ec9b0';
      case 'system': return '#808080';
      case 'result': return props.isError ? '#f48771' : '#b5cea8';
      default: return '#3e3e42';
    }
  }};
  border-radius: 3px;
`;

const MessageType = styled.div`
  font-size: 10px;
  text-transform: uppercase;
  color: #808080;
  margin-bottom: 5px;
`;

const MessageContent = styled.pre`
  margin: 0;
  font-family: inherit;
  white-space: pre-wrap;
`;

interface ClaudeOutputViewProps {
  projectName?: string;
  branch?: string;
  className?: string;
}

export const ClaudeOutputView: React.FC<ClaudeOutputViewProps> = ({
  projectName,
  branch,
  className
}) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [isActive, setIsActive] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!projectName || !branch) return;
    
    // Load initial output
    loadOutput();
    
    // Check if workspace is active
    checkStatus();
    
    // Subscribe to output updates
    const unsubscribe = window.api.claude.onOutput((data: any) => {
      if (data.projectName === projectName && data.branch === branch) {
        setMessages(prev => [...prev, data.message]);
        // Auto-scroll to bottom
        if (contentRef.current) {
          contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
      }
    });
    
    // Poll status periodically
    const statusInterval = setInterval(checkStatus, 5000);
    
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      clearInterval(statusInterval);
    };
  }, [projectName, branch]);
  
  const loadOutput = async () => {
    if (!projectName || !branch) return;
    
    try {
      const output = await window.api.claude.getOutput(projectName, branch);
      setMessages(output || []);
    } catch (error) {
      console.error('Failed to load output:', error);
    }
  };
  
  const checkStatus = async () => {
    if (!projectName || !branch) return;
    
    try {
      const active = await window.api.claude.isActive(projectName, branch);
      setIsActive(active);
    } catch (error) {
      console.error('Failed to check status:', error);
    }
  };
  
  const formatMessage = (msg: any) => {
    if (typeof msg === 'string') {
      return msg;
    }
    
    // Format SDK messages based on their type
    if (msg.content) {
      if (Array.isArray(msg.content)) {
        return msg.content.map((c: any) => c.text || JSON.stringify(c)).join('\n');
      }
      return msg.content;
    }
    
    // Fallback to JSON for complex messages
    return JSON.stringify(msg, null, 2);
  };
  
  const getMessageType = (msg: any): string => {
    if (msg.type) return msg.type;
    if (msg.role) return msg.role;
    if (msg.subtype) return msg.subtype;
    return 'unknown';
  };
  
  if (!projectName || !branch) {
    return (
      <OutputContainer className={className}>
        <EmptyState>
          <h3>No Workspace Selected</h3>
          <p>Select a workspace from the sidebar to view its output</p>
        </EmptyState>
      </OutputContainer>
    );
  }
  
  return (
    <OutputContainer className={className}>
      <OutputHeader>
        <WorkspaceTitle>{projectName} / {branch}</WorkspaceTitle>
        <StatusIndicator active={isActive}>
          {isActive ? 'Active' : 'Inactive'}
        </StatusIndicator>
      </OutputHeader>
      
      <OutputContent ref={contentRef}>
        {messages.length === 0 ? (
          <EmptyState>
            <h3>No Output Yet</h3>
            <p>Output from Claude Code will appear here</p>
          </EmptyState>
        ) : (
          messages.map((msg, index) => {
            const type = getMessageType(msg);
            return (
              <MessageBlock key={index} type={type} isError={msg.error}>
                <MessageType>{type}</MessageType>
                <MessageContent>{formatMessage(msg)}</MessageContent>
              </MessageBlock>
            );
          })
        )}
      </OutputContent>
    </OutputContainer>
  );
};