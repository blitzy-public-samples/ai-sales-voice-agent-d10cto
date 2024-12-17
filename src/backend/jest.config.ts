import type { Config } from '@jest/types';

// Jest configuration for DocShield AI Voice Agent worker service
const config: Config.InitialOptions = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',

  // Set Node.js as the test environment
  testEnvironment: 'node',

  // Configure source and test roots
  roots: [
    '<rootDir>/src',
    '<rootDir>/tests'
  ],

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx)',
    '**/?(*.)+(spec|test).+(ts|tsx)'
  ],

  // TypeScript transformation
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },

  // Module path aliases
  moduleNameMapper: {
    '@/(.*)': '<rootDir>/src/$1'
  },

  // Test setup file
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup.ts'
  ],

  // Coverage configuration
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'json-summary'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/types/**',
    '!src/**/index.ts',
    '!src/**/*.d.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Test execution settings
  testTimeout: 10000,
  maxWorkers: '50%',
  
  // Mock behavior
  clearMocks: true,
  restoreMocks: true,
  
  // Verbose output for detailed test results
  verbose: true,

  // File extensions to consider
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json'
  ]
};

export default config;