import React, { useState, useEffect } from 'react';
import styled from '@emotion/styled';
import ReactMarkdown from 'react-markdown';
import { markdownStyles, normalizeMarkdown } from '../Messages/MarkdownStyles';
import { markdownComponents } from '../Messages/MarkdownComponents';

const MarkdownContainer = styled.div`
  ${markdownStyles}
`;

const CursorSpan = styled.span<{ show: boolean }>`
  display: ${props => props.show ? 'inline' : 'none'};
  animation: blink 1s step-end infinite;
  
  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
`;

interface TypewriterMarkdownProps {
  deltas: string[];
  isComplete: boolean;
  speed?: number;
  className?: string;
}

export const TypewriterMarkdown: React.FC<TypewriterMarkdownProps> = ({
  deltas,
  isComplete,
  speed = 50,
  className
}) => {
  const [displayedContent, setDisplayedContent] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  // Concatenate all deltas to get the target content
  const targetContent = deltas.join('');

  useEffect(() => {
    if (isComplete) {
      // If complete, show all content immediately
      setDisplayedContent(targetContent);
      setShowCursor(false);
      return;
    }

    // Character-by-character reveal
    const timer = setTimeout(() => {
      if (currentIndex < deltas.length) {
        const currentDelta = deltas[currentIndex];
        
        if (charIndex < currentDelta.length) {
          // Add next character from current delta
          setDisplayedContent(prev => prev + currentDelta[charIndex]);
          setCharIndex(charIndex + 1);
        } else if (currentIndex < deltas.length - 1) {
          // Move to next delta
          setCurrentIndex(currentIndex + 1);
          setCharIndex(0);
        }
      }
    }, speed);

    return () => clearTimeout(timer);
  }, [deltas, currentIndex, charIndex, speed, isComplete, targetContent]);

  // Handle cursor visibility
  useEffect(() => {
    if (isComplete || displayedContent === targetContent) {
      setShowCursor(false);
    } else {
      setShowCursor(true);
    }
  }, [isComplete, displayedContent, targetContent]);

  const normalizedContent = normalizeMarkdown(displayedContent);

  return (
    <MarkdownContainer className={className}>
      <ReactMarkdown components={markdownComponents}>
        {normalizedContent}
      </ReactMarkdown>
      <CursorSpan show={showCursor}>▊</CursorSpan>
    </MarkdownContainer>
  );
};