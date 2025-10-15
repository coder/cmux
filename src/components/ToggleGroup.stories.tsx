import type { Meta, StoryObj } from "@storybook/react";
import { action } from "@storybook/addon-actions";
import { expect, userEvent, within, waitFor } from "@storybook/test";
import { useArgs } from "@storybook/preview-api";
import { ToggleGroup, type ToggleOption } from "./ToggleGroup";
import { useState } from "react";
import styled from "@emotion/styled";

const DemoContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
`;

const meta = {
  title: "Components/ToggleGroup",
  component: ToggleGroup,
  parameters: {
    layout: "centered",
    controls: {
      exclude: ["onChange"],
    },
  },
  argTypes: {
    options: {
      control: "object",
      description: "Array of options",
    },
    value: {
      control: "text",
      description: "Currently selected value",
    },
  },
  args: {
    onChange: action("value-changed"),
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoOptions: Story = {
  args: {
    options: [
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ],
    value: "dark",
  },
  render: function Render(args) {
    const [{ value }, updateArgs] = useArgs<Story["args"]>();

    return (
      <ToggleGroup
        {...args}
        value={value}
        onChange={(newValue) => updateArgs({ value: newValue })}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Find all buttons
    const lightButton = canvas.getByRole("button", { name: /light/i });
    const darkButton = canvas.getByRole("button", { name: /dark/i });

    // Initial state - dark should be active
    await expect(darkButton).toHaveAttribute("aria-pressed", "true");
    await expect(lightButton).toHaveAttribute("aria-pressed", "false");

    // Click light button
    await userEvent.click(lightButton);

    // Verify state changed using waitFor
    await waitFor(() => {
      void expect(lightButton).toHaveAttribute("aria-pressed", "true");
      void expect(darkButton).toHaveAttribute("aria-pressed", "false");
    });

    // Click dark button to toggle back
    await userEvent.click(darkButton);

    // Verify state changed back using waitFor
    await waitFor(() => {
      void expect(darkButton).toHaveAttribute("aria-pressed", "true");
      void expect(lightButton).toHaveAttribute("aria-pressed", "false");
    });
  },
};

export const ThreeOptions: Story = {
  args: {
    options: [
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" },
    ],
    value: "medium",
  },
  render: function Render(args) {
    const [{ value }, updateArgs] = useArgs<Story["args"]>();

    return (
      <ToggleGroup
        {...args}
        value={value}
        onChange={(newValue) => updateArgs({ value: newValue })}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Find all buttons
    const smallButton = canvas.getByRole("button", { name: /small/i });
    const mediumButton = canvas.getByRole("button", { name: /medium/i });
    const largeButton = canvas.getByRole("button", { name: /large/i });

    // Initial state - medium should be active, others inactive
    await expect(mediumButton).toHaveAttribute("aria-pressed", "true");
    await expect(smallButton).toHaveAttribute("aria-pressed", "false");
    await expect(largeButton).toHaveAttribute("aria-pressed", "false");

    // Click small button
    await userEvent.click(smallButton);

    // Verify only small is active using waitFor
    await waitFor(() => {
      void expect(smallButton).toHaveAttribute("aria-pressed", "true");
      void expect(mediumButton).toHaveAttribute("aria-pressed", "false");
      void expect(largeButton).toHaveAttribute("aria-pressed", "false");
    });

    // Click large button
    await userEvent.click(largeButton);

    // Verify only large is active using waitFor
    await waitFor(() => {
      void expect(largeButton).toHaveAttribute("aria-pressed", "true");
      void expect(smallButton).toHaveAttribute("aria-pressed", "false");
      void expect(mediumButton).toHaveAttribute("aria-pressed", "false");
    });
  },
};

export const ManyOptions: Story = {
  args: {
    options: [
      { value: "mon", label: "Mon" },
      { value: "tue", label: "Tue" },
      { value: "wed", label: "Wed" },
      { value: "thu", label: "Thu" },
      { value: "fri", label: "Fri" },
      { value: "sat", label: "Sat" },
      { value: "sun", label: "Sun" },
    ],
    value: "mon",
  },
  render: function Render(args) {
    const [{ value }, updateArgs] = useArgs<Story["args"]>();

    return (
      <ToggleGroup
        {...args}
        value={value}
        onChange={(newValue) => updateArgs({ value: newValue })}
      />
    );
  },
};

const StyledModeToggle = styled.div<{ mode: "exec" | "plan" }>`
  display: flex;
  gap: 0;
  background: var(--color-toggle-bg);
  border-radius: 4px;

  button {
    &:first-of-type {
      ${(props) =>
        props.mode === "exec" &&
        `
        background: var(--color-exec-mode);
        color: white;

        &:hover {
          background: var(--color-exec-mode-hover);
        }
      `}
    }

    &:last-of-type {
      ${(props) =>
        props.mode === "plan" &&
        `
        background: var(--color-plan-mode);
        color: white;

        &:hover {
          background: var(--color-plan-mode-hover);
        }
      `}
    }
  }
`;

export const PermissionModes: Story = {
  args: {
    options: [
      { value: "exec", label: "Exec" },
      { value: "plan", label: "Plan" },
    ],
    value: "exec",
  },
  render: function Render(args) {
    const [{ value }, updateArgs] = useArgs<Story["args"]>();

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <StyledModeToggle mode={value as "exec" | "plan"}>
          <ToggleGroup
            {...args}
            value={value}
            onChange={(newValue) => updateArgs({ value: newValue })}
          />
        </StyledModeToggle>
        <div
          style={{
            fontSize: "11px",
            color: "#808080",
            fontFamily: "var(--font-primary)",
          }}
        >
          <strong>Exec</strong> (purple): AI edits files and executes commands
          <br />
          <strong>Plan</strong> (blue): AI only provides plans without executing
        </div>
      </div>
    );
  },
};

export const ViewModes: Story = {
  args: {
    options: [
      { value: "grid", label: "Grid View" },
      { value: "list", label: "List View" },
    ],
    value: "grid",
  },
  render: function Render(args) {
    const [{ value }, updateArgs] = useArgs<Story["args"]>();

    return (
      <ToggleGroup
        {...args}
        value={value}
        onChange={(newValue) => updateArgs({ value: newValue })}
      />
    );
  },
};

export const WithStateDisplay: Story = {
  args: {
    options: [
      { value: "enabled", label: "Enabled" },
      { value: "disabled", label: "Disabled" },
    ],
    value: "enabled",
  },
  render: function Render(args) {
    const [{ value }, updateArgs] = useArgs<Story["args"]>();

    return (
      <DemoContainer>
        <ToggleGroup
          {...args}
          value={value}
          onChange={(newValue) => updateArgs({ value: newValue })}
        />
        <div
          style={{
            fontSize: "12px",
            color: "#808080",
            fontFamily: "var(--font-primary)",
          }}
        >
          Current selection: <strong style={{ color: "#cccccc" }}>{value}</strong>
        </div>
      </DemoContainer>
    );
  },
};

export const MultipleGroups: Story = {
  parameters: {
    controls: { disable: true },
  },
  args: {
    options: [],
    value: "",
  },
  render: function Render() {
    const [theme, setTheme] = useState<"light" | "dark">("dark");
    const [size, setSize] = useState<"small" | "medium" | "large">("medium");
    const [layout, setLayout] = useState<"compact" | "comfortable" | "spacious">("comfortable");

    const themeOptions: Array<ToggleOption<"light" | "dark">> = [
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ];

    const sizeOptions: Array<ToggleOption<"small" | "medium" | "large">> = [
      { value: "small", label: "S" },
      { value: "medium", label: "M" },
      { value: "large", label: "L" },
    ];

    const layoutOptions: Array<ToggleOption<"compact" | "comfortable" | "spacious">> = [
      { value: "compact", label: "Compact" },
      { value: "comfortable", label: "Comfortable" },
      { value: "spacious", label: "Spacious" },
    ];

    const handleThemeChange = (newValue: "light" | "dark") => {
      action("theme-changed")(newValue);
      setTheme(newValue);
    };

    const handleSizeChange = (newValue: "small" | "medium" | "large") => {
      action("size-changed")(newValue);
      setSize(newValue);
    };

    const handleLayoutChange = (newValue: "compact" | "comfortable" | "spacious") => {
      action("layout-changed")(newValue);
      setLayout(newValue);
    };

    return (
      <DemoContainer>
        <div>
          <div
            style={{
              fontSize: "11px",
              color: "#808080",
              marginBottom: "6px",
              fontFamily: "var(--font-primary)",
            }}
          >
            Theme
          </div>
          <ToggleGroup options={themeOptions} value={theme} onChange={handleThemeChange} />
        </div>

        <div>
          <div
            style={{
              fontSize: "11px",
              color: "#808080",
              marginBottom: "6px",
              fontFamily: "var(--font-primary)",
            }}
          >
            Size
          </div>
          <ToggleGroup options={sizeOptions} value={size} onChange={handleSizeChange} />
        </div>

        <div>
          <div
            style={{
              fontSize: "11px",
              color: "#808080",
              marginBottom: "6px",
              fontFamily: "var(--font-primary)",
            }}
          >
            Layout
          </div>
          <ToggleGroup options={layoutOptions} value={layout} onChange={handleLayoutChange} />
        </div>
      </DemoContainer>
    );
  },
};
