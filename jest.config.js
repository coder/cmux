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
  // setupFilesAfterEnv: ["<rootDir>/test/setup.ts"], // Uncomment when setup.ts exists
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  // Run tests in parallel with 4 workers
  maxWorkers: 4,
};
