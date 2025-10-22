import React, { useState, useEffect } from "react";
import type { DisplayedMessage } from "@/types/message";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { TypewriterMarkdown } from "./TypewriterMarkdown";
import { cn } from "@/lib/utils";

interface ReasoningMessageProps {
  message: DisplayedMessage & { type: "reasoning" };
  className?: string;
}

export const ReasoningMessage: React.FC<ReasoningMessageProps> = ({ message, className }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const content = message.content;
  const isStreaming = message.isStreaming;

  // Auto-collapse when streaming ends
  useEffect(() => {
    if (!isStreaming) {
      setIsExpanded(false);
    }
  }, [isStreaming]);

  const toggleExpanded = () => {
    if (!isStreaming) {
      setIsExpanded(!isExpanded);
    }
  };

  // Render appropriate content based on state
  const renderContent = () => {
    // Empty streaming state
    if (isStreaming && !content) {
      return <div className="text-thinking-mode opacity-60">Thinking...</div>;
    }

    // Streaming text gets typewriter effect
    if (isStreaming) {
      return <TypewriterMarkdown deltas={[content]} isComplete={false} />;
    }

    // Completed text renders as static content
    return content ? <MarkdownRenderer content={content} /> : null;
  };

  return (
    <div
      className={cn(
        "my-2 p-0.5 bg-[color-mix(in_srgb,var(--color-thinking-mode)_2%,transparent)] rounded relative",
        className
      )}
    >
      <div
        className="flex items-center justify-between gap-2 mb-1.5 cursor-pointer select-none"
        onClick={toggleExpanded}
      >
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-thinking-mode font-semibold opacity-80">
          <span className="text-xs">💭</span>
          <span>Thinking</span>
        </div>
        {!isStreaming && (
          <span
            className={cn(
              "text-thinking-mode opacity-60 transition-transform duration-200 ease-in-out text-xs",
              isExpanded ? "rotate-90" : "rotate-0"
            )}
          >
            ▸
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="font-primary text-xs leading-6 text-text-secondary italic opacity-85 [&_p]:mb-1 [&_p]:mt-0 [&_p:last-child]:mb-0">
          {renderContent()}
        </div>
      )}
    </div>
  );
};
