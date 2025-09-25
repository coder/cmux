import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import styled from "@emotion/styled";
import { MessageRenderer } from "./Messages/MessageRenderer";
import { CommandSuggestions, COMMAND_SUGGESTION_KEYS } from "./CommandSuggestions";
import { UIMessage } from "../types/claude";
import { StreamingMessageAggregator } from "../utils/StreamingMessageAggregator";

// StreamingMessageAggregator is now imported from utils

const ViewContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 12px;
  overflow: hidden;
`;

const ViewHeader = styled.div`
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
  color: ${(props) => (props.active ? "#4ec9b0" : "#6b6b6b")};

  &::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${(props) => (props.active ? "#4ec9b0" : "#6b6b6b")};
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

const InputSection = styled.div`
  position: relative;
  padding: 15px;
  background: #252526;
  border-top: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const InputControls = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-end;
`;

const DebugModeToggle = styled.label`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #606060;
  cursor: pointer;
  user-select: none;
  opacity: 0.7;
  transition: opacity 0.2s ease;
  
  input {
    cursor: pointer;
    transform: scale(0.9);
  }
  
  &:hover {
    opacity: 1;
  }
`;

const InputField = styled.textarea`
  flex: 1;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  color: #d4d4d4;
  padding: 8px 12px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
  min-height: 36px;
  max-height: 120px;

  &:focus {
    outline: none;
    border-color: #569cd6;
  }

  &::placeholder {
    color: #6b6b6b;
  }
`;

const SendButton = styled.button`
  background: #0e639c;
  border: none;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;

  &:hover {
    background: #1177bb;
  }

  &:disabled {
    background: #3e3e42;
    cursor: not-allowed;
    color: #6b6b6b;
  }
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

interface ClaudeViewProps {
  projectName?: string;
  branch?: string;
  className?: string;
}

export const ClaudeView: React.FC<ClaudeViewProps> = ({
  projectName,
  branch,
  className,
}) => {
  const [uiMessageMap, setUIMessageMap] = useState<Map<string, UIMessage>>(
    new Map()
  );
  const [isActive, setIsActive] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);
  const [availableCommands, setAvailableCommands] = useState<string[]>([]);
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const aggregatorRef = useRef<StreamingMessageAggregator>(
    new StreamingMessageAggregator()
  );

  // Process SDK message and trigger UI update
  const processSDKMessage = useCallback((sdkMessage: any) => {
    aggregatorRef.current.processSDKMessage(sdkMessage);
    // Force re-render by setting messages directly from aggregator
    setUIMessageMap(new Map(aggregatorRef.current.getAllMessages().map(msg => [msg.id, msg])));
    // Update available commands from aggregator
    setAvailableCommands(aggregatorRef.current.getAvailableCommands());
  }, []);

  // Load output function
  const loadOutput = useCallback(async () => {
    if (!projectName || !branch) return;

    try {
      const output = await window.api.claude.getOutput(projectName, branch);
      const sdkMessages = output || [];

      // Clear existing messages and aggregator
      aggregatorRef.current.clear();

      // Process all SDK messages through aggregator
      sdkMessages.forEach(msg => aggregatorRef.current.processSDKMessage(msg));
      
      // Update UI with aggregated messages
      setUIMessageMap(new Map(aggregatorRef.current.getAllMessages().map(msg => [msg.id, msg])));
      
      // Update available commands from aggregator
      setAvailableCommands(aggregatorRef.current.getAvailableCommands());

      // Auto-scroll to bottom after loading
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
      }, 50);
    } catch (error) {
      console.error("Failed to load output:", error);
    }
  }, [projectName, branch]);

  // Computed UI messages array derived from uiMessageMap
  const messages = useMemo(() => {
    return Array.from(uiMessageMap.values()).sort((a, b) => {
      return a.sequenceNumber - b.sequenceNumber;
    });
  }, [uiMessageMap]);

  useEffect(() => {
    if (!projectName || !branch) return;

    // Clear messages when switching workspaces
    setUIMessageMap(new Map());
    aggregatorRef.current.clear();

    // Load initial output
    loadOutput();

    // Check if workspace is active
    checkStatus();

    // Subscribe to output updates
    const unsubscribeOutput = window.api.claude.onOutput((data: any) => {
      if (data.projectName === projectName && data.branch === branch) {
        processSDKMessage(data.message);

        // Auto-scroll to bottom
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
          }
        }, 50);
      }
    });

    // Subscribe to clear events
    const unsubscribeClear = window.api.claude.onClear((data: any) => {
      if (data.projectName === projectName && data.branch === branch) {
        // Clear the UI when we receive a clear event
        setUIMessageMap(new Map());
        aggregatorRef.current.clear();
      }
    });
    
    // Subscribe to compaction-complete events
    const unsubscribeCompaction = window.api.claude.onCompactionComplete((data: any) => {
      if (data.projectName === projectName && data.branch === branch) {
        setIsCompacting(false);
        // Clear aggregator and reload from session file
        aggregatorRef.current.clear();
        setUIMessageMap(new Map());
        loadOutput(); // This reloads from session file
      }
    });

    // Poll status periodically
    const statusInterval = setInterval(checkStatus, 5000);

    return () => {
      if (typeof unsubscribeOutput === "function") {
        unsubscribeOutput();
      }
      if (typeof unsubscribeClear === "function") {
        unsubscribeClear();
      }
      if (typeof unsubscribeCompaction === "function") {
        unsubscribeCompaction();
      }
      clearInterval(statusInterval);
    };
  }, [projectName, branch, loadOutput, processSDKMessage]);

  // Watch input for slash commands
  useEffect(() => {
    setShowCommandSuggestions(
      input.startsWith('/') && 
      availableCommands.length > 0 &&
      isActive
    );
  }, [input, availableCommands, isActive]);

  // Handle command selection
  const handleCommandSelect = useCallback((command: string) => {
    setInput(`/${command} `);
    setShowCommandSuggestions(false);
    inputRef.current?.focus();
  }, []);

  const checkStatus = async () => {
    if (!projectName || !branch) return;

    try {
      const active = await window.api.claude.isActive(projectName, branch);
      setIsActive(active);
    } catch (error) {
      console.error("Failed to check status:", error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !projectName || !branch || isSending) return;

    setIsSending(true);
    try {
      const messageText = input.trim();
      setInput(""); // Clear input immediately for better UX

      // Check if this is a slash command
      if (messageText.startsWith('/')) {
        const command = messageText.toLowerCase();
        
        // Track compaction state
        if (command === '/compact') {
          setIsCompacting(true);
        }
        
        // Handle /clear locally for immediate UI feedback
        if (command === '/clear') {
          // Clear UI immediately
          setUIMessageMap(new Map());
          aggregatorRef.current.clear();
          
          // Send clear command to backend
          const success = await window.api.claude.handleSlashCommand(
            projectName,
            branch,
            messageText
          );
          
          if (!success) {
            console.error("Failed to execute /clear command");
            // Reload messages on error
            loadOutput();
          }
          return;
        }
        
        // For other slash commands, pass them through to the SDK
        // The SDK will handle them internally
      }

      // Send message to Claude workspace (including slash commands)
      const success = await window.api.claude.sendMessage(
        projectName,
        branch,
        messageText
      );

      if (!success) {
        console.error("Failed to send message to Claude workspace");
        // Optionally restore the input or show an error message
        setInput(messageText);
        return;
      }

      console.log("Message sent successfully:", messageText);
    } catch (error) {
      console.error("Failed to send message:", error);
      // Restore the input on error
      setInput(input);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't handle keys if command suggestions are visible
    if (showCommandSuggestions && COMMAND_SUGGESTION_KEYS.includes(e.key)) {
      return; // Let CommandSuggestions handle it
    }
    
    if (e.key === "Enter") {
      if (e.shiftKey) {
        // Shift+Enter: allow newline (default behavior)
        return;
      } else {
        // Enter: send message
        e.preventDefault();
        handleSend();
      }
    }
  };

  if (!projectName || !branch) {
    return (
      <ViewContainer className={className}>
        <EmptyState>
          <h3>No Workspace Selected</h3>
          <p>
            Select a workspace from the sidebar to view and interact with Claude
          </p>
        </EmptyState>
      </ViewContainer>
    );
  }

  return (
    <ViewContainer className={className}>
      <ViewHeader>
        <WorkspaceTitle>
          {projectName} / {branch}
        </WorkspaceTitle>
        <StatusIndicator active={isActive}>
          {isActive ? "Active" : "Inactive"}
        </StatusIndicator>
      </ViewHeader>

      <OutputContent ref={contentRef}>
        {messages.length === 0 ? (
          <EmptyState>
            <h3>No Messages Yet</h3>
            <p>Send a message below to start interacting with Claude</p>
          </EmptyState>
        ) : (
          messages.map((msg) => (
            <MessageRenderer key={msg.id} message={msg} debugMode={debugMode} />
          ))
        )}
      </OutputContent>

      <InputSection>
        <CommandSuggestions
          input={input}
          availableCommands={availableCommands}
          onSelectCommand={handleCommandSelect}
          onDismiss={() => setShowCommandSuggestions(false)}
          isVisible={showCommandSuggestions}
        />
        <InputControls>
          <InputField
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isCompacting
                ? "Compacting conversation..."
                : isActive
                ? "Type your message... (Enter to send, Shift+Enter for newline)"
                : "Start workspace to send messages"
            }
            disabled={!isActive || isSending || isCompacting}
            rows={1}
          />
          <SendButton
            onClick={handleSend}
            disabled={!input.trim() || !isActive || isSending || isCompacting}
          >
            {isCompacting ? "Compacting..." : isSending ? "Sending..." : "Send"}
          </SendButton>
        </InputControls>
        <DebugModeToggle>
          <input
            type="checkbox"
            checked={debugMode}
            onChange={(e) => setDebugMode(e.target.checked)}
          />
          Debug Mode
        </DebugModeToggle>
      </InputSection>
    </ViewContainer>
  );
};
