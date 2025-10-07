# Chromatic Build Issue Summary

## Problem
Storybook builds locally but fails in Chromatic with error:
```
TypeError: a is not a function
at https://68e30fca49979473fc9abc73-...chromatic.com/assets/AssistantMessage.stories-...js:6:11
```

This is the minified version of `styled is not a function` - @emotion/styled's default export isn't being resolved correctly in Chromatic's build environment.

## Root Cause
Almost every component in the project uses `@emotion/styled` (25+ files). The issue appears to be a module resolution problem specific to Chromatic's infrastructure where the default export from @emotion/styled becomes undefined in the production build.

## Attempted Solutions
1. ✅ Converted 2 tool components (BashToolCall, FileReadToolCall) to CSS modules
2. ✅ Added dedupe config for emotion packages  
3. ❌ CommonJS inclusion config (broke build)
4. ❌ Explicit emotion/styled alias (broke build)
5. ❌ Various Babel/Vite configurations

## Current Status
- Local Storybook build: ✅ Works
- Chromatic build: ❌ Fails with "a is not a function"
- Partially converted: 2/4 tool components, but 25+ other components still use styled

## Options Going Forward

### Option 1: Complete CSS Modules Conversion (High Effort)
- Convert all 25+ components from @emotion/styled to CSS modules
- Pros: Eliminates dependency on emotion/styled entirely
- Cons: 10-20 hours of work, risky refactor, may break styling

### Option 2: Debug Chromatic Bundle (Medium Effort)
- Deep dive into Chromatic's Vite build process
- Compare local vs Chromatic bundle outputs
- May require Chromatic support ticket
- Pros: Fixes root cause
- Cons: May be Chromatic infrastructure issue outside our control

### Option 3: Skip Chromatic for Now (Low Effort)
- Disable Chromatic workflow temporarily
- Use local Storybook for development
- Revisit when Chromatic updates or when we have more time
- Pros: Unblocks current work
- Cons: Loses visual regression testing

### Option 4: Simplify Storybook Scope (Medium Effort)
- Only include stories for components that don't use styled
- Or create simplified versions of components for Storybook only
- Pros: Gets some stories working in Chromatic
- Cons: Limited coverage

## Recommendation
**Option 3** (Skip Chromatic for now) + document the issue for later investigation.

The emotion/styled issue appears to be environmental (Chromatic-specific) rather than a code problem. Local Storybook works fine for development. Visual regression testing can be added back once the root cause is identified.

## Files Modified
- `.storybook/main.ts` - Added dedupe config
- `src/components/tools/BashToolCall.tsx` - Converted to CSS modules
- `src/components/tools/FileReadToolCall.tsx` - Converted to CSS modules
- `src/components/tools/shared/ToolPrimitives.tsx` - Converted to CSS modules
- Created corresponding `.module.css` files

## Components Still Using @emotion/styled
- AssistantMessage, UserMessage, MessageWindow, MarkdownRenderer
- TypewriterMarkdown, TypewriterText, StreamErrorMessage
- ReasoningMessage, TerminalOutput, ChatBarrier
- AIView, ChatInput, ProjectSidebar, ChatInputToast
- ErrorMessage, ErrorBoundary, CommandSuggestions
- ToggleGroup, Tooltip, ThinkingSlider, TipsCarousel
- NewWorkspaceModal, ChatMetaSidebar (and tabs)
- ProposePlanToolCall, FileEditToolCall

