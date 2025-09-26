import React from 'react';
import { UIMessage } from '../../types/claude';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { ToolUseMessage } from './ToolUseMessage';
import { SystemMessage } from './SystemMessage';
import { ResultMessage } from './ResultMessage';
import { StreamingMessage } from './StreamingMessage';
import { BashResultMessage } from './BashResultMessage';
import { ToolResultMessage } from './ToolResultMessage';
import { DebugMessage } from './DebugMessage';
import { PlanMessage } from './PlanMessage';

interface MessageRendererProps {
  message: UIMessage;
  className?: string;
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({ message, className }) => {
  // Skip empty assistant messages that are streaming
  if (message.isStreaming && message.type === 'assistant' && !message.content && (!message.contentDeltas || message.contentDeltas.length === 0)) {
    return null;
  }
  
  // Handle streaming messages with content
  if (message.isStreaming) {
    return <StreamingMessage message={message} className={className} />;
  }
  
  // Check if this is a Plan message (ExitPlanMode tool invocation with plan content)
  const isPlanMessage = () => {
    // Only show as PlanMessage if it has the actual plan content
    return message.metadata?.toolName === 'ExitPlanMode' && 
           message.metadata?.toolInput?.plan;
  };
  
  // Check if this should be shown as a debug message
  const shouldShowAsDebug = () => {
    const original = message.metadata?.originalSDKMessage;
    
    // System init messages
    if (message.type === 'system' && original?.subtype === 'init') {
      return true;
    }
    
    // Empty assistant messages (non-streaming)
    if (message.type === 'assistant' && !message.isStreaming && (!message.content || message.content === '')) {
      return true;
    }
    
    // ExitPlanMode tool invocations (the tool use itself, not the plan content)
    if (message.metadata?.toolName === 'ExitPlanMode' && !message.metadata?.toolInput?.plan) {
      return true;
    }
    
    // All stream_event type messages
    if (message.type === 'stream_event' as any) {
      return true;
    }
    
    // Stream event messages that leaked through from original SDK message
    if (original?.type === 'stream_event') {
      return true;
    }
    
    return false;
  };
  
  // Show plan message for ExitPlanMode tool invocations
  if (isPlanMessage()) {
    return <PlanMessage message={message} className={className} />;
  }
  
  // Show debug message for debug-type messages (DebugMessage handles visibility based on context)
  if (shouldShowAsDebug()) {
    return <DebugMessage message={message} className={className} />;
  }

  // Route based on message type
  switch (message.type) {
    case 'user':
      return <UserMessage message={message} className={className} />;
    
    case 'assistant':
      // Check if this is actually a tool use that was marked as assistant
      if (message.metadata?.toolName || message.metadata?.toolInput) {
        return <ToolUseMessage message={message} className={className} />;
      }
      return <AssistantMessage message={message} className={className} />;
    
    case 'tool_use':
      return <ToolUseMessage message={message} className={className} />;
    
    case 'tool_result':
      // Check if this is an ExitPlanMode result - show as debug message
      if (message.associatedToolUse?.name === 'ExitPlanMode') {
        return <DebugMessage message={message} className={className} />;
      }
      // Route to specific component based on tool name
      if (message.associatedToolUse?.name === 'Bash') {
        return <BashResultMessage message={message} className={className} />;
      }
      return <ToolResultMessage message={message} className={className} />;
    
    case 'system':
      return <SystemMessage message={message} className={className} />;
    
    case 'result':
      return <ResultMessage message={message} className={className} />;
    
    default:
      // Fallback to assistant message for unknown types
      return <AssistantMessage message={message} className={className} />;
  }
};