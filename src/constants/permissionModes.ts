import type { UIPermissionMode } from '../types/global';

export interface PermissionModeInfo {
  label: string;
  color: string;
  borderColor: string;
  description: string;
  placeholder: string;
}

export const PERMISSION_MODE_CONFIG: Record<UIPermissionMode, PermissionModeInfo> = {
  plan: {
    label: 'Plan',
    color: 'var(--color-plan-mode)',
    borderColor: 'var(--color-plan-mode)',
    description: 'Plans only, no execution',
    placeholder: 'Plan Mode: Claude will plan but not execute actions (Enter to send)'
  },
  edit: {
    label: 'Edit',
    color: 'var(--color-edit-mode)',
    borderColor: 'var(--color-edit-mode)',
    description: 'Auto-accept file edits',
    placeholder: 'Edit Mode: Claude will auto-accept file edits (Enter to send)'
  },
  yolo: {
    label: 'YOLO',
    color: 'var(--color-yolo-mode)',
    borderColor: 'var(--color-yolo-mode)',
    description: 'Bypass all permissions',
    placeholder: 'YOLO Mode: Claude bypasses all permissions (Enter to send)'
  }
};

// Helper to get mode config with fallback
export function getModeConfig(mode: UIPermissionMode | undefined): PermissionModeInfo {
  return PERMISSION_MODE_CONFIG[mode || 'plan'];
}