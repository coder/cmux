import type { Meta, StoryObj } from "@storybook/react";
import { useRef } from "react";
import App from "./App";
import type { ProjectConfig } from "./config";
import type { FrontendWorkspaceMetadata } from "./types/workspace";
import type { IPCApi } from "./types/ipc";

// Helper to create git status script output
function createGitStatusOutput(ahead: number, behind: number, dirty: number): string {
  // Create show-branch output format based on ahead/behind counts
  const lines: string[] = [];
  lines.push("! [HEAD] current branch");
  lines.push(" ! [origin/main] remote branch");
  lines.push("--");
  
  // Add "ahead" commits (in HEAD but not origin)
  for (let i = 0; i < ahead; i++) {
    lines.push(`-  [abc${i.toString().padStart(4, '0')}] commit ahead ${i + 1}`);
  }
  
  // Add "behind" commits (in origin but not HEAD)
  for (let i = 0; i < behind; i++) {
    lines.push(` + [def${i.toString().padStart(4, '0')}] commit behind ${i + 1}`);
  }
  
  const showBranchOutput = lines.join("\n");
  
  return `---PRIMARY---
main
---SHOW_BRANCH---
${showBranchOutput}
---DIRTY---
${dirty}`;
}

// Mock window.api for App component
function setupMockAPI(options: {
  projects?: Map<string, ProjectConfig>;
  workspaces?: FrontendWorkspaceMetadata[];
  selectedWorkspaceId?: string;
  apiOverrides?: Partial<IPCApi>;
  gitStatusMap?: Map<string, { ahead: number; behind: number; dirty: number }>;
}) {
  const mockProjects = options.projects ?? new Map();
  const mockWorkspaces = options.workspaces ?? [];
  const gitStatusMap = options.gitStatusMap ?? new Map();

  const mockApi: IPCApi = {
    dialog: {
      selectDirectory: () => Promise.resolve(null),
    },
    providers: {
      setProviderConfig: () => Promise.resolve({ success: true, data: undefined }),
      list: () => Promise.resolve([]),
    },
    workspace: {
      create: (projectPath: string, branchName: string) =>
        Promise.resolve({
          success: true,
          metadata: {
            id: `${projectPath.split("/").pop() ?? "project"}-${branchName}`,
            name: branchName,
            projectPath,
            projectName: projectPath.split("/").pop() ?? "project",
            namedWorkspacePath: `/mock/workspace/${branchName}`,
          },
        }),
      list: () => Promise.resolve(mockWorkspaces),
      rename: (workspaceId: string) =>
        Promise.resolve({
          success: true,
          data: { newWorkspaceId: workspaceId },
        }),
      remove: () => Promise.resolve({ success: true }),
      fork: () => Promise.resolve({ success: false, error: "Not implemented in mock" }),
      openTerminal: () => Promise.resolve(undefined),
      onChat: () => () => undefined,
      onMetadata: () => () => undefined,
      sendMessage: () => Promise.resolve({ success: true, data: undefined }),
      resumeStream: () => Promise.resolve({ success: true, data: undefined }),
      interruptStream: () => Promise.resolve({ success: true, data: undefined }),
      truncateHistory: () => Promise.resolve({ success: true, data: undefined }),
      replaceChatHistory: () => Promise.resolve({ success: true, data: undefined }),
      getInfo: () => Promise.resolve(null),
      executeBash: (workspaceId: string) => {
        // Return mocked git status if available
        const gitStatus = gitStatusMap.get(workspaceId);
        if (gitStatus) {
          return Promise.resolve({
            success: true,
            data: {
              success: true,
              output: createGitStatusOutput(gitStatus.ahead, gitStatus.behind, gitStatus.dirty),
              exitCode: 0,
              wall_duration_ms: 10,
            },
          });
        }
        // Default: clean status
        return Promise.resolve({
          success: true,
          data: {
            success: true,
            output: createGitStatusOutput(0, 0, 0),
            exitCode: 0,
            wall_duration_ms: 10,
          },
        });
      },
    },
    projects: {
      list: () => Promise.resolve(Array.from(mockProjects.entries())),
      create: () => Promise.resolve({ success: true, data: { workspaces: [] } }),
      remove: () => Promise.resolve({ success: true, data: undefined }),
      listBranches: () =>
        Promise.resolve({
          branches: ["main", "develop", "feature/new-feature"],
          recommendedTrunk: "main",
        }),
      secrets: {
        get: () => Promise.resolve([]),
        update: () => Promise.resolve({ success: true, data: undefined }),
      },
    },
    window: {
      setTitle: () => Promise.resolve(undefined),
    },
    update: {
      check: () => Promise.resolve(undefined),
      download: () => Promise.resolve(undefined),
      install: () => undefined,
      onStatus: () => () => undefined,
    },
    ...options.apiOverrides,
  };

  // @ts-expect-error - Assigning mock API to window for Storybook
  window.api = mockApi;
}

const meta = {
  title: "App/Full Application",
  component: App,
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#1e1e1e" }],
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

// Story wrapper that sets up mocks synchronously before rendering
const AppWithMocks: React.FC<{
  projects?: Map<string, ProjectConfig>;
  workspaces?: FrontendWorkspaceMetadata[];
  selectedWorkspaceId?: string;
  gitStatusMap?: Map<string, { ahead: number; behind: number; dirty: number }>;
  apiOverrides?: Partial<IPCApi>;
}> = ({ projects, workspaces, selectedWorkspaceId, gitStatusMap, apiOverrides }) => {
  // Set up mock API only once per component instance (not on every render)
  // Use useRef to ensure it runs synchronously before first render
  const initialized = useRef(false);
  if (!initialized.current) {
    setupMockAPI({ projects, workspaces, selectedWorkspaceId, gitStatusMap, apiOverrides });
    initialized.current = true;
  }

  return <App />;
};

export const WelcomeScreen: Story = {
  render: () => <AppWithMocks projects={new Map()} workspaces={[]} />,
};

export const SingleProject: Story = {
  render: () => {
    const projects = new Map<string, ProjectConfig>([
      [
        "/home/user/projects/my-app",
        {
          workspaces: [
            { path: "/home/user/.cmux/src/my-app/main", id: "my-app-main", name: "main" },
            {
              path: "/home/user/.cmux/src/my-app/feature-auth",
              id: "my-app-feature-auth",
              name: "feature/auth",
            },
            {
              path: "/home/user/.cmux/src/my-app/bugfix",
              id: "my-app-bugfix",
              name: "bugfix/memory-leak",
            },
          ],
        },
      ],
    ]);

    const workspaces: FrontendWorkspaceMetadata[] = [
      {
        id: "my-app-main",
        name: "main",
        projectPath: "/home/user/projects/my-app",
        projectName: "my-app",
        namedWorkspacePath: "/home/user/.cmux/src/my-app/main",
      },
      {
        id: "my-app-feature-auth",
        name: "feature/auth",
        projectPath: "/home/user/projects/my-app",
        projectName: "my-app",
        namedWorkspacePath: "/home/user/.cmux/src/my-app/feature-auth",
      },
      {
        id: "my-app-bugfix",
        name: "bugfix/memory-leak",
        projectPath: "/home/user/projects/my-app",
        projectName: "my-app",
        namedWorkspacePath: "/home/user/.cmux/src/my-app/bugfix",
      },
    ];

    return <AppWithMocks projects={projects} workspaces={workspaces} />;
  },
};

export const MultipleProjects: Story = {
  render: () => {
    const projects = new Map<string, ProjectConfig>([
      [
        "/home/user/projects/frontend",
        {
          workspaces: [
            { path: "/home/user/.cmux/src/frontend/main", id: "frontend-main", name: "main" },
            {
              path: "/home/user/.cmux/src/frontend/redesign",
              id: "frontend-redesign",
              name: "redesign",
            },
          ],
        },
      ],
      [
        "/home/user/projects/backend",
        {
          workspaces: [
            { path: "/home/user/.cmux/src/backend/main", id: "backend-main", name: "main" },
            { path: "/home/user/.cmux/src/backend/api-v2", id: "backend-api-v2", name: "api-v2" },
            {
              path: "/home/user/.cmux/src/backend/db-migration",
              id: "backend-db-migration",
              name: "db-migration",
            },
          ],
        },
      ],
      [
        "/home/user/projects/mobile",
        {
          workspaces: [
            { path: "/home/user/.cmux/src/mobile/main", id: "mobile-main", name: "main" },
          ],
        },
      ],
    ]);

    const workspaces: FrontendWorkspaceMetadata[] = [
      {
        id: "frontend-main",
        name: "main",
        projectPath: "/home/user/projects/frontend",
        projectName: "frontend",
        namedWorkspacePath: "/home/user/.cmux/src/frontend/main",
      },
      {
        id: "frontend-redesign",
        name: "redesign",
        projectPath: "/home/user/projects/frontend",
        projectName: "frontend",
        namedWorkspacePath: "/home/user/.cmux/src/frontend/redesign",
      },
      {
        id: "backend-main",
        name: "main",
        projectPath: "/home/user/projects/backend",
        projectName: "backend",
        namedWorkspacePath: "/home/user/.cmux/src/backend/main",
      },
      {
        id: "backend-api-v2",
        name: "api-v2",
        projectPath: "/home/user/projects/backend",
        projectName: "backend",
        namedWorkspacePath: "/home/user/.cmux/src/backend/api-v2",
      },
      {
        id: "backend-db-migration",
        name: "db-migration",
        projectPath: "/home/user/projects/backend",
        projectName: "backend",
        namedWorkspacePath: "/home/user/.cmux/src/backend/db-migration",
      },
      {
        id: "mobile-main",
        name: "main",
        projectPath: "/home/user/projects/mobile",
        projectName: "mobile",
        namedWorkspacePath: "/home/user/.cmux/src/mobile/main",
      },
    ];

    return <AppWithMocks projects={projects} workspaces={workspaces} />;
  },
};

export const ManyWorkspaces: Story = {
  render: () => {
    const workspaceNames = [
      "main",
      "develop",
      "staging",
      "feature/authentication",
      "feature/dashboard",
      "feature/notifications",
      "feature/search",
      "bugfix/memory-leak",
      "bugfix/login-redirect",
      "refactor/components",
      "experiment/new-ui",
      "release/v1.2.0",
    ];

    const projects = new Map<string, ProjectConfig>([
      [
        "/home/user/projects/big-app",
        {
          workspaces: workspaceNames.map((name) => ({
            path: `/home/user/.cmux/src/big-app/${name}`,
            id: `big-app-${name}`,
            name,
          })),
        },
      ],
    ]);

    const workspaces: FrontendWorkspaceMetadata[] = workspaceNames.map((name) => ({
      id: `big-app-${name}`,
      name,
      projectPath: "/home/user/projects/big-app",
      projectName: "big-app",
      namedWorkspacePath: `/home/user/.cmux/src/big-app/${name}`,
    }));

    return <AppWithMocks projects={projects} workspaces={workspaces} />;
  },
};

export const GitStatusClean: Story = {
  render: () => {
    const projects = new Map<string, ProjectConfig>([
      [
        "/home/user/projects/web-app",
        {
          workspaces: [
            { path: "/home/user/.cmux/src/web-app/main", id: "web-app-main", name: "main" },
            {
              path: "/home/user/.cmux/src/web-app/feature",
              id: "web-app-feature",
              name: "feature/ui-update",
            },
          ],
        },
      ],
    ]);

    const workspaces: FrontendWorkspaceMetadata[] = [
      {
        id: "web-app-main",
        name: "main",
        projectPath: "/home/user/projects/web-app",
        projectName: "web-app",
        namedWorkspacePath: "/home/user/.cmux/src/web-app/main",
      },
      {
        id: "web-app-feature",
        name: "feature/ui-update",
        projectPath: "/home/user/projects/web-app",
        projectName: "web-app",
        namedWorkspacePath: "/home/user/.cmux/src/web-app/feature",
      },
    ];

    // All workspaces clean and synced
    const gitStatusMap = new Map([
      ["web-app-main", { ahead: 0, behind: 0, dirty: 0 }],
      ["web-app-feature", { ahead: 0, behind: 0, dirty: 0 }],
    ]);

    return <AppWithMocks projects={projects} workspaces={workspaces} gitStatusMap={gitStatusMap} />;
  },
};

export const GitStatusDirty: Story = {
  render: () => {
    const projects = new Map<string, ProjectConfig>([
      [
        "/home/user/projects/backend-api",
        {
          workspaces: [
            {
              path: "/home/user/.cmux/src/backend-api/main",
              id: "backend-api-main",
              name: "main",
            },
            {
              path: "/home/user/.cmux/src/backend-api/wip",
              id: "backend-api-wip",
              name: "wip/refactor",
            },
            {
              path: "/home/user/.cmux/src/backend-api/debug",
              id: "backend-api-debug",
              name: "debug/login-issue",
            },
          ],
        },
      ],
    ]);

    const workspaces: FrontendWorkspaceMetadata[] = [
      {
        id: "backend-api-main",
        name: "main",
        projectPath: "/home/user/projects/backend-api",
        projectName: "backend-api",
        namedWorkspacePath: "/home/user/.cmux/src/backend-api/main",
      },
      {
        id: "backend-api-wip",
        name: "wip/refactor",
        projectPath: "/home/user/projects/backend-api",
        projectName: "backend-api",
        namedWorkspacePath: "/home/user/.cmux/src/backend-api/wip",
      },
      {
        id: "backend-api-debug",
        name: "debug/login-issue",
        projectPath: "/home/user/projects/backend-api",
        projectName: "backend-api",
        namedWorkspacePath: "/home/user/.cmux/src/backend-api/debug",
      },
    ];

    // Workspaces with uncommitted changes
    const gitStatusMap = new Map([
      ["backend-api-main", { ahead: 0, behind: 0, dirty: 0 }], // main is clean
      ["backend-api-wip", { ahead: 0, behind: 0, dirty: 8 }], // 8 modified files
      ["backend-api-debug", { ahead: 0, behind: 0, dirty: 3 }], // 3 modified files
    ]);

    return <AppWithMocks projects={projects} workspaces={workspaces} gitStatusMap={gitStatusMap} />;
  },
};

export const GitStatusAhead: Story = {
  render: () => {
    const projects = new Map<string, ProjectConfig>([
      [
        "/home/user/projects/docs-site",
        {
          workspaces: [
            { path: "/home/user/.cmux/src/docs-site/main", id: "docs-site-main", name: "main" },
            {
              path: "/home/user/.cmux/src/docs-site/content",
              id: "docs-site-content",
              name: "update/content",
            },
            {
              path: "/home/user/.cmux/src/docs-site/images",
              id: "docs-site-images",
              name: "add/images",
            },
          ],
        },
      ],
    ]);

    const workspaces: FrontendWorkspaceMetadata[] = [
      {
        id: "docs-site-main",
        name: "main",
        projectPath: "/home/user/projects/docs-site",
        projectName: "docs-site",
        namedWorkspacePath: "/home/user/.cmux/src/docs-site/main",
      },
      {
        id: "docs-site-content",
        name: "update/content",
        projectPath: "/home/user/projects/docs-site",
        projectName: "docs-site",
        namedWorkspacePath: "/home/user/.cmux/src/docs-site/content",
      },
      {
        id: "docs-site-images",
        name: "add/images",
        projectPath: "/home/user/projects/docs-site",
        projectName: "docs-site",
        namedWorkspacePath: "/home/user/.cmux/src/docs-site/images",
      },
    ];

    // Workspaces with commits ahead of origin
    const gitStatusMap = new Map([
      ["docs-site-main", { ahead: 0, behind: 0, dirty: 0 }], // main is synced
      ["docs-site-content", { ahead: 3, behind: 0, dirty: 0 }], // 3 commits ahead
      ["docs-site-images", { ahead: 1, behind: 0, dirty: 0 }], // 1 commit ahead
    ]);

    return <AppWithMocks projects={projects} workspaces={workspaces} gitStatusMap={gitStatusMap} />;
  },
};

export const GitStatusBehind: Story = {
  render: () => {
    const projects = new Map<string, ProjectConfig>([
      [
        "/home/user/projects/mobile-app",
        {
          workspaces: [
            {
              path: "/home/user/.cmux/src/mobile-app/main",
              id: "mobile-app-main",
              name: "main",
            },
            {
              path: "/home/user/.cmux/src/mobile-app/stale",
              id: "mobile-app-stale",
              name: "feature/old-work",
            },
          ],
        },
      ],
    ]);

    const workspaces: FrontendWorkspaceMetadata[] = [
      {
        id: "mobile-app-main",
        name: "main",
        projectPath: "/home/user/projects/mobile-app",
        projectName: "mobile-app",
        namedWorkspacePath: "/home/user/.cmux/src/mobile-app/main",
      },
      {
        id: "mobile-app-stale",
        name: "feature/old-work",
        projectPath: "/home/user/projects/mobile-app",
        projectName: "mobile-app",
        namedWorkspacePath: "/home/user/.cmux/src/mobile-app/stale",
      },
    ];

    // Workspace behind origin (needs rebase/merge)
    const gitStatusMap = new Map([
      ["mobile-app-main", { ahead: 0, behind: 0, dirty: 0 }], // main is synced
      ["mobile-app-stale", { ahead: 0, behind: 12, dirty: 0 }], // 12 commits behind
    ]);

    return <AppWithMocks projects={projects} workspaces={workspaces} gitStatusMap={gitStatusMap} />;
  },
};

export const GitStatusMixed: Story = {
  render: () => {
    const projects = new Map<string, ProjectConfig>([
      [
        "/home/user/projects/monorepo",
        {
          workspaces: [
            { path: "/home/user/.cmux/src/monorepo/main", id: "monorepo-main", name: "main" },
            {
              path: "/home/user/.cmux/src/monorepo/clean",
              id: "monorepo-clean",
              name: "feature/clean-branch",
            },
            {
              path: "/home/user/.cmux/src/monorepo/dirty",
              id: "monorepo-dirty",
              name: "wip/dirty-changes",
            },
            {
              path: "/home/user/.cmux/src/monorepo/ahead",
              id: "monorepo-ahead",
              name: "ready/for-review",
            },
            {
              path: "/home/user/.cmux/src/monorepo/behind",
              id: "monorepo-behind",
              name: "old/needs-rebase",
            },
            {
              path: "/home/user/.cmux/src/monorepo/diverged",
              id: "monorepo-diverged",
              name: "conflict/diverged",
            },
            {
              path: "/home/user/.cmux/src/monorepo/dirty-ahead",
              id: "monorepo-dirty-ahead",
              name: "active/working-on-it",
            },
          ],
        },
      ],
    ]);

    const workspaces: FrontendWorkspaceMetadata[] = [
      {
        id: "monorepo-main",
        name: "main",
        projectPath: "/home/user/projects/monorepo",
        projectName: "monorepo",
        namedWorkspacePath: "/home/user/.cmux/src/monorepo/main",
      },
      {
        id: "monorepo-clean",
        name: "feature/clean-branch",
        projectPath: "/home/user/projects/monorepo",
        projectName: "monorepo",
        namedWorkspacePath: "/home/user/.cmux/src/monorepo/clean",
      },
      {
        id: "monorepo-dirty",
        name: "wip/dirty-changes",
        projectPath: "/home/user/projects/monorepo",
        projectName: "monorepo",
        namedWorkspacePath: "/home/user/.cmux/src/monorepo/dirty",
      },
      {
        id: "monorepo-ahead",
        name: "ready/for-review",
        projectPath: "/home/user/projects/monorepo",
        projectName: "monorepo",
        namedWorkspacePath: "/home/user/.cmux/src/monorepo/ahead",
      },
      {
        id: "monorepo-behind",
        name: "old/needs-rebase",
        projectPath: "/home/user/projects/monorepo",
        projectName: "monorepo",
        namedWorkspacePath: "/home/user/.cmux/src/monorepo/behind",
      },
      {
        id: "monorepo-diverged",
        name: "conflict/diverged",
        projectPath: "/home/user/projects/monorepo",
        projectName: "monorepo",
        namedWorkspacePath: "/home/user/.cmux/src/monorepo/diverged",
      },
      {
        id: "monorepo-dirty-ahead",
        name: "active/working-on-it",
        projectPath: "/home/user/projects/monorepo",
        projectName: "monorepo",
        namedWorkspacePath: "/home/user/.cmux/src/monorepo/dirty-ahead",
      },
    ];

    // Mix of all git states to showcase the full range of indicators
    const gitStatusMap = new Map([
      ["monorepo-main", { ahead: 0, behind: 0, dirty: 0 }], // Clean, synced
      ["monorepo-clean", { ahead: 0, behind: 0, dirty: 0 }], // Clean, synced
      ["monorepo-dirty", { ahead: 0, behind: 0, dirty: 5 }], // Only dirty
      ["monorepo-ahead", { ahead: 4, behind: 0, dirty: 0 }], // Only ahead
      ["monorepo-behind", { ahead: 0, behind: 7, dirty: 0 }], // Only behind
      ["monorepo-diverged", { ahead: 3, behind: 8, dirty: 0 }], // Ahead and behind (diverged)
      ["monorepo-dirty-ahead", { ahead: 2, behind: 0, dirty: 3 }], // Dirty and ahead
    ]);

    return <AppWithMocks projects={projects} workspaces={workspaces} gitStatusMap={gitStatusMap} />;
  },
};

export const ActiveWorkspaceWithChat: Story = {
  render: () => {
    const workspaceId = "demo-workspace";
    const projects = new Map<string, ProjectConfig>([
      [
        "/home/user/projects/my-app",
        {
          workspaces: [
            { path: "/home/user/.cmux/src/my-app/feature", id: workspaceId, name: "feature/auth" },
          ],
        },
      ],
    ]);

    const workspaces: FrontendWorkspaceMetadata[] = [
      {
        id: workspaceId,
        name: "feature/auth",
        projectPath: "/home/user/projects/my-app",
        projectName: "my-app",
        namedWorkspacePath: "/home/user/.cmux/src/my-app/feature",
      },
    ];

    const AppWithChatMocks: React.FC = () => {
      // Set up mock API only once per component instance (not on every render)
      const initialized = useRef(false);
      if (!initialized.current) {
        setupMockAPI({
          projects,
          workspaces,
          apiOverrides: {
            providers: {
              setProviderConfig: () => Promise.resolve({ success: true, data: undefined }),
              list: () => Promise.resolve(["anthropic", "openai"]),
            },
            workspace: {
              create: (projectPath: string, branchName: string) =>
                Promise.resolve({
                  success: true,
                  metadata: {
                    id: `${projectPath.split("/").pop() ?? "project"}-${branchName}`,
                    name: branchName,
                    projectPath,
                    projectName: projectPath.split("/").pop() ?? "project",
                    namedWorkspacePath: `/mock/workspace/${branchName}`,
                  },
                }),
              list: () => Promise.resolve(workspaces),
              rename: (workspaceId: string) =>
                Promise.resolve({
                  success: true,
                  data: { newWorkspaceId: workspaceId },
                }),
              remove: () => Promise.resolve({ success: true }),
              fork: () => Promise.resolve({ success: false, error: "Not implemented in mock" }),
              openTerminal: () => Promise.resolve(undefined),
              onChat: (workspaceId, callback) => {
                // Send chat history immediately when subscribed
                setTimeout(() => {
                  // User message
                  callback({
                    id: "msg-1",
                    role: "user",
                    parts: [{ type: "text", text: "Add authentication to the user API endpoint" }],
                    metadata: {
                      historySequence: 1,
                      timestamp: Date.now() - 300000,
                    },
                  });

                  // Assistant message with tool calls
                  callback({
                    id: "msg-2",
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "I'll help you add authentication to the user API endpoint. Let me first check the current implementation.",
                      },
                      {
                        type: "dynamic-tool",
                        toolCallId: "call-1",
                        toolName: "read_file",
                        state: "output-available",
                        input: { target_file: "src/api/users.ts" },
                        output: {
                          success: true,
                          content:
                            "export function getUser(req, res) {\n  const user = db.users.find(req.params.id);\n  res.json(user);\n}",
                        },
                      },
                    ],
                    metadata: {
                      historySequence: 2,
                      timestamp: Date.now() - 290000,
                      model: "claude-sonnet-4-20250514",
                      usage: {
                        inputTokens: 1250,
                        outputTokens: 450,
                        totalTokens: 1700,
                      },
                      duration: 3500,
                    },
                  });

                  // User response
                  callback({
                    id: "msg-3",
                    role: "user",
                    parts: [{ type: "text", text: "Yes, add JWT token validation" }],
                    metadata: {
                      historySequence: 3,
                      timestamp: Date.now() - 280000,
                    },
                  });

                  // Assistant message with file edit
                  callback({
                    id: "msg-4",
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "I'll add JWT token validation to the endpoint. Let me update the file.",
                      },
                      {
                        type: "dynamic-tool",
                        toolCallId: "call-2",
                        toolName: "search_replace",
                        state: "output-available",
                        input: {
                          file_path: "src/api/users.ts",
                          old_string: "export function getUser(req, res) {",
                          new_string:
                            "import { verifyToken } from '../auth/jwt';\n\nexport function getUser(req, res) {\n  const token = req.headers.authorization?.split(' ')[1];\n  if (!token || !verifyToken(token)) {\n    return res.status(401).json({ error: 'Unauthorized' });\n  }",
                        },
                        output: {
                          success: true,
                          message: "File updated successfully",
                        },
                      },
                    ],
                    metadata: {
                      historySequence: 4,
                      timestamp: Date.now() - 270000,
                      model: "claude-sonnet-4-20250514",
                      usage: {
                        inputTokens: 2100,
                        outputTokens: 680,
                        totalTokens: 2780,
                      },
                      duration: 4200,
                    },
                  });

                  // User asking to run tests
                  callback({
                    id: "msg-5",
                    role: "user",
                    parts: [{ type: "text", text: "Can you run the tests to make sure it works?" }],
                    metadata: {
                      historySequence: 5,
                      timestamp: Date.now() - 240000,
                    },
                  });

                  // Assistant running tests
                  callback({
                    id: "msg-6",
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "I'll run the tests to verify the authentication is working correctly.",
                      },
                      {
                        type: "dynamic-tool",
                        toolCallId: "call-3",
                        toolName: "run_terminal_cmd",
                        state: "output-available",
                        input: {
                          command: "npm test src/api/users.test.ts",
                          explanation: "Running tests for the users API endpoint",
                        },
                        output: {
                          success: true,
                          stdout:
                            "PASS src/api/users.test.ts\n  ✓ should return user when authenticated (24ms)\n  ✓ should return 401 when no token (18ms)\n  ✓ should return 401 when invalid token (15ms)\n\nTest Suites: 1 passed, 1 total\nTests:       3 passed, 3 total",
                          exitCode: 0,
                        },
                      },
                    ],
                    metadata: {
                      historySequence: 6,
                      timestamp: Date.now() - 230000,
                      model: "claude-sonnet-4-20250514",
                      usage: {
                        inputTokens: 2800,
                        outputTokens: 420,
                        totalTokens: 3220,
                      },
                      duration: 5100,
                    },
                  });

                  // User follow-up about error handling
                  callback({
                    id: "msg-7",
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: "Great! What about error handling if the JWT library throws?",
                      },
                    ],
                    metadata: {
                      historySequence: 7,
                      timestamp: Date.now() - 180000,
                    },
                  });

                  // Assistant response with thinking (reasoning)
                  callback({
                    id: "msg-8",
                    role: "assistant",
                    parts: [
                      {
                        type: "reasoning",
                        text: "The user is asking about error handling for JWT verification. The verifyToken function could throw if the token is malformed or if there's an issue with the secret. I should wrap it in a try-catch block and return a proper error response.",
                      },
                      {
                        type: "text",
                        text: "Good catch! We should add try-catch error handling around the JWT verification. Let me update that.",
                      },
                      {
                        type: "dynamic-tool",
                        toolCallId: "call-4",
                        toolName: "search_replace",
                        state: "output-available",
                        input: {
                          file_path: "src/api/users.ts",
                          old_string:
                            "  const token = req.headers.authorization?.split(' ')[1];\n  if (!token || !verifyToken(token)) {\n    return res.status(401).json({ error: 'Unauthorized' });\n  }",
                          new_string:
                            "  try {\n    const token = req.headers.authorization?.split(' ')[1];\n    if (!token || !verifyToken(token)) {\n      return res.status(401).json({ error: 'Unauthorized' });\n    }\n  } catch (err) {\n    console.error('Token verification failed:', err);\n    return res.status(401).json({ error: 'Invalid token' });\n  }",
                        },
                        output: {
                          success: true,
                          message: "File updated successfully",
                        },
                      },
                    ],
                    metadata: {
                      historySequence: 8,
                      timestamp: Date.now() - 170000,
                      model: "claude-sonnet-4-20250514",
                      usage: {
                        inputTokens: 3500,
                        outputTokens: 520,
                        totalTokens: 4020,
                        reasoningTokens: 150,
                      },
                      duration: 6200,
                    },
                  });

                  // Mark as caught up
                  callback({ type: "caught-up" });
                }, 100);

                return () => {
                  // Cleanup
                };
              },
              onMetadata: () => () => undefined,
              sendMessage: () => Promise.resolve({ success: true, data: undefined }),
              resumeStream: () => Promise.resolve({ success: true, data: undefined }),
              interruptStream: () => Promise.resolve({ success: true, data: undefined }),
              truncateHistory: () => Promise.resolve({ success: true, data: undefined }),
              replaceChatHistory: () => Promise.resolve({ success: true, data: undefined }),
              getInfo: () => Promise.resolve(null),
              executeBash: () =>
                Promise.resolve({
                  success: true,
                  data: { success: true, output: "", exitCode: 0, wall_duration_ms: 0 },
                }),
            },
          },
        });

        // Set initial workspace selection
        localStorage.setItem(
          "selectedWorkspace",
          JSON.stringify({
            workspaceId: workspaceId,
            projectPath: "/home/user/projects/my-app",
            projectName: "my-app",
            namedWorkspacePath: "/home/user/.cmux/src/my-app/feature",
          })
        );

        initialized.current = true;
      }

      return <App />;
    };

    return <AppWithChatMocks />;
  },
};
