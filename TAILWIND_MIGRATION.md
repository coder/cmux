# Tailwind CSS + Shadcn UI Migration

## Overview

This PR establishes the foundation for migrating from `@emotion/styled` to Tailwind CSS + Shadcn UI.

## What's Complete ✅

### Foundation (100%)
- ✅ Installed Tailwind CSS v3, PostCSS, autoprefixer
- ✅ Installed Radix UI primitives for Shadcn components  
- ✅ Created `tailwind.config.ts` with all custom color mappings (40+ colors)
- ✅ Created `src/styles/globals.css` with Tailwind directives and global styles
- ✅ Created `src/lib/utils.ts` with `cn()` utility for class merging
- ✅ Added Shadcn Button component as foundation for future components
- ✅ Updated `vite.config.ts` to remove `@emotion/babel-plugin` 
- ✅ Updated `App.tsx` to import `globals.css` instead of Emotion Global components
- ✅ Verified build works with Tailwind

### Converted Components (13/64 = 20%)

**Completed:**
- ✅ `src/components/ErrorMessage.tsx` - Error display component
- ✅ `src/components/ToggleGroup.tsx` - Toggle button group
- ✅ `src/components/StatusIndicator.tsx` - Status dot with tooltip
- ✅ `src/components/Tooltip.tsx` - Portal-based tooltip with collision detection
- ✅ `src/components/ChatToggles.tsx` - Chat control toggles container
- ✅ `src/components/Context1MCheckbox.tsx` - 1M context checkbox
- ✅ `src/components/Modal.tsx` - All modal components (10+ exports)
- ✅ `src/components/DirectorySelectModal.tsx` - Directory selection modal
- ✅ `src/components/tools/shared/ToolPrimitives.tsx` - All tool UI primitives (10+ exports)
- ✅ `src/components/Messages/HistoryHiddenMessage.tsx` - Hidden message indicator
- ✅ `src/components/Messages/TerminalOutput.tsx` - Terminal output display
- ✅ `src/components/Messages/CompactingMessageContent.tsx` - Compaction fade container
- ✅ `src/components/Messages/TypewriterMarkdown.tsx` - Streaming markdown

## What's Remaining ⏳

### Components Using styled-components (51 files)

**Current Progress:** 13 of 64 components converted = **20% complete**

The remaining 51 components include the most complex files in the codebase:

**Critical Path Components:**
- `src/App.tsx` - App container, main content, welcome view
- `src/components/ProjectSidebar.tsx` (990 LoC)
- `src/components/ChatInput.tsx` (907 LoC) 
- `src/components/AIView.tsx` (649 LoC)

**Tool Components (8 files):**
- `src/components/tools/BashToolCall.tsx`
- `src/components/tools/FileEditToolCall.tsx`
- `src/components/tools/FileReadToolCall.tsx`
- `src/components/tools/ProposePlanToolCall.tsx`
- `src/components/tools/shared/ToolPrimitives.tsx`

**Message Components (13 files):**
- `src/components/Messages/AssistantMessage.tsx`
- `src/components/Messages/UserMessage.tsx`
- `src/components/Messages/MessageWindow.tsx`
- `src/components/Messages/MarkdownRenderer.tsx`
- `src/components/Messages/TypewriterMarkdown.tsx`
- `src/components/Messages/ReasoningMessage.tsx`
- `src/components/Messages/CompactingMessageContent.tsx`
- `src/components/Messages/TerminalOutput.tsx`
- `src/components/Messages/ModelDisplay.tsx`
- `src/components/Messages/HistoryHiddenMessage.tsx`
- `src/components/Messages/StreamErrorMessage.tsx`
- `src/components/Messages/CompactionBackground.tsx`
- `src/components/Messages/ChatBarrier/*.tsx` (3 files)

**Right Sidebar Components (9 files):**
- `src/components/RightSidebar.tsx`
- `src/components/RightSidebar/CodeReview/ReviewPanel.tsx` (984 LoC)
- `src/components/RightSidebar/CodeReview/FileTree.tsx`
- `src/components/RightSidebar/CodeReview/HunkViewer.tsx`
- `src/components/RightSidebar/CodeReview/ReviewControls.tsx`
- `src/components/RightSidebar/CodeReview/RefreshButton.tsx`
- `src/components/RightSidebar/CodeReview/UntrackedStatus.tsx`
- `src/components/RightSidebar/CostsTab.tsx` (557 LoC)
- `src/components/RightSidebar/TokenMeter.tsx`
- `src/components/RightSidebar/VerticalTokenMeter.tsx`
- `src/components/RightSidebar/ConsumerBreakdown.tsx`

**UI Component Library (14 files):**
- `src/components/Modal.tsx`
- `src/components/Tooltip.tsx`
- `src/components/StatusIndicator.tsx`
- `src/components/CommandPalette.tsx` (533 LoC)
- `src/components/CommandSuggestions.tsx`
- `src/components/ModelSelector.tsx`
- `src/components/NewWorkspaceModal.tsx`
- `src/components/DirectorySelectModal.tsx`
- `src/components/KebabMenu.tsx`
- `src/components/VimTextArea.tsx`
- `src/components/ThinkingSlider.tsx`
- `src/components/ChatToggles.tsx`
- `src/components/Context1MCheckbox.tsx`
- `src/components/ErrorBoundary.tsx`

**Other Components (16 files):**
- `src/components/LeftSidebar.tsx`
- `src/components/WorkspaceListItem.tsx`
- `src/components/GitStatusIndicatorView.tsx`
- `src/components/ImageAttachments.tsx`
- `src/components/ChatInputToast.tsx`
- `src/components/TitleBar.tsx`
- `src/components/TodoList.tsx`
- `src/components/PinnedTodoList.tsx`
- `src/components/TipsCarousel.tsx`
- `src/components/SecretsModal.tsx`
- `src/components/shared/DiffRenderer.tsx` (629 LoC)
- And 5 more...

### Final Cleanup
- Remove `@emotion/react` and `@emotion/styled` from package.json
- Remove `src/styles/colors.tsx`, `fonts.tsx`, `scrollbars.tsx`
- Update all story files (12 files)

## Migration Pattern

### Before (Emotion)
```tsx
import styled from "@emotion/styled";

const Container = styled.div`
  display: flex;
  gap: 8px;
  background: var(--color-plan-mode-alpha);
`;

export function Component() {
  return <Container>...</Container>;
}
```

### After (Tailwind)
```tsx
import { cn } from "@/lib/utils";

export function Component() {
  return (
    <div className="flex gap-2 bg-plan-mode/10">
      ...
    </div>
  );
}
```

### Conditional Styles
```tsx
// Before
const Button = styled.button<{ active: boolean }>`
  color: ${props => props.active ? "white" : "gray"};
`;

// After
<button className={cn(
  "base-classes",
  active ? "text-white" : "text-gray-500"
)}>
```

## Color Mapping Reference

All colors from `src/styles/colors.tsx` are mapped to Tailwind utilities:

| Emotion Variable | Tailwind Class |
|-----------------|----------------|
| `var(--color-plan-mode)` | `text-plan-mode` / `bg-plan-mode` |
| `var(--color-exec-mode)` | `text-exec-mode` / `bg-exec-mode` |
| `var(--color-background)` | `bg-background` |
| `var(--color-text)` | `text-foreground` |
| `var(--color-error)` | `text-error` / `bg-error` |
| etc. | (see `tailwind.config.ts` for full list) |

## Testing

After converting each component:
1. ✅ Run `bun x tsc --noEmit` to verify types
2. ✅ Run `bun run dev` to test in browser
3. ✅ Verify visual appearance matches original
4. ✅ Test all interactive behaviors (hover, click, etc.)

## Next Steps

1. Convert remaining 62 components to Tailwind systematically
2. Start with simple components, work up to complex ones
3. Remove Emotion dependencies once all components converted
4. Update Storybook stories to work with Tailwind
5. Run full test suite (`make test-integration`)

## Estimated Effort

- Foundation setup: ✅ Complete
- Per-component conversion: ~15-30 minutes each
- Testing & refinement: ~2-4 hours
- Total remaining: **20-30 hours** of focused work

## Why This Migration?

1. **Industry standard** - Tailwind is widely adopted, easier to onboard new developers
2. **Smaller runtime** - No CSS-in-JS runtime overhead
3. **Better tooling** - Tailwind IntelliSense provides excellent autocomplete
4. **Shadcn quality** - Well-maintained, accessible component primitives
5. **Consistency** - Utility-first approach ensures consistent spacing/sizing

