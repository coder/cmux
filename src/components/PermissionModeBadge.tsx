import React from 'react';
import styled from '@emotion/styled';
import type { UIPermissionMode } from '../types/global';
import { PERMISSION_MODE_CONFIG } from '../constants/permissionModes';

const Badge = styled.span<{ mode: UIPermissionMode }>`
  background: ${props => PERMISSION_MODE_CONFIG[props.mode].color};
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
`;

interface PermissionModeBadgeProps {
  mode: UIPermissionMode;
  className?: string;
}

export const PermissionModeBadge: React.FC<PermissionModeBadgeProps> = ({ mode, className }) => (
  <Badge mode={mode} className={className}>
    {PERMISSION_MODE_CONFIG[mode].label}
  </Badge>
);