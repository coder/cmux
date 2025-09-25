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

interface MessageRendererProps {
  message: UIMessage;
  className?: string;
  debugMode?: boolean;
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({ message, className, debugMode = false }) => {
  // Handle streaming messages
  if (message.isStreaming) {
    return <StreamingMessage message={message} className={className} />;
  }
  
  // Check if this should be shown as a debug message
  const shouldShowAsDebug = () => {
    // Empty assistant messages
    if (message.type === 'assistant' && (!message.content || message.content === '')) {
      return true;
    }
    
    // Stream event messages that leaked through
    const original = message.metadata?.originalSDKMessage;
    if (original?.type === 'stream_event' && original?.event?.type === 'message_start') {
      return true;
    }
    
    return false;
  };
  
  // Show debug message if in debug mode and it's a debug-type message
  if (debugMode && shouldShowAsDebug()) {
    return <DebugMessage message={message} className={className} />;
  }
  
  // Hide debug messages when not in debug mode
  if (!debugMode && shouldShowAsDebug()) {
    return null;
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