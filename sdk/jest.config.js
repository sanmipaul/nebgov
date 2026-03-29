/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/__tests__/**",
    "!src/types/**",
    "!src/index.ts",
    "!src/events.ts",
  ],
  coverageThreshold: {
    global: {
      lines: 65,
      branches: 55,
      functions: 60,
      statements: 65,
    },
  },
};
