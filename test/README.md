# LLMLog Chrome Extension - Testing Documentation

This directory contains comprehensive unit tests for the LLMLog Chrome extension, implementing Jest-based testing with Chrome API mocking and browser environment simulation.

## 📁 Test Structure

```
test/
├── setup.js                 # Jest setup with Chrome API mocks
├── run-tests.js             # Test runner script with reporting
├── README.md                # This documentation
├── modules/                 # Core module tests
│   ├── logger.test.js       # Logger functionality tests
│   ├── settings.test.js     # Settings management tests
│   ├── capture.test.js      # Platform configuration tests
│   ├── storage.test.js      # IndexedDB storage tests
│   ├── router.test.js       # Message routing tests
│   ├── log-storage.test.js  # Session logging tests
│   └── csp-reporter.test.js # Security violation tests
└── platforms/               # Platform-specific tests
    ├── chatgpt.test.js      # ChatGPT parser tests
    ├── claude.test.js       # Claude parser tests
    └── gemini.test.js       # Gemini parser tests
```

## 🚀 Quick Start

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Specific Test Suites
```bash
# Unit tests only
node test/run-tests.js unit

# Platform tests only
node test/run-tests.js platform

# Verbose output
node test/run-tests.js verbose
```

## 🧪 Test Categories

### Core Module Tests (`test/modules/`)

#### Logger Tests (`logger.test.js`)
- ✅ Debug mode enabled/disabled functionality
- ✅ Multiple argument handling
- ✅ Console method mocking
- ✅ Edge cases (undefined, null, falsy values)

#### Settings Tests (`settings.test.js`)
- ✅ Chrome storage integration
- ✅ Default value handling
- ✅ Data type preservation
- ✅ Error handling for storage failures
- ✅ Integration scenarios

#### Storage Tests (`storage.test.js`)
- ✅ IndexedDB operations with fake-indexeddb
- ✅ Conversation CRUD operations
- ✅ Duplicate detection algorithms
- ✅ Pagination and search functionality
- ✅ Platform-specific duplicate windows
- ✅ Error handling and edge cases

#### Router Tests (`router.test.js`)
- ✅ Message routing to correct handlers
- ✅ Response format standardization
- ✅ Error handling and malformed messages
- ✅ Async operation management
- ✅ Sender information processing

#### Capture Tests (`capture.test.js`)
- ✅ Platform configuration retrieval
- ✅ Module path validation
- ✅ Unsupported platform handling
- ✅ Input validation and edge cases

#### CSP Reporter Tests (`csp-reporter.test.js`)
- ✅ Violation storage and retrieval
- ✅ Statistics generation
- ✅ Configuration checking
- ✅ Large dataset handling

### Platform-Specific Tests (`test/platforms/`)

#### ChatGPT Tests (`chatgpt.test.js`)
- ✅ SSE stream parsing
- ✅ Multiple response formats (append, patch, simple)
- ✅ Request body extraction
- ✅ Conversation ID handling
- ✅ Error handling for malformed data

#### Claude Tests (`claude.test.js`)
- ✅ JSON response parsing
- ✅ Message threading (human/assistant)
- ✅ Duplicate detection with time windows
- ✅ Content part concatenation
- ✅ Window.postMessage integration

#### Gemini Tests (`gemini.test.js`)
- ✅ Form data parsing (f.req parameter)
- ✅ Nested JSON structure handling
- ✅ Streaming response parsing
- ✅ Multi-chunk response assembly
- ✅ Error handling for malformed data

## 🔧 Configuration

### Jest Configuration (`jest.config.js`)
- **Environment**: jsdom for browser simulation
- **Setup**: Automatic Chrome API mocking
- **Transform**: Babel for ES6 module support
- **Coverage**: 70%+ branches, 80%+ functions/lines/statements
- **Timeout**: 10 seconds for async operations

### Babel Configuration (`babel.config.js`)
- **Preset**: @babel/preset-env for Node.js current
- **Modules**: CommonJS transformation for Jest compatibility

### Test Setup (`setup.js`)
- **Chrome APIs**: Complete mocking of storage, runtime, alarms, tabs, scripting
- **IndexedDB**: fake-indexeddb for database simulation
- **DOM APIs**: Basic DOM method mocking
- **Helper Functions**: Test utilities and mock data generators

## 🎯 Coverage Targets

| Component | Target Coverage | Current Status |
|-----------|----------------|----------------|
| Core Modules | 80%+ | ✅ Implemented |
| Platform Parsers | 70%+ | ✅ Implemented |
| Error Handling | 90%+ | ✅ Implemented |
| Edge Cases | 85%+ | ✅ Implemented |

## 🔍 Testing Strategies

### Chrome Extension Specific
- **API Mocking**: Comprehensive Chrome API simulation
- **Async Handling**: Promise-based testing for storage operations
- **Message Passing**: Mock message routing and response handling
- **Content Scripts**: DOM manipulation and injection testing

### Data Integrity
- **Duplicate Detection**: Multi-layered duplicate prevention testing
- **Data Persistence**: IndexedDB transaction and error handling
- **Search Functionality**: Pagination and filtering validation
- **Platform Compatibility**: Cross-platform parser validation

### Error Scenarios
- **Network Failures**: Mock network errors and timeouts
- **Storage Errors**: Quota exceeded and access denied scenarios
- **Malformed Data**: Invalid JSON and unexpected data structures
- **API Changes**: Platform API response format variations

## 🐛 Debugging Tests

### Verbose Output
```bash
npm run test:verbose
```

### Debug Specific Test
```bash
npm test -- --testNamePattern="should save conversation"
```

### Debug with Node Inspector
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Common Issues

1. **Import Errors**: Ensure Babel is configured for ES6 modules
2. **Chrome API Errors**: Check mock setup in `test/setup.js`
3. **IndexedDB Errors**: Verify fake-indexeddb is properly initialized
4. **Async Timeouts**: Increase timeout in Jest config if needed

## 📊 Test Reports

### Coverage Report
- **HTML**: `coverage/lcov-report/index.html`
- **LCOV**: `coverage/lcov.info`
- **Text**: Console output with `npm run test:coverage`

### Test Results
- **Console**: Real-time test execution results
- **JUnit**: XML format for CI/CD integration
- **JSON**: Machine-readable test results

## 🔄 Continuous Integration

### GitHub Actions Example
```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

### Pre-commit Hooks
```bash
# Install husky for git hooks
npm install --save-dev husky
npx husky install
npx husky add .husky/pre-commit "npm test"
```

## 📝 Writing New Tests

### Test File Template
```javascript
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { functionToTest } from '../../path/to/module.js';

describe('Module Name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.testHelpers.resetChromeMocks();
  });

  describe('Function Name', () => {
    test('should handle normal case', async () => {
      // Arrange
      const input = 'test input';
      
      // Act
      const result = await functionToTest(input);
      
      // Assert
      expect(result).toBe('expected output');
    });
  });
});
```

### Best Practices
1. **Arrange-Act-Assert**: Structure tests clearly
2. **Mock External Dependencies**: Use Jest mocks for Chrome APIs
3. **Test Edge Cases**: Include error scenarios and boundary conditions
4. **Descriptive Names**: Use clear, descriptive test names
5. **Independent Tests**: Ensure tests don't depend on each other
6. **Async Handling**: Properly handle promises and async operations

## 🤝 Contributing

1. **Add Tests**: New features require corresponding tests
2. **Maintain Coverage**: Keep coverage above target thresholds
3. **Update Documentation**: Update this README for new test patterns
4. **Run Tests**: Ensure all tests pass before submitting PRs
5. **Review Guidelines**: Follow existing test patterns and conventions
