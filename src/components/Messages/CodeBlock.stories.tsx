import type { Meta, StoryObj } from "@storybook/react";
import { AssistantMessage } from "./AssistantMessage";
import type { DisplayedMessage } from "@/types/message";

// Stable timestamp for visual testing
const STABLE_TIMESTAMP = new Date("2024-01-24T09:41:00-08:00").getTime();

const clipboardWriteText = () => Promise.resolve();

const createAssistantMessage = (content: string): DisplayedMessage & { type: "assistant" } => ({
  type: "assistant",
  id: "asst-msg-1",
  historyId: "hist-1",
  content,
  historySequence: 1,
  isStreaming: false,
  isPartial: false,
  isCompacted: false,
  timestamp: STABLE_TIMESTAMP,
  model: "anthropic:claude-sonnet-4-5",
});

const meta = {
  title: "Messages/CodeBlocks",
  component: AssistantMessage,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  args: {
    clipboardWriteText,
  },
} satisfies Meta<typeof AssistantMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicCodeBlock: Story = {
  args: {
    message: createAssistantMessage(
      "Here's a simple TypeScript function:\n\n" +
        "```typescript\n" +
        "function greet(name: string): string {\n" +
        "  return `Hello, ${name}!`;\n" +
        "}\n" +
        "```"
    ),
  },
};

export const LongLines: Story = {
  args: {
    message: createAssistantMessage(
      "This code has very long lines that will wrap:\n\n" +
        "```typescript\n" +
        "const veryLongVariableName = 'This is a very long string that should wrap when it exceeds the width of the code block container, demonstrating the line-wrapping behavior';\n" +
        "\n" +
        "function processDataWithManyParameters(firstName: string, lastName: string, email: string, phoneNumber: string, address: string, city: string, state: string, zipCode: string) {\n" +
        "  console.log('Processing user data with all the provided information about the user including their contact details and location');\n" +
        "  return { firstName, lastName, email, phoneNumber, address, city, state, zipCode };\n" +
        "}\n" +
        "```"
    ),
  },
};

export const ManyLines: Story = {
  args: {
    message: createAssistantMessage(
      "A longer code example with many lines:\n\n" +
        "```typescript\n" +
        "import React, { useState, useEffect } from 'react';\n" +
        "import axios from 'axios';\n" +
        "\n" +
        "interface User {\n" +
        "  id: number;\n" +
        "  name: string;\n" +
        "  email: string;\n" +
        "}\n" +
        "\n" +
        "const UserList: React.FC = () => {\n" +
        "  const [users, setUsers] = useState<User[]>([]);\n" +
        "  const [loading, setLoading] = useState(true);\n" +
        "  const [error, setError] = useState<string | null>(null);\n" +
        "\n" +
        "  useEffect(() => {\n" +
        "    async function fetchUsers() {\n" +
        "      try {\n" +
        "        const response = await axios.get('/api/users');\n" +
        "        setUsers(response.data);\n" +
        "      } catch (err) {\n" +
        "        setError('Failed to load users');\n" +
        "      } finally {\n" +
        "        setLoading(false);\n" +
        "      }\n" +
        "    }\n" +
        "\n" +
        "    void fetchUsers();\n" +
        "  }, []);\n" +
        "\n" +
        "  if (loading) return <div>Loading...</div>;\n" +
        "  if (error) return <div>Error: {error}</div>;\n" +
        "\n" +
        "  return (\n" +
        "    <ul>\n" +
        "      {users.map((user) => (\n" +
        "        <li key={user.id}>\n" +
        "          {user.name} ({user.email})\n" +
        "        </li>\n" +
        "      ))}\n" +
        "    </ul>\n" +
        "  );\n" +
        "};\n" +
        "\n" +
        "export default UserList;\n" +
        "```"
    ),
  },
};

export const MultipleLanguages: Story = {
  args: {
    message: createAssistantMessage(
      "Here are examples in different languages:\n\n" +
        "**TypeScript:**\n" +
        "```typescript\n" +
        "const sum = (a: number, b: number): number => a + b;\n" +
        "console.log(sum(5, 3));\n" +
        "```\n\n" +
        "**Python:**\n" +
        "```python\n" +
        "def sum(a, b):\n" +
        "    return a + b\n" +
        "\n" +
        "print(sum(5, 3))\n" +
        "```\n\n" +
        "**Bash:**\n" +
        "```bash\n" +
        "#!/bin/bash\n" +
        "sum=$((5 + 3))\n" +
        "echo $sum\n" +
        "```"
    ),
  },
};

export const SingleLine: Story = {
  args: {
    message: createAssistantMessage(
      "A single-line code block:\n\n" + "```typescript\n" + "const x = 42;\n" + "```"
    ),
  },
};

export const EmptyLines: Story = {
  args: {
    message: createAssistantMessage(
      "Code with empty lines:\n\n" +
        "```typescript\n" +
        "function example() {\n" +
        "  const first = 1;\n" +
        "\n" +
        "  const second = 2;\n" +
        "\n" +
        "\n" +
        "  return first + second;\n" +
        "}\n" +
        "```"
    ),
  },
};

export const JSXExample: Story = {
  args: {
    message: createAssistantMessage(
      "A React component with JSX:\n\n" +
        "```tsx\n" +
        "import React from 'react';\n" +
        "\n" +
        "interface ButtonProps {\n" +
        "  label: string;\n" +
        "  onClick: () => void;\n" +
        "  disabled?: boolean;\n" +
        "}\n" +
        "\n" +
        "export const Button: React.FC<ButtonProps> = ({ label, onClick, disabled = false }) => {\n" +
        "  return (\n" +
        "    <button\n" +
        "      onClick={onClick}\n" +
        "      disabled={disabled}\n" +
        '      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"\n' +
        "    >\n" +
        "      {label}\n" +
        "    </button>\n" +
        "  );\n" +
        "};\n" +
        "```"
    ),
  },
};

export const LongLinesAndManyLines: Story = {
  args: {
    message: createAssistantMessage(
      "Complex code with both many lines and long lines:\n\n" +
        "```typescript\n" +
        "// Configuration object with detailed documentation\n" +
        "const applicationConfiguration = {\n" +
        "  apiEndpoint: 'https://api.example.com/v1/users/authenticate/verify-credentials-and-return-session-token',\n" +
        "  timeout: 30000,\n" +
        "  retryAttempts: 3,\n" +
        "  headers: {\n" +
        "    'Content-Type': 'application/json',\n" +
        "    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',\n" +
        "    'X-Custom-Header': 'This is a very long custom header value that contains multiple pieces of information',\n" +
        "  },\n" +
        "  features: {\n" +
        "    enableAdvancedAnalytics: true,\n" +
        "    enableRealTimeNotifications: true,\n" +
        "    enableExperimentalFeatures: false,\n" +
        "  },\n" +
        "};\n" +
        "\n" +
        "async function makeAuthenticatedRequest(endpoint: string, data: unknown): Promise<Response> {\n" +
        "  const fullUrl = `${applicationConfiguration.apiEndpoint}${endpoint}?timestamp=${Date.now()}&includeMetadata=true&format=json`;\n" +
        "  \n" +
        "  try {\n" +
        "    const response = await fetch(fullUrl, {\n" +
        "      method: 'POST',\n" +
        "      headers: applicationConfiguration.headers,\n" +
        "      body: JSON.stringify(data),\n" +
        "    });\n" +
        "    \n" +
        "    if (!response.ok) {\n" +
        "      throw new Error(`HTTP error! status: ${response.status}, message: ${response.statusText}`);\n" +
        "    }\n" +
        "    \n" +
        "    return response;\n" +
        "  } catch (error) {\n" +
        "    console.error('Failed to make authenticated request with the following error details:', error);\n" +
        "    throw error;\n" +
        "  }\n" +
        "}\n" +
        "```"
    ),
  },
};
