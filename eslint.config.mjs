import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tailwindcss from "eslint-plugin-tailwindcss";
import tseslint from "typescript-eslint";

/**
 * Custom ESLint plugin for safe Node.js patterns
 * Enforces safe child_process and filesystem patterns
 */
const localPlugin = {
  rules: {
    "no-unsafe-child-process": {
      meta: {
        type: "problem",
        docs: {
          description: "Prevent unsafe child_process usage that can cause zombie processes",
        },
        messages: {
          unsafePromisifyExec:
            "Do not use promisify(exec) directly. Use DisposableExec wrapper with 'using' declaration to prevent zombie processes.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            // Ban promisify(exec)
            if (
              node.callee.type === "Identifier" &&
              node.callee.name === "promisify" &&
              node.arguments.length > 0 &&
              node.arguments[0].type === "Identifier" &&
              node.arguments[0].name === "exec"
            ) {
              context.report({
                node,
                messageId: "unsafePromisifyExec",
              });
            }
          },
        };
      },
    },
    "no-sync-fs-methods": {
      meta: {
        type: "problem",
        docs: {
          description: "Prevent synchronous filesystem operations",
        },
        messages: {
          syncFsMethod:
            "Do not use synchronous fs methods ({{method}}). Use async version instead: {{asyncMethod}}",
        },
      },
      create(context) {
        // Map of sync methods to their async equivalents
        const syncMethods = {
          statSync: "stat",
          readFileSync: "readFile",
          writeFileSync: "writeFile",
          readdirSync: "readdir",
          mkdirSync: "mkdir",
          unlinkSync: "unlink",
          rmdirSync: "rmdir",
          existsSync: "access or stat",
          accessSync: "access",
          copyFileSync: "copyFile",
          renameSync: "rename",
          chmodSync: "chmod",
          chownSync: "chown",
          lstatSync: "lstat",
          linkSync: "link",
          symlinkSync: "symlink",
          readlinkSync: "readlink",
          realpathSync: "realpath",
          truncateSync: "truncate",
          fstatSync: "fstat",
          appendFileSync: "appendFile",
        };

        return {
          MemberExpression(node) {
            // Only flag if it's a property access on 'fs' or imported fs methods
            if (
              node.property &&
              node.property.type === "Identifier" &&
              syncMethods[node.property.name] &&
              node.object &&
              node.object.type === "Identifier" &&
              (node.object.name === "fs" || node.object.name === "fsPromises")
            ) {
              context.report({
                node,
                messageId: "syncFsMethod",
                data: {
                  method: node.property.name,
                  asyncMethod: syncMethods[node.property.name],
                },
              });
            }
          },
        };
      },
    },
  },
};

export default defineConfig([
  {
    ignores: [
      "dist/",
      "build/",
      "node_modules/",
      "*.js",
      "*.cjs",
      "*.mjs",
      "!eslint.config.mjs",
      "vite.config.ts",
      "electron.vite.config.ts",
      "src/main.tsx",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.main.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        exports: "writable",
        module: "writable",
        require: "readonly",
        global: "readonly",
        window: "readonly",
        document: "readonly",
        requestAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        navigator: "readonly",
        alert: "readonly",
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      tailwindcss,
      local: localPlugin,
    },
    settings: {
      react: {
        version: "detect",
      },
      tailwindcss: {
        // Don't try to load Tailwind config (v4 doesn't export resolveConfig)
        config: false,
        // CSS files to check
        cssFiles: ["**/*.css", "!**/node_modules", "!**/.*", "!**/dist", "!**/build"],
        // Disable callees check to avoid resolving config
        callees: [],
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      // Use recommended-latest to get React Compiler lint rules
      ...reactHooks.configs["recommended-latest"].rules,

      // Flag unused variables, parameters, and imports
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "after-used",
          ignoreRestSiblings: true,
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
        },
      ],

      // Prohibit 'as any' type assertions
      "@typescript-eslint/no-explicit-any": "error",

      // Additional rule to catch 'as any' specifically
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "as",
          objectLiteralTypeAssertions: "allow-as-parameter",
        },
      ],

      // Enforce shorthand array notation, e.g. Foo[] instead of Array<Foo>
      "@typescript-eslint/array-type": [
        "error",
        {
          default: "array-simple",
          readonly: "array-simple",
        },
      ],

      // Keep type-only imports explicit to avoid runtime inclusion
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          disallowTypeAnnotations: true,
        },
      ],

      // Require handling Promises instead of letting them float
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          ignoreVoid: true,
          ignoreIIFE: true,
        },
      ],

      // Highlight unnecessary assertions to keep code idiomatic
      "@typescript-eslint/no-unnecessary-type-assertion": "error",

      // Encourage readonly where possible to surface unintended mutations
      "@typescript-eslint/prefer-readonly": [
        "error",
        {
          onlyInlineLambdas: true,
        },
      ],

      // Prevent using any type at all
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",

      // React specific
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",

      // Tailwind CSS
      "tailwindcss/classnames-order": "warn",
      "tailwindcss/enforces-negative-arbitrary-values": "warn",
      "tailwindcss/enforces-shorthand": "warn",
      "tailwindcss/migration-from-tailwind-2": "warn",
      "tailwindcss/no-arbitrary-value": "off",
      "tailwindcss/no-contradicting-classname": "error",
      "tailwindcss/no-custom-classname": "off",

      // Safe Node.js patterns
      "local/no-unsafe-child-process": "error",
      "local/no-sync-fs-methods": "error",

      // Allow console for this app (it's a dev tool)
      "no-console": "off",

      // Allow require in specific contexts
      "@typescript-eslint/no-var-requires": "off",

      // Enforce absolute imports with @/ alias for cross-directory imports
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../!(tests)*", "../../!(tests)*"],
              message:
                "Use absolute imports with @/ instead of relative parent imports. Same-directory imports (./foo) are allowed.",
            },
          ],
        },
      ],

      // Warn on TODO comments
      "no-warning-comments": [
        "off",
        {
          terms: ["TODO", "FIXME", "XXX", "HACK"],
          location: "start",
        },
      ],

      // Enable TypeScript deprecation warnings
      "@typescript-eslint/prefer-ts-expect-error": "error",

      // Ban @ts-ignore comments and suggest @ts-expect-error instead
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
          minimumDescriptionLength: 3,
        },
      ],

      // Ban dynamic imports - they hide circular dependencies and should be avoided
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression",
          message:
            "Dynamic imports are not allowed. Use static imports at the top of the file instead. Dynamic imports hide circular dependencies and improper module structure.",
        },
      ],

      // Prevent accidentally interpolating undefined/null in template literals and JSX
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowBoolean: true,
          allowAny: false,
          allowNullish: false, // Catch undefined/null interpolations
          allowRegExp: false,
        },
      ],
    },
  },
  {
    // Allow dynamic imports for lazy-loading AI SDK packages (startup optimization)
    files: [
      "src/services/aiService.ts",
      "src/utils/tools/tools.ts",
      "src/utils/ai/providerFactory.ts",
      "src/utils/main/tokenizer.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  {
    // Temporarily allow sync fs methods in files with existing usage
    // TODO: Gradually migrate these to async operations
    files: [
      "src/config.ts",
      "src/debug/**/*.ts",
      "src/git.ts",
      "src/main-desktop.ts",
      "src/config.test.ts",
      "src/services/gitService.ts",
      "src/services/log.ts",
      "src/services/streamManager.ts",
      "src/services/tempDir.ts",
      "src/services/tools/bash.ts",
      "src/services/tools/bash.test.ts",
      "src/services/tools/testHelpers.ts",
    ],
    rules: {
      "local/no-sync-fs-methods": "off",
    },
  },
  {
    // Frontend architectural boundary - prevent services and tokenizer imports
    files: ["src/components/**", "src/contexts/**", "src/hooks/**", "src/App.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/services/**", "../services/**", "../../services/**"],
              message:
                "Frontend code cannot import from services/. Use IPC or move shared code to utils/.",
            },
            {
              group: ["**/tokens/tokenizer", "**/tokens/tokenStatsCalculator"],
              message:
                "Frontend code cannot import tokenizer (2MB+ encodings). Use @/utils/tokens/usageAggregator for aggregation or @/utils/tokens/modelStats for pricing.",
            },
            {
              group: ["**/utils/main/**", "@/utils/main/**"],
              message:
                "Frontend code cannot import from utils/main/ (contains Node.js APIs). Move shared code to utils/ or use IPC.",
            },
            {
              group: ["node:*"],
              message:
                "Frontend code cannot import Node.js built-in modules (node:* imports). These modules are only available in the main process. Use window.api IPC calls to access Node.js functionality.",
            },
          ],
          paths: [
            {
              name: "assert",
              message:
                "Frontend code cannot import Node.js 'assert' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "assert/strict",
              message:
                "Frontend code cannot import Node.js 'assert/strict' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "buffer",
              message:
                "Frontend code cannot import Node.js 'buffer' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "child_process",
              message:
                "Frontend code cannot import Node.js 'child_process' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "cluster",
              message:
                "Frontend code cannot import Node.js 'cluster' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "crypto",
              message:
                "Frontend code cannot import Node.js 'crypto' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "dgram",
              message:
                "Frontend code cannot import Node.js 'dgram' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "dns",
              message:
                "Frontend code cannot import Node.js 'dns' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "domain",
              message:
                "Frontend code cannot import Node.js 'domain' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "events",
              message:
                "Frontend code cannot import Node.js 'events' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "fs",
              message:
                "Frontend code cannot import Node.js 'fs' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "fs/promises",
              message:
                "Frontend code cannot import Node.js 'fs/promises' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "http",
              message:
                "Frontend code cannot import Node.js 'http' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "http2",
              message:
                "Frontend code cannot import Node.js 'http2' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "https",
              message:
                "Frontend code cannot import Node.js 'https' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "inspector",
              message:
                "Frontend code cannot import Node.js 'inspector' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "module",
              message:
                "Frontend code cannot import Node.js 'module' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "net",
              message:
                "Frontend code cannot import Node.js 'net' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "os",
              message:
                "Frontend code cannot import Node.js 'os' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "path",
              message:
                "Frontend code cannot import Node.js 'path' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "perf_hooks",
              message:
                "Frontend code cannot import Node.js 'perf_hooks' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "process",
              message:
                "Frontend code cannot import Node.js 'process' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "punycode",
              message:
                "Frontend code cannot import Node.js 'punycode' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "querystring",
              message:
                "Frontend code cannot import Node.js 'querystring' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "readline",
              message:
                "Frontend code cannot import Node.js 'readline' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "repl",
              message:
                "Frontend code cannot import Node.js 'repl' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "stream",
              message:
                "Frontend code cannot import Node.js 'stream' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "string_decoder",
              message:
                "Frontend code cannot import Node.js 'string_decoder' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "sys",
              message:
                "Frontend code cannot import Node.js 'sys' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "timers",
              message:
                "Frontend code cannot import Node.js 'timers' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "tls",
              message:
                "Frontend code cannot import Node.js 'tls' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "trace_events",
              message:
                "Frontend code cannot import Node.js 'trace_events' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "tty",
              message:
                "Frontend code cannot import Node.js 'tty' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "url",
              message:
                "Frontend code cannot import Node.js 'url' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "util",
              message:
                "Frontend code cannot import Node.js 'util' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "v8",
              message:
                "Frontend code cannot import Node.js 'v8' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "vm",
              message:
                "Frontend code cannot import Node.js 'vm' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "worker_threads",
              message:
                "Frontend code cannot import Node.js 'worker_threads' module. Use window.api IPC calls to access Node.js functionality.",
            },
            {
              name: "zlib",
              message:
                "Frontend code cannot import Node.js 'zlib' module. Use window.api IPC calls to access Node.js functionality.",
            },
          ],
        },
      ],
    },
  },
  {
    // Test file configuration
    files: ["**/*.test.ts", "**/*.test.tsx"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        jest: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
  },
]);
