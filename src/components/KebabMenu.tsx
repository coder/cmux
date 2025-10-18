import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { TooltipWrapper, Tooltip } from "./Tooltip";

const KebabButton = styled.button<{ active?: boolean }>`
  background: ${(props) => (props.active ? "rgba(255, 255, 255, 0.1)" : "none")};
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #cccccc;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--font-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.3);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DropdownMenu = styled.div`
  position: fixed;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.8);
  z-index: 10000;
  min-width: 160px;
  overflow: hidden;
`;

const MenuItem = styled.button<{ active?: boolean; disabled?: boolean }>`
  width: 100%;
  background: ${(props) => (props.active ? "rgba(255, 255, 255, 0.15)" : "#1e1e1e")};
  border: none;
  border-bottom: 1px solid #2d2d30;
  color: ${(props) => (props.disabled ? "#808080" : "#cccccc")};
  font-size: 11px;
  padding: 8px 12px;
  text-align: left;
  cursor: ${(props) => (props.disabled ? "not-allowed" : "pointer")};
  transition: all 0.15s ease;
  font-family: var(--font-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${(props) => (props.disabled ? "#1e1e1e" : "rgba(255, 255, 255, 0.15)")};
    color: ${(props) => (props.disabled ? "#808080" : "#ffffff")};
  }
`;

const MenuItemEmoji = styled.span`
  font-size: 13px;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
`;

const MenuItemLabel = styled.span`
  flex: 1;
`;

const MenuContainer = styled.div`
  position: relative;
`;

export interface KebabMenuItem {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  emoji?: string;
  tooltip?: string;
}

interface KebabMenuProps {
  items: KebabMenuItem[];
  className?: string;
}

/**
 * A kebab menu (three vertical dots) that displays a dropdown of menu items.
 * 
 * Reduces header clutter by collapsing multiple actions into a single button,
 * saving significant horizontal space compared to individual buttons.
 * 
 * Uses React Portal to render dropdown at document.body, preventing clipping
 * by parent containers with overflow constraints.
 */
export const KebabMenu: React.FC<KebabMenuProps> = ({ items, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate dropdown position when menu opens
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4, // 4px gap below button
        left: rect.right - 160, // Align right edge (160px = min-width)
      });
    }
  }, [isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      // Check both button and dropdown (which is now in portal)
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleItemClick = (item: KebabMenuItem) => {
    if (item.disabled) return;
    item.onClick();
    setIsOpen(false);
  };

  const button = (
    <KebabButton
      ref={buttonRef}
      active={isOpen}
      onClick={() => setIsOpen(!isOpen)}
      className={className}
    >
      ⋮
    </KebabButton>
  );

  return (
    <>
      <MenuContainer>
        <TooltipWrapper inline>
          {button}
          <Tooltip align="center">More actions</Tooltip>
        </TooltipWrapper>
      </MenuContainer>

      {isOpen &&
        createPortal(
          <DropdownMenu
            ref={menuRef}
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
            }}
          >
            {items.map((item, index) => (
              <MenuItem
                key={index}
                active={item.active}
                disabled={item.disabled}
                onClick={() => handleItemClick(item)}
                title={item.tooltip}
              >
                {item.emoji && <MenuItemEmoji>{item.emoji}</MenuItemEmoji>}
                <MenuItemLabel>{item.label}</MenuItemLabel>
              </MenuItem>
            ))}
          </DropdownMenu>,
          document.body
        )}
    </>
  );
};
