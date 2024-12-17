import type { Linter } from 'eslint';

// ESLint configuration for DocShield AI Voice Agent Worker
// @typescript-eslint/eslint-plugin ^5.59.0
// @typescript-eslint/parser ^5.59.0
// eslint ^8.38.0
// eslint-config-prettier ^8.8.0
// eslint-plugin-import ^2.27.5
// eslint-plugin-jest ^27.2.1

const config: Linter.Config = {
  root: true,
  
  // Use TypeScript parser
  parser: '@typescript-eslint/parser',
  
  // Parser options for TypeScript integration
  parserOptions: {
    project: './tsconfig.json',
    ecmaVersion: 2020,
    sourceType: 'module',
    tsconfigRootDir: '.',
  },
  
  // Enable required plugins
  plugins: [
    '@typescript-eslint',
    'import',
    'jest'
  ],
  
  // Extend recommended configurations
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'plugin:jest/recommended',
    'prettier'
  ],
  
  // Environment configuration
  env: {
    node: true,
    jest: true,
    es2020: true
  },
  
  // Custom rule configurations
  rules: {
    // TypeScript-specific rules
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_'
    }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    
    // Import/export rules
    'import/order': ['error', {
      groups: [
        'builtin',
        'external',
        'internal',
        'parent',
        'sibling',
        'index'
      ],
      'newlines-between': 'always',
      alphabetize: {
        order: 'asc'
      }
    }],
    
    // General rules
    'no-console': ['error', {
      allow: ['warn', 'error']
    }],
    
    // Jest-specific rules
    'jest/expect-expect': 'error',
    'jest/no-disabled-tests': 'warn',
    'jest/no-focused-tests': 'error',
    'jest/no-identical-title': 'error',
    'jest/valid-expect': 'error',
    'jest/no-conditional-expect': 'error'
  },
  
  // Settings for import resolution
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json'
      }
    }
  },
  
  // Ignore patterns for build artifacts and dependencies
  ignorePatterns: [
    'dist',
    'coverage',
    'node_modules',
    '*.js',
    '*.d.ts'
  ]
};

export default config;