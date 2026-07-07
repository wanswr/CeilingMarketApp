import type { Config } from 'jest';

const config: Config = {
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: "coverage",
  testMatch: [
    "**/__tests__/**/*.[jt]s?(x)", // Ищет тесты в папке __tests__
    "**/?(*.)+(spec|test).[tj]s?(x)" // Ищет файлы с суффиксами .test.js или .spec.js
  ],
  testPathIgnorePatterns: [
    "\\\\node_modules\\\\"
  ]
};

export default config;
