import React, { useState, useEffect } from 'react';
import styled from '@emotion/styled';

// Export the keys that CommandSuggestions handles
export const COMMAND_SUGGESTION_KEYS = ['Tab', 'ArrowUp', 'ArrowDown', 'Escape'];

// Props interface
interface CommandSuggestionsProps {
  input: string;
  availableCommands: string[];
  onSelectCommand: (command: string) => void;
  onDismiss: () => void;
  isVisible: boolean;
}

// Styled components
const PopoverContainer = styled.div`
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 8px;
  background: #252526;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.4);
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
  display: flex;
  flex-direction: column;
`;

const CommandItem = styled.div<{ selected: boolean }>`
  padding: 6px 10px;
  cursor: pointer;
  background: ${props => props.selected ? '#094771' : 'transparent'};
  transition: background 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  
  &:hover {
    background: #094771;
  }
`;

const CommandText = styled.div`
  color: #569cd6;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 12px;
  flex-shrink: 0;
`;

const CommandDescription = styled.div`
  color: #969696;
  font-size: 11px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const HelperText = styled.div`
  padding: 4px 10px;
  border-top: 1px solid #3e3e42;
  background: #1e1e1e;
  color: #6b6b6b;
  font-size: 10px;
  text-align: center;
  flex-shrink: 0;
  
  span {
    color: #969696;
    font-weight: 500;
  }
`;

// Main component
export const CommandSuggestions: React.FC<CommandSuggestionsProps> = ({
  input,
  availableCommands,
  onSelectCommand,
  onDismiss,
  isVisible
}) => {
  const [filteredCommands, setFilteredCommands] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Command descriptions for built-in commands
  const getDescription = (cmd: string): string => {
    const descriptions: Record<string, string> = {
      'clear': 'Clear conversation and start fresh',
      'compact': 'Compress conversation history',
      'context': 'Show context usage information',
      'cost': 'Show token usage and costs',
      'init': 'Initialize or reinitialize session',
      'model': 'Switch AI model',
      'help': 'Show available commands',
    };
    
    return descriptions[cmd] || `/${cmd}`;
  };

  // Filter commands based on input
  useEffect(() => {
    if (input.startsWith('/')) {
      const searchTerm = input.slice(1).toLowerCase();
      const filtered = availableCommands
        .filter(cmd => cmd.toLowerCase().startsWith(searchTerm))
        .slice(0, 10);
      
      setFilteredCommands(filtered);
      setSelectedIndex(0);
    }
  }, [input, availableCommands]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch(e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => (i + 1) % filteredCommands.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length);
          break;
        case 'Tab':
          if (!e.shiftKey && filteredCommands.length > 0) {
            e.preventDefault();
            onSelectCommand(filteredCommands[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onDismiss();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, filteredCommands, selectedIndex, onSelectCommand, onDismiss]);

  // Click outside handler
  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-command-suggestions]')) {
        onDismiss();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible, onDismiss]);

  if (!isVisible || filteredCommands.length === 0) {
    return null;
  }

  return (
    <PopoverContainer data-command-suggestions>
      {filteredCommands.map((cmd, index) => (
        <CommandItem
          key={cmd}
          selected={index === selectedIndex}
          onMouseEnter={() => setSelectedIndex(index)}
          onClick={() => onSelectCommand(cmd)}
        >
          <CommandText>/{cmd}</CommandText>
          <CommandDescription>{getDescription(cmd)}</CommandDescription>
        </CommandItem>
      ))}
      <HelperText>
        <span>Tab</span> to complete • <span>↑↓</span> to navigate • <span>Esc</span> to dismiss
      </HelperText>
    </PopoverContainer>
  );
};