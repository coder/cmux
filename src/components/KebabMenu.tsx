import React, { useState, useRef, useEffect } from "react";
import styled from "@emotion/styled";
import { TooltipWrapper, Tooltip } from "./Tooltip";

const KebabButton = styled.button<{ active?: boolean }>`
  background: ${(props) => (props.active ? "rgba(255, 255, 255, 0.15)" : "transparent")};
  border: none;
  color: var(--color-text-secondary);
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--font-primary);
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(255, 255, 255, 0.15);
    color: var(--color-text);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DropdownMenu = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: #2d2d30;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  min-width: 180px;
  overflow: hidden;
`;

const MenuItem = styled.button<{ active?: boolean; disabled?: boolean }>`
  width: 100%;
  background: ${(props) => (props.active ? "rgba(255, 255, 255, 0.1)" : "transparent")};
  border: none;
  color: ${(props) => (props.disabled ? "var(--color-text-secondary)" : "var(--color-text)")};
  font-size: 11px;
  padding: 8px 12px;
  text-align: left;
  cursor: ${(props) => (props.disabled ? "not-allowed" : "pointer")};
  transition: background 0.1s;
  font-family: var(--font-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};

  &:hover {
    background: ${(props) => (props.disabled ? "transparent" : "rgba(255, 255, 255, 0.15)")};
  }
`;

const MenuItemEmoji = styled.span`
  font-size: 12px;
  width: 16px;
  text-align: center;
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
 * Used to reduce header clutter by hiding less frequently used actions.
 */
export const KebabMenu: React.FC<KebabMenuProps> = ({ items, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
    <KebabButton active={isOpen} onClick={() => setIsOpen(!isOpen)} className={className}>
      ⋮
    </KebabButton>
  );

  return (
    <MenuContainer ref={menuRef}>
      <TooltipWrapper inline>
        {button}
        <Tooltip align="center">More actions</Tooltip>
      </TooltipWrapper>

      {isOpen && (
        <DropdownMenu>
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
        </DropdownMenu>
      )}
    </MenuContainer>
  );
};
