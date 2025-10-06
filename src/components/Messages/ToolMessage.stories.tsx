import type { Meta, StoryObj } from "@storybook/react";
import { ToolMessage } from "./ToolMessage";
import type { DisplayedMessage } from "@/types/message";
import type { BashToolResult, FileEditReplaceToolResult } from "@/types/tools";

const meta = {
  title: "Messages/ToolMessage",
  component: ToolMessage,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ToolMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

// Helper to create tool message data
const createToolMessage = (
  overrides?: Partial<DisplayedMessage & { type: "tool" }>
): DisplayedMessage & { type: "tool" } => ({
  type: "tool",
  id: "tool-1",
  historyId: "hist-1",
  toolCallId: "call-1",
  toolName: "bash",
  args: {
    script: "echo 'Hello World'",
    timeout_secs: 10,
    max_lines: 1000,
  },
  status: "completed",
  isPartial: false,
  historySequence: 1,
  timestamp: Date.now(),
  ...overrides,
});

// Bash Tool Stories
export const BashSuccess: Story = {
  args: {
    message: createToolMessage({
      toolName: "bash",
      args: {
        script: "ls -la src/components",
        timeout_secs: 10,
        max_lines: 1000,
      },
      result: {
        success: true,
        exitCode: 0,
        output: `total 64
drwxr-xr-x  16 user  staff   512 Oct  5 18:57 .
drwxr-xr-x   8 user  staff   256 Oct  5 18:57 ..
-rw-r--r--   1 user  staff  1234 Oct  5 18:57 AIView.tsx
-rw-r--r--   1 user  staff  2345 Oct  5 18:57 ChatInput.tsx
-rw-r--r--   1 user  staff  3456 Oct  5 18:57 ErrorBoundary.tsx`,
        wall_duration_ms: 234,
      } satisfies BashToolResult,
      status: "completed",
    }),
  },
};

export const BashFailure: Story = {
  args: {
    message: createToolMessage({
      toolName: "bash",
      args: {
        script: "cat nonexistent-file.txt",
        timeout_secs: 10,
        max_lines: 1000,
      },
      result: {
        success: false,
        exitCode: 1,
        output: "cat: nonexistent-file.txt: No such file or directory",
        error: "Command exited with code 1",
        wall_duration_ms: 45,
      } satisfies BashToolResult,
      status: "failed",
    }),
  },
};

export const BashExecuting: Story = {
  args: {
    message: createToolMessage({
      toolName: "bash",
      args: {
        script: "bun run build && bun run test",
        timeout_secs: 120,
        max_lines: 1000,
      },
      status: "executing",
    }),
  },
};

export const BashLongOutput: Story = {
  args: {
    message: createToolMessage({
      toolName: "bash",
      args: {
        script: "find . -name '*.tsx' | head -20",
        timeout_secs: 30,
        max_lines: 1000,
      },
      result: {
        success: true,
        exitCode: 0,
        output: `./src/App.tsx
./src/components/AIView.tsx
./src/components/ChatInput.tsx
./src/components/ChatInputToast.tsx
./src/components/ErrorBoundary.tsx
./src/components/Messages/AssistantMessage.tsx
./src/components/Messages/MarkdownRenderer.tsx
./src/components/Messages/ToolMessage.tsx
./src/components/Messages/UserMessage.tsx
./src/components/NewWorkspaceModal.tsx
./src/components/ProjectSidebar.tsx
./src/components/tools/BashToolCall.tsx
./src/components/tools/FileEditToolCall.tsx
./src/components/tools/GenericToolCall.tsx
./src/main.tsx
./src/styles/colors.tsx
./src/styles/fonts.tsx
./.storybook/preview.tsx
./tests/setup.tsx
./tests/integration/basic.test.tsx`,
        wall_duration_ms: 1234,
      } satisfies BashToolResult,
      status: "completed",
    }),
  },
};

// File Edit Tool Stories
export const FileEditReplaceSuccess: Story = {
  args: {
    message: createToolMessage({
      toolName: "file_edit_replace",
      args: {
        file_path: "src/components/Messages/AssistantMessage.tsx",
        edits: [
          {
            old_string: "const [showRaw, setShowRaw] = useState(false);",
            new_string: "const [showRaw, setShowRaw] = useState(true);",
          },
        ],
        lease: "abc123",
      },
      result: {
        success: true,
        edits_applied: 1,
        lease: "def456",
        diff: `Index: src/components/Messages/AssistantMessage.tsx
===================================================================
--- src/components/Messages/AssistantMessage.tsx
+++ src/components/Messages/AssistantMessage.tsx
@@ -46,7 +46,7 @@
 
 export const AssistantMessage: React.FC<AssistantMessageProps> = ({ message, className }) => {
-  const [showRaw, setShowRaw] = useState(false);
+  const [showRaw, setShowRaw] = useState(true);
   const [copied, setCopied] = useState(false);
 
   const content = message.content;`,
      } satisfies FileEditReplaceToolResult,
      status: "completed",
    }),
  },
};

export const FileEditInsertSuccess: Story = {
  args: {
    message: createToolMessage({
      toolName: "file_edit_insert",
      args: {
        file_path: "src/types/message.ts",
        line_offset: 10,
        content: "  // New comment added\n  export type NewType = string;\n",
        lease: "xyz789",
      },
      result: {
        success: true,
        edits_applied: 1,
        lease: "uvw012",
        diff: `Index: src/types/message.ts
===================================================================
--- src/types/message.ts
+++ src/types/message.ts
@@ -8,6 +8,8 @@
 export interface CmuxMetadata {
   historySequence?: number;
   duration?: number;
+  // New comment added
+  export type NewType = string;
   timestamp?: number;
   model?: string;
 }`,
      } satisfies FileEditReplaceToolResult,
      status: "completed",
    }),
  },
};

export const FileEditFailure: Story = {
  args: {
    message: createToolMessage({
      toolName: "file_edit_replace",
      args: {
        file_path: "src/nonexistent.tsx",
        edits: [
          {
            old_string: "old code",
            new_string: "new code",
          },
        ],
        lease: "bad123",
      },
      result: {
        success: false,
        error: "File not found: src/nonexistent.tsx",
      } satisfies FileEditReplaceToolResult,
      status: "failed",
    }),
  },
};

export const FileEditExecuting: Story = {
  args: {
    message: createToolMessage({
      toolName: "file_edit_replace",
      args: {
        file_path: "src/components/AIView.tsx",
        edits: [
          {
            old_string: "old implementation",
            new_string: "new implementation",
          },
        ],
        lease: "pending123",
      },
      status: "executing",
    }),
  },
};

export const FileEditMultipleEdits: Story = {
  args: {
    message: createToolMessage({
      toolName: "file_edit_replace",
      args: {
        file_path: "src/config.ts",
        edits: [
          {
            old_string: "export const API_TIMEOUT = 30000;",
            new_string: "export const API_TIMEOUT = 60000;",
          },
          {
            old_string: "export const MAX_RETRIES = 3;",
            new_string: "export const MAX_RETRIES = 5;",
          },
        ],
        lease: "multi123",
      },
      result: {
        success: true,
        edits_applied: 2,
        lease: "multi456",
        diff: `Index: src/config.ts
===================================================================
--- src/config.ts
+++ src/config.ts
@@ -1,5 +1,5 @@
-export const API_TIMEOUT = 30000;
-export const MAX_RETRIES = 3;
+export const API_TIMEOUT = 60000;
+export const MAX_RETRIES = 5;
 export const DEBUG = false;`,
      } satisfies FileEditReplaceToolResult,
      status: "completed",
    }),
  },
};

// File Read Tool Stories
export const FileReadSuccess: Story = {
  args: {
    message: createToolMessage({
      toolName: "file_read",
      args: {
        filePath: "src/components/Messages/AssistantMessage.tsx",
      },
      result: {
        success: true,
        file_size: 3199,
        modifiedTime: "2025-10-05T23:57:48.206Z",
        lines_read: 126,
        content: `import React, { useState } from "react";
import styled from "@emotion/styled";
import type { DisplayedMessage } from "@/types/message";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { TypewriterMarkdown } from "./TypewriterMarkdown";
import type { ButtonConfig } from "./MessageWindow";
import { MessageWindow } from "./MessageWindow";

const RawContent = styled.pre\`
  font-family: var(--font-monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
\`;

const WaitingMessage = styled.div\`
  font-family: var(--font-primary);
  font-size: 13px;
  color: var(--color-text-secondary);
  font-style: italic;
\`;`,
        lease: "abc123",
      },
      status: "completed",
    }),
  },
};

export const FileReadPartial: Story = {
  args: {
    message: createToolMessage({
      toolName: "file_read",
      args: {
        filePath: "src/types/message.ts",
        offset: 1,
        limit: 20,
      },
      result: {
        success: true,
        file_size: 5344,
        modifiedTime: "2025-10-05T23:57:48.222Z",
        lines_read: 20,
        content: `import type { UIMessage } from "ai";
import type { LanguageModelV2Usage } from "@ai-sdk/provider";
import type { StreamErrorType } from "./errors";

// Our custom metadata type
export interface CmuxMetadata {
  historySequence?: number;
  duration?: number;
  timestamp?: number;
  model?: string;
  usage?: LanguageModelV2Usage;
  providerMetadata?: Record<string, unknown>;
  systemMessageTokens?: number;
  partial?: boolean;
  synthetic?: boolean;
  error?: string;
  errorType?: StreamErrorType;
}

// Extended tool part type`,
        lease: "def456",
      },
      status: "completed",
    }),
  },
};

export const FileReadFailure: Story = {
  args: {
    message: createToolMessage({
      toolName: "file_read",
      args: {
        filePath: "src/nonexistent/file.tsx",
      },
      result: {
        success: false,
        error: "ENOENT: no such file or directory, open 'src/nonexistent/file.tsx'",
      },
      status: "failed",
    }),
  },
};

export const FileReadExecuting: Story = {
  args: {
    message: createToolMessage({
      toolName: "file_read",
      args: {
        filePath: "src/components/AIView.tsx",
        offset: 50,
        limit: 100,
      },
      status: "executing",
    }),
  },
};

export const FileReadLargeFile: Story = {
  args: {
    message: createToolMessage({
      toolName: "file_read",
      args: {
        filePath: "package-lock.json",
      },
      result: {
        success: true,
        file_size: 524288, // 512KB
        modifiedTime: "2025-10-05T23:57:48.222Z",
        lines_read: 15234,
        content: `{
  "name": "cmux",
  "version": "0.0.1",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "cmux",
      "version": "0.0.1",
      "dependencies": {
        "@ai-sdk/anthropic": "^2.0.20",
        "@ai-sdk/google": "^2.0.17",
        "@ai-sdk/openai": "^2.0.40",
        "react": "^18.2.0",
        "react-dom": "^18.2.0"
      },
      "devDependencies": {
        "@types/react": "^18.2.0",
        "@types/react-dom": "^18.2.0",
        "typescript": "^5.1.3",
        "vite": "^4.4.0"
      }
    }
  }
}`,
        lease: "large123",
      },
      status: "completed",
    }),
  },
};
