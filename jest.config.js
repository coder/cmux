module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/tests/**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/preload.ts",
    "!src/main.ts", // Exclude main Electron file from coverage
  ],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2020",
          lib: ["ES2020", "DOM"],
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  // Transform ESM modules (like shiki) to CommonJS for Jest
  transformIgnorePatterns: ["node_modules/(?!(shiki)/)"],
  // Run tests in parallel (use 50% of available cores, or 4 minimum)
  maxWorkers: "50%",
  // Force exit after tests complete to avoid hanging on lingering handles
  forceExit: true,
  // Detect open handles in development (disabled by default for speed)
  // detectOpenHandles: true,
};
