/**
 * Jest Configuration for LLMLog Chrome Extension
 * 
 * This configuration sets up Jest for testing Chrome extension modules
 * with proper mocking of Chrome APIs and browser environment simulation.
 */

module.exports = {
  // Test environment setup
  testEnvironment: 'jsdom',
  
  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json'],
  
  // Transform configuration for ES6 modules
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  
  // Module name mapping for easier imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
    '^@scripts/(.*)$': '<rootDir>/scripts/$1',
  },
  
  // Test file patterns
  testMatch: [
    '<rootDir>/test/**/*.test.js',
    '<rootDir>/test/**/*.spec.js'
  ],
  
  // Files to ignore during testing
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/lib/'
  ],
  
  // Coverage configuration
  collectCoverage: false, // Enable with --coverage flag
  collectCoverageFrom: [
    'modules/**/*.js',
    'scripts/capture/**/*.js',
    '!scripts/capture/platforms/*.js', // Platform scripts tested separately
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/lib/**'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Verbose output for debugging
  verbose: false,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: false,
  
  // Global timeout for tests
  testTimeout: 10000,
  
  // Module directories
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Globals available in tests
  globals: {
    'indexedDB': {},
    'window': {}
  }
};
