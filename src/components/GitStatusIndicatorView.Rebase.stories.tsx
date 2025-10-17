import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor } from "@storybook/test";
import { useArgs } from "@storybook/preview-api";
import { GitStatusIndicatorView } from "./GitStatusIndicatorView";
import type { GitCommit, GitBranchHeader } from "@/utils/git/parseGitLog";
import { useState, useEffect } from "react";

// Type for the wrapped component props (without interaction handlers)
type InteractiveProps = Omit<
  React.ComponentProps<typeof GitStatusIndicatorView>,
  | "showTooltip"
  | "tooltipCoords"
  | "onMouseEnter"
  | "onMouseLeave"
  | "onTooltipMouseEnter"
  | "onTooltipMouseLeave"
  | "onContainerRef"
>;

const meta = {
  title: "Components/GitStatusIndicatorView/Rebase",
  component: GitStatusIndicatorView,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<InteractiveProps>;

export default meta;
type Story = StoryObj<InteractiveProps>;

// Mock data for different scenarios
const mockBranchHeaders: GitBranchHeader[] = [
  { branch: "HEAD", columnIndex: 0 },
  { branch: "origin/main", columnIndex: 1 },
  { branch: "origin/feature-branch", columnIndex: 2 },
];

const mockCommits: GitCommit[] = [
  {
    hash: "a1b2c3d",
    date: "Jan 15 02:30 PM",
    subject: "feat: Add new feature",
    indicators: "***",
  },
  {
    hash: "e4f5g6h",
    date: "Jan 15 01:45 PM",
    subject: "fix: Resolve bug in handler",
    indicators: "*+ ",
  },
  {
    hash: "i7j8k9l",
    date: "Jan 15 11:20 AM",
    subject: "refactor: Simplify logic",
    indicators: " + ",
  },
  {
    hash: "m0n1o2p",
    date: "Jan 14 04:15 PM",
    subject: "docs: Update README",
    indicators: "  +",
  },
];

const mockDirtyFiles = [
  "M  src/components/GitStatusIndicator.tsx",
  "M  src/components/GitStatusIndicatorView.tsx",
  "A  src/components/hooks/useGitBranchDetails.ts",
  "?? src/components/GitStatusIndicatorView.stories.tsx",
];

// Update InteractiveProps to include isAgentResolving
type InteractivePropsUpdated = InteractiveProps & { isAgentResolving?: boolean };

// Interactive wrapper with hover state (simple, without rebase)
const InteractiveWrapper = (props: InteractivePropsUpdated) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipCoords, setTooltipCoords] = useState({ top: 0, left: 0 });
  const [containerEl, setContainerEl] = useState<HTMLSpanElement | null>(null);

  const handleMouseEnter = () => {
    setShowTooltip(true);
    if (containerEl) {
      const rect = containerEl.getBoundingClientRect();
      if (props.tooltipPosition === "bottom") {
        setTooltipCoords({
          top: rect.bottom + 8,
          left: rect.left,
        });
      } else {
        setTooltipCoords({
          top: rect.top + rect.height / 2,
          left: rect.right + 8,
        });
      }
    }
  };

  const handleTooltipMouseEnter = () => {
    // No-op for Storybook demo - in real app, prevents tooltip from closing when hovering over it
  };

  return (
    <GitStatusIndicatorView
      {...props}
      isAgentResolving={props.isAgentResolving}
      showTooltip={showTooltip}
      tooltipCoords={tooltipCoords}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowTooltip(false)}
      onTooltipMouseEnter={handleTooltipMouseEnter}
      onTooltipMouseLeave={() => setShowTooltip(false)}
      onContainerRef={setContainerEl}
    />
  );
};

// Interactive wrapper with rebase state management
const RebaseInteractiveWrapper = (
  props: InteractivePropsUpdated & {
    updateArgs: (args: Partial<InteractivePropsUpdated>) => void;
  }
) => {
  const { updateArgs, ...componentProps } = props;
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipCoords, setTooltipCoords] = useState({ top: 0, left: 0 });
  const [containerEl, setContainerEl] = useState<HTMLSpanElement | null>(null);

  // Read state from props
  const isRebasing = props.isRebasing ?? false;
  const rebaseError = props.rebaseError ?? null;
  const gitStatus = props.gitStatus;

  const handleMouseEnter = () => {
    setShowTooltip(true);
    if (containerEl) {
      const rect = containerEl.getBoundingClientRect();
      if (props.tooltipPosition === "bottom") {
        setTooltipCoords({
          top: rect.bottom + 8,
          left: rect.left,
        });
      } else {
        setTooltipCoords({
          top: rect.top + rect.height / 2,
          left: rect.right + 8,
        });
      }
    }
  };

  const handleTooltipMouseEnter = () => {
    // Keep tooltip open when hovering over it
  };

  const handleRebaseClick = async () => {
    // Update args to reflect rebasing state
    updateArgs({ isRebasing: true, rebaseError: null });

    // Simulate async rebase (2 second delay)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Randomly succeed or fail for demo (30% chance of conflict)
    if (Math.random() > 0.7) {
      updateArgs({
        isRebasing: false,
        rebaseError:
          "Git rebase onto origin/main has conflicts in the following files:\n- src/conflict.txt\n- package.json",
      });
    } else {
      // Success: update gitStatus to show we're caught up
      if (gitStatus) {
        updateArgs({
          gitStatus: { ...gitStatus, behind: 0 },
          isRebasing: false,
        });
      }
    }
  };

  // Read isAgentResolving from props
  const isAgentResolving = props.isAgentResolving ?? false;

  // Compute canRebase based on current state
  const canRebase = !!gitStatus && gitStatus.behind > 0 && !isRebasing && !isAgentResolving;

  return (
    <GitStatusIndicatorView
      {...componentProps}
      gitStatus={gitStatus}
      showTooltip={showTooltip}
      tooltipCoords={tooltipCoords}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowTooltip(false)}
      onTooltipMouseEnter={handleTooltipMouseEnter}
      onTooltipMouseLeave={() => setShowTooltip(false)}
      onContainerRef={setContainerEl}
      canRebase={canRebase}
      isRebasing={isRebasing}
      isAgentResolving={isAgentResolving}
      rebaseError={rebaseError}
      onRebaseClick={() => {
        void handleRebaseClick();
      }}
    />
  );
};

export const RebaseAvailable: Story = {
  render: function Render(args) {
    const [, updateArgs] = useArgs<InteractiveProps>();
    return <RebaseInteractiveWrapper {...args} updateArgs={updateArgs} />;
  },
  args: {
    gitStatus: { ahead: 2, behind: 5, dirty: true },
    tooltipPosition: "right",
    branchHeaders: mockBranchHeaders,
    commits: mockCommits,
    dirtyFiles: mockDirtyFiles,
    isLoading: false,
    errorMessage: null,
    canRebase: true,
    isRebasing: false,
    rebaseError: null,
  },
};

export const RebaseHoverEffect: Story = {
  render: function Render(args) {
    const [, updateArgs] = useArgs<InteractiveProps>();
    return <RebaseInteractiveWrapper {...args} updateArgs={updateArgs} />;
  },
  args: {
    gitStatus: { ahead: 2, behind: 5, dirty: true },
    tooltipPosition: "right",
    branchHeaders: mockBranchHeaders,
    commits: mockCommits,
    dirtyFiles: mockDirtyFiles,
    isLoading: false,
    errorMessage: null,
    canRebase: true,
    isRebasing: false,
    rebaseError: null,
  },
  play: async ({ canvasElement }) => {
    const indicator = canvasElement.querySelector(".git-status-wrapper");
    if (!indicator) throw new Error("Git status indicator not found");

    // Initially, status indicators should be visible
    const statusIndicators = indicator.querySelector(".status-indicators");
    const refreshIcon = indicator.querySelector(".refresh-icon-wrapper");
    const dirtyIndicator = indicator.querySelector("span:last-child");

    await waitFor(() => {
      void expect(statusIndicators).toBeInTheDocument();
    });

    // Hover over the indicator
    await userEvent.hover(indicator);

    // Wait for hover effects to apply
    await waitFor(
      () => {
        // Refresh icon should become visible
        const computedStyle = window.getComputedStyle(refreshIcon!);
        void expect(computedStyle.display).toBe("flex");
      },
      { timeout: 1000 }
    );

    // Dirty indicator should still be visible
    await waitFor(() => {
      void expect(dirtyIndicator).toBeVisible();
    });
  },
};

export const RebaseInProgress: Story = {
  render: (args) => <InteractiveWrapper {...args} />,
  args: {
    gitStatus: { ahead: 2, behind: 5, dirty: true },
    tooltipPosition: "right",
    branchHeaders: mockBranchHeaders,
    commits: mockCommits,
    dirtyFiles: mockDirtyFiles,
    isLoading: false,
    errorMessage: null,
    canRebase: false,
    isRebasing: true,
    rebaseError: null,
    onRebaseClick: () => {
      // Should not be called
      throw new Error("onRebaseClick should not be called during rebase");
    },
  },
  play: async ({ canvasElement }) => {
    const indicator = canvasElement.querySelector(".git-status-wrapper");
    if (!indicator) throw new Error("Git status indicator not found");

    const refreshIcon = indicator.querySelector(".refresh-icon-wrapper");
    const dirtyIndicator = indicator.querySelector("span:last-child");

    // Refresh icon should be visible by default (without hover)
    await waitFor(() => {
      const computedStyle = window.getComputedStyle(refreshIcon!);
      void expect(computedStyle.display).toBe("flex");
    });

    // Check for pulsating animation
    await waitFor(() => {
      const computedStyle = window.getComputedStyle(refreshIcon!);
      void expect(computedStyle.animation).toContain("pulse");
    });

    // Cursor should be "wait"
    await waitFor(() => {
      const computedStyle = window.getComputedStyle(indicator);
      void expect(computedStyle.cursor).toBe("wait");
    });

    // Dirty indicator should still be visible
    void expect(dirtyIndicator).toBeVisible();

    // Hover and then unhover - refresh icon should stay visible
    await userEvent.hover(indicator);
    await userEvent.unhover(indicator);

    // Icon should STILL be visible after unhover
    await waitFor(() => {
      const computedStyle = window.getComputedStyle(refreshIcon!);
      void expect(computedStyle.display).toBe("flex");
    });

    // Try to click - should not trigger onRebaseClick (already throwing error if called)
    await userEvent.click(indicator);
  },
};

export const RebaseCompleted: Story = {
  render: (args) => <InteractiveWrapper {...args} />,
  args: {
    gitStatus: { ahead: 2, behind: 0, dirty: true },
    tooltipPosition: "right",
    branchHeaders: mockBranchHeaders,
    commits: mockCommits,
    dirtyFiles: mockDirtyFiles,
    isLoading: false,
    errorMessage: null,
    canRebase: false,
    isRebasing: false,
    rebaseError: null,
    onRebaseClick: () => undefined,
  },
  play: async ({ canvasElement }) => {
    const indicator = canvasElement.querySelector(".git-status-wrapper");
    if (!indicator) throw new Error("Git status indicator not found");

    // Should show ahead but not behind
    const statusText = indicator.textContent;
    void expect(statusText).toContain("↑2");
    void expect(statusText).not.toContain("↓");

    // Should show dirty indicator
    void expect(statusText).toContain("*");

    // Cursor should be default (not clickable)
    const computedStyle = window.getComputedStyle(indicator);
    void expect(computedStyle.cursor).toBe("default");

    // Hover should NOT show refresh icon (canRebase is false)
    await userEvent.hover(indicator);

    const refreshIcon = indicator.querySelector(".refresh-icon-wrapper");
    await waitFor(() => {
      const refreshStyle = window.getComputedStyle(refreshIcon!);
      void expect(refreshStyle.display).not.toBe("flex");
    });
  },
};

export const RebaseWithConflicts: Story = {
  render: (args) => <InteractiveWrapper {...args} />,
  args: {
    gitStatus: { ahead: 2, behind: 5, dirty: true },
    tooltipPosition: "right",
    branchHeaders: mockBranchHeaders,
    commits: mockCommits,
    dirtyFiles: mockDirtyFiles,
    isLoading: false,
    errorMessage: null,
    canRebase: true,
    isRebasing: false,
    rebaseError:
      "Git rebase onto origin/main has conflicts in the following files:\n- src/conflict.txt\n- package.json\n\nPlease resolve the conflicts manually, then run:\n  git rebase --continue\nOr abort with:\n  git rebase --abort",
    onRebaseClick: () => undefined,
  },
  play: async ({ canvasElement }) => {
    const indicator = canvasElement.querySelector(".git-status-wrapper");
    if (!indicator) throw new Error("Git status indicator not found");

    // Hover to show tooltip
    await userEvent.hover(indicator);

    // Wait for tooltip to appear in document.body
    await waitFor(
      () => {
        const tooltip = document.querySelector("[data-git-tooltip]");
        void expect(tooltip).toBeInTheDocument();
      },
      { timeout: 2000 }
    );

    // Find error message in tooltip
    await waitFor(
      () => {
        const errorDiv = document.querySelector("[role='alert']");
        void expect(errorDiv).toBeInTheDocument();
        void expect(errorDiv?.textContent).toContain("conflicts");
      },
      { timeout: 2000 }
    );
  },
};

export const RebaseBlockedByStreaming: Story = {
  render: (args) => <InteractiveWrapper {...args} />,
  args: {
    gitStatus: { ahead: 0, behind: 5, dirty: false },
    tooltipPosition: "right",
    branchHeaders: mockBranchHeaders,
    commits: mockCommits,
    dirtyFiles: null,
    isLoading: false,
    errorMessage: null,
    canRebase: false,
    isRebasing: false,
    rebaseError: null,
    onRebaseClick: () => {
      // Should not be called
      throw new Error("onRebaseClick should not be called when blocked");
    },
  },
  play: async ({ canvasElement }) => {
    const indicator = canvasElement.querySelector(".git-status-wrapper");
    if (!indicator) throw new Error("Git status indicator not found");

    // Should show behind indicator
    const statusText = indicator.textContent;
    void expect(statusText).toContain("↓5");

    // Cursor should be default (not clickable)
    const computedStyle = window.getComputedStyle(indicator);
    void expect(computedStyle.cursor).toBe("default");

    // Hover should NOT show refresh icon (canRebase is false)
    await userEvent.hover(indicator);

    const refreshIcon = indicator.querySelector(".refresh-icon-wrapper");
    const statusIndicators = indicator.querySelector(".status-indicators");

    // Status indicators should remain visible
    await waitFor(() => {
      const statusStyle = window.getComputedStyle(statusIndicators!);
      void expect(statusStyle.display).not.toBe("none");
    });

    // Refresh icon should NOT be visible
    const refreshStyle = window.getComputedStyle(refreshIcon!);
    void expect(refreshStyle.display).not.toBe("flex");

    // Try to click - should not trigger onRebaseClick
    await userEvent.click(indicator);
  },
};

export const AgentResolving: Story = {
  render: (args) => <InteractiveWrapper {...args} />,
  args: {
    gitStatus: { ahead: 2, behind: 5, dirty: false },
    tooltipPosition: "right",
    branchHeaders: mockBranchHeaders,
    commits: mockCommits,
    dirtyFiles: null,
    isLoading: false,
    errorMessage: null,
    canRebase: false,
    isRebasing: false,
    isAgentResolving: true,
    agentConflictFiles: ["src/components/GitStatusIndicator.tsx", "package.json", "README.md"],
    rebaseError: null,
    onRebaseClick: () => {
      throw new Error("onRebaseClick should not be called while agent is resolving");
    },
  },
  play: async ({ canvasElement }) => {
    const indicator = canvasElement.querySelector(".git-status-wrapper");
    if (!indicator) throw new Error("Git status indicator not found");

    const refreshIcon = indicator.querySelector(".refresh-icon-wrapper");

    // Refresh icon should be visible (agent is working)
    await waitFor(() => {
      const computedStyle = window.getComputedStyle(refreshIcon!);
      void expect(computedStyle.display).toBe("flex");
    });

    // Should have pulsating animation
    await waitFor(() => {
      const computedStyle = window.getComputedStyle(refreshIcon!);
      void expect(computedStyle.animation).toContain("pulse");
    });

    // Cursor should be "wait"
    await waitFor(() => {
      const computedStyle = window.getComputedStyle(indicator);
      void expect(computedStyle.cursor).toBe("wait");
    });

    // Should have aria-busy attribute
    void expect(indicator.getAttribute("aria-busy")).toBe("true");

    // Should NOT be clickable (no role=button)
    void expect(indicator.getAttribute("role")).not.toBe("button");

    // Hover to see resolving message in tooltip
    await userEvent.hover(indicator);

    await waitFor(
      () => {
        const tooltip = document.querySelector("[data-git-tooltip]");
        void expect(tooltip).toBeInTheDocument();
        // Should show agent resolving message
        void expect(tooltip?.textContent).toContain("Agent is resolving conflicts");
        // Should show conflict files
        void expect(tooltip?.textContent).toContain("GitStatusIndicator.tsx");
        void expect(tooltip?.textContent).toContain("package.json");
      },
      { timeout: 2000 }
    );

    // Try to click - should not trigger onRebaseClick
    await userEvent.click(indicator);
  },
};

export const AgentResolvingToSuccess: Story = {
  render: function Render(args) {
    const [, updateArgs] = useArgs<InteractivePropsUpdated>();

    // Simulate agent resolution lifecycle
    useEffect(() => {
      if (args.isAgentResolving) {
        // After 3 seconds, simulate agent successfully resolved conflicts
        const timer = setTimeout(() => {
          updateArgs({
            isAgentResolving: false,
            gitStatus: { ...args.gitStatus!, behind: 0 }, // Rebase succeeded!
          });
        }, 3000);
        return () => clearTimeout(timer);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [args.isAgentResolving]);

    return <RebaseInteractiveWrapper {...args} updateArgs={updateArgs} />;
  },
  args: {
    gitStatus: { ahead: 2, behind: 5, dirty: false },
    tooltipPosition: "right",
    branchHeaders: mockBranchHeaders,
    commits: mockCommits,
    dirtyFiles: null,
    isLoading: false,
    errorMessage: null,
    canRebase: false,
    isRebasing: false,
    isAgentResolving: true,
    agentConflictFiles: ["src/conflict.txt", "package.json"],
    rebaseError: null,
    onRebaseClick: () => undefined,
  },
  play: async ({ canvasElement }) => {
    const indicator = canvasElement.querySelector(".git-status-wrapper");
    if (!indicator) throw new Error("Git status indicator not found");

    const refreshIcon = indicator.querySelector(".refresh-icon-wrapper");

    // Initially: should show pulsating icon
    await waitFor(() => {
      const computedStyle = window.getComputedStyle(refreshIcon!);
      void expect(computedStyle.display).toBe("flex");
      void expect(computedStyle.animation).toContain("pulse");
    });

    // Should show behind count
    let statusText = indicator.textContent;
    void expect(statusText).toContain("↓5");

    // Wait for auto-update (agent finishes after 3s)
    await waitFor(
      () => {
        statusText = indicator.textContent || "";
        // Behind count should become 0 (success)
        void expect(statusText).not.toContain("↓");
      },
      { timeout: 5000 }
    );

    // Icon should stop pulsating (no longer resolving)
    await waitFor(() => {
      const computedStyle = window.getComputedStyle(refreshIcon!);
      // Icon should be hidden now (not rebasing or resolving)
      void expect(computedStyle.display).not.toBe("flex");
    });

    // Should show only ahead count
    void expect(statusText).toContain("↑2");
  },
};

export const AgentResolvingToFailure: Story = {
  render: function Render(args) {
    const [, updateArgs] = useArgs<InteractivePropsUpdated>();

    // Simulate agent failing to resolve
    useEffect(() => {
      if (args.isAgentResolving) {
        // After 3 seconds, simulate agent failed to resolve
        const timer = setTimeout(() => {
          updateArgs({
            isAgentResolving: false,
            gitStatus: { ...args.gitStatus!, behind: 5 }, // Still behind
            rebaseError: "Agent couldn't fully resolve the conflicts. Check chat for details.",
          });
        }, 3000);
        return () => clearTimeout(timer);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [args.isAgentResolving]);

    return <RebaseInteractiveWrapper {...args} updateArgs={updateArgs} />;
  },
  args: {
    gitStatus: { ahead: 2, behind: 5, dirty: false },
    tooltipPosition: "right",
    branchHeaders: mockBranchHeaders,
    commits: mockCommits,
    dirtyFiles: null,
    isLoading: false,
    errorMessage: null,
    canRebase: false,
    isRebasing: false,
    isAgentResolving: true,
    agentConflictFiles: ["src/utils/rebase.ts", "src/config.ts"],
    rebaseError: null,
    onRebaseClick: () => undefined,
  },
  play: async ({ canvasElement }) => {
    const indicator = canvasElement.querySelector(".git-status-wrapper");
    if (!indicator) throw new Error("Git status indicator not found");

    const refreshIcon = indicator.querySelector(".refresh-icon-wrapper");

    // Initially: pulsating icon while agent works
    await waitFor(() => {
      const computedStyle = window.getComputedStyle(refreshIcon!);
      void expect(computedStyle.display).toBe("flex");
      void expect(computedStyle.animation).toContain("pulse");
    });

    // Wait for agent to finish (fails after 3s)
    await waitFor(
      () => {
        // Icon should stop pulsating
        const computedStyle = window.getComputedStyle(refreshIcon!);
        void expect(computedStyle.display).not.toBe("flex");
      },
      { timeout: 5000 }
    );

    // Should still show behind count (agent failed)
    const statusText = indicator.textContent;
    void expect(statusText).toContain("↓5");

    // Hover to see error in tooltip
    await userEvent.hover(indicator);

    await waitFor(
      () => {
        const errorDiv = document.querySelector("[role='alert']");
        void expect(errorDiv).toBeInTheDocument();
        void expect(errorDiv?.textContent).toContain("Agent couldn't fully resolve");
      },
      { timeout: 2000 }
    );
  },
};
