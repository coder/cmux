import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  {
    ignores: ["src/main.tsx"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
        project: "./tsconfig.json",
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
      "@typescript-eslint": typescript,
      react: react,
      "react-hooks": reactHooks,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

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

      // Prevent using any type at all
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",

      // React specific
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",

      // Allow console for this app (it's a dev tool)
      "no-console": "off",

      // Allow require in specific contexts
      "@typescript-eslint/no-var-requires": "off",

      // Warn on TODO comments
      "no-warning-comments": [
        "warn",
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
    },
  },
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
    ],
  },
];
