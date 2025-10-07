import React from "react";
import styles from "./ToolPrimitives.module.css";

/**
 * Shared components for tool UI
 * These primitives provide consistent styling across all tool components
 */

interface ToolContainerProps {
  expanded: boolean;
  children: React.ReactNode;
}

export const ToolContainer: React.FC<ToolContainerProps> = ({ expanded, children }) => (
  <div className={`${styles.toolContainer} ${expanded ? styles.expanded : ""}`}>{children}</div>
);

interface ToolHeaderProps {
  onClick: () => void;
  children: React.ReactNode;
}

export const ToolHeader: React.FC<ToolHeaderProps> = ({ onClick, children }) => (
  <div className={styles.toolHeader} onClick={onClick}>
    {children}
  </div>
);

interface ExpandIconProps {
  expanded: boolean;
  children: React.ReactNode;
}

export const ExpandIcon: React.FC<ExpandIconProps> = ({ expanded, children }) => (
  <span className={`${styles.expandIcon} ${expanded ? styles.expanded : ""}`}>{children}</span>
);

interface ToolNameProps {
  children: React.ReactNode;
}

export const ToolName: React.FC<ToolNameProps> = ({ children }) => (
  <span className={styles.toolName}>{children}</span>
);

interface StatusIndicatorProps {
  status: string;
  children: React.ReactNode;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, children }) => (
  <span className={`${styles.statusIndicator} ${styles[status] || ""}`}>{children}</span>
);

interface ToolDetailsProps {
  children: React.ReactNode;
}

export const ToolDetails: React.FC<ToolDetailsProps> = ({ children }) => (
  <div className={styles.toolDetails}>{children}</div>
);

interface DetailSectionProps {
  children: React.ReactNode;
}

export const DetailSection: React.FC<DetailSectionProps> = ({ children }) => (
  <div className={styles.detailSection}>{children}</div>
);

interface DetailLabelProps {
  children: React.ReactNode;
}

export const DetailLabel: React.FC<DetailLabelProps> = ({ children }) => (
  <div className={styles.detailLabel}>{children}</div>
);

interface DetailContentProps {
  children: React.ReactNode;
}

export const DetailContent: React.FC<DetailContentProps> = ({ children }) => (
  <pre className={styles.detailContent}>{children}</pre>
);

export const LoadingDots: React.FC = () => <span className={styles.loadingDots} />;

interface HeaderButtonProps {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export const HeaderButton: React.FC<HeaderButtonProps> = ({ active, onClick, children }) => (
  <button className={`${styles.headerButton} ${active ? styles.active : ""}`} onClick={onClick}>
    {children}
  </button>
);
