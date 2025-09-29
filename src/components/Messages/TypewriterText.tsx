import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";

const TypewriterContainer = styled.div`
  font-family: var(--font-monospace);
  white-space: pre-wrap;
  word-wrap: break-word;
  line-height: 1.5;
  color: #cccccc;
`;

const CursorSpan = styled.span<{ show: boolean }>`
  opacity: ${(props) => (props.show ? 1 : 0)};
  transition: opacity 0.1s;
  &::after {
    content: "|";
    color: #007acc;
    font-weight: bold;
  }
`;

interface TypewriterTextProps {
  deltas: string[];
  isComplete: boolean;
  speed?: number; // characters per second
}

export const TypewriterText: React.FC<TypewriterTextProps> = ({
  deltas,
  isComplete,
  speed = 50,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayedContent, setDisplayedContent] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const pendingCharsRef = useRef<string>("");
  const currentIndexRef = useRef(0);
  const animationRef = useRef<number>();

  // Join all deltas to get full target content, ensuring strings
  const targetContent = deltas
    .map((delta) => (typeof delta === "string" ? delta : JSON.stringify(delta)))
    .join("");

  // Update pending characters when new deltas arrive
  useEffect(() => {
    pendingCharsRef.current = targetContent.slice(currentIndexRef.current);
  }, [targetContent]);

  // Character-by-character rendering animation
  useEffect(() => {
    if (isComplete && displayedContent === targetContent) {
      // Streaming complete and all text displayed
      setShowCursor(false);
      return;
    }

    const renderNextChar = () => {
      if (currentIndexRef.current < targetContent.length) {
        const nextChar = targetContent[currentIndexRef.current];
        currentIndexRef.current++;

        setDisplayedContent((prev) => prev + nextChar);

        // Schedule next character
        const delay = 1000 / speed; // Convert speed to milliseconds per character
        animationRef.current = window.setTimeout(renderNextChar, delay);
      } else if (isComplete) {
        // Streaming complete and all text displayed
        setShowCursor(false);
      }
    };

    // Start animation if we have pending characters
    if (pendingCharsRef.current.length > 0) {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
      renderNextChar();
    }

    // Cleanup on unmount
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetContent, speed, isComplete]);

  // Cursor blinking effect - only depends on isComplete to avoid infinite loops
  useEffect(() => {
    if (isComplete) {
      setShowCursor(false);
      return;
    }

    // Start blinking cursor
    setShowCursor(true);
    const interval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 500);

    return () => clearInterval(interval);
  }, [isComplete]);

  return (
    <TypewriterContainer ref={containerRef}>
      {displayedContent}
      {!isComplete && <CursorSpan show={showCursor} />}
    </TypewriterContainer>
  );
};
