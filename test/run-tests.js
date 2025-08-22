#!/usr/bin/env node

/**
 * Test Runner Script for LLMLog Chrome Extension
 * 
 * This script provides a convenient way to run tests with different configurations
 * and generate reports.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description) {
  log(`\n${description}`, 'cyan');
  log(`Running: ${command}`, 'blue');
  
  try {
    const output = execSync(command, { 
      stdio: 'inherit', 
      cwd: path.resolve(__dirname, '..') 
    });
    log(`✅ ${description} completed successfully`, 'green');
    return true;
  } catch (error) {
    log(`❌ ${description} failed`, 'red');
    log(`Error: ${error.message}`, 'red');
    return false;
  }
}

function checkDependencies() {
  log('\n🔍 Checking dependencies...', 'yellow');
  
  const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    log('❌ package.json not found', 'red');
    return false;
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const requiredDeps = [
    'jest',
    'jest-environment-jsdom',
    'fake-indexeddb',
    '@babel/core',
    '@babel/preset-env',
    'babel-jest'
  ];
  
  const missingDeps = requiredDeps.filter(dep => 
    !packageJson.devDependencies || !packageJson.devDependencies[dep]
  );
  
  if (missingDeps.length > 0) {
    log(`❌ Missing dependencies: ${missingDeps.join(', ')}`, 'red');
    log('Run: npm install', 'yellow');
    return false;
  }
  
  log('✅ All required dependencies are present', 'green');
  return true;
}

function generateTestReport() {
  log('\n📊 Generating test report...', 'cyan');
  
  const reportPath = path.resolve(__dirname, '..', 'test-report.html');
  if (fs.existsSync(reportPath)) {
    log(`📄 Test report generated: ${reportPath}`, 'green');
    log('Open this file in a browser to view detailed results', 'blue');
  } else {
    log('⚠️  Test report not found', 'yellow');
  }
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';
  
  log('🧪 LLMLog Test Runner', 'bright');
  log('='.repeat(50), 'blue');
  
  // Check dependencies first
  if (!checkDependencies()) {
    process.exit(1);
  }
  
  let success = true;
  
  switch (command) {
    case 'unit':
      success = runCommand('npm test -- --testPathPattern="test/modules"', 'Running unit tests');
      break;
      
    case 'platform':
      success = runCommand('npm test -- --testPathPattern="test/platforms"', 'Running platform tests');
      break;
      
    case 'coverage':
      success = runCommand('npm run test:coverage', 'Running tests with coverage');
      generateTestReport();
      break;
      
    case 'watch':
      log('\n👀 Starting test watcher...', 'cyan');
      runCommand('npm run test:watch', 'Running tests in watch mode');
      break;
      
    case 'verbose':
      success = runCommand('npm run test:verbose', 'Running tests in verbose mode');
      break;
      
    case 'all':
    default:
      success = runCommand('npm test', 'Running all tests');
      break;
  }
  
  log('\n' + '='.repeat(50), 'blue');
  
  if (success) {
    log('🎉 All tests completed successfully!', 'green');
    log('\nNext steps:', 'cyan');
    log('• Run "npm run test:coverage" to see coverage report', 'blue');
    log('• Run "npm run test:watch" for development', 'blue');
    log('• Check test-report.html for detailed results', 'blue');
  } else {
    log('💥 Some tests failed. Check the output above for details.', 'red');
    process.exit(1);
  }
}

// Show help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  log('🧪 LLMLog Test Runner', 'bright');
  log('\nUsage: node test/run-tests.js [command]', 'cyan');
  log('\nCommands:', 'yellow');
  log('  all       Run all tests (default)', 'blue');
  log('  unit      Run only unit tests (modules)', 'blue');
  log('  platform  Run only platform tests', 'blue');
  log('  coverage  Run tests with coverage report', 'blue');
  log('  watch     Run tests in watch mode', 'blue');
  log('  verbose   Run tests with verbose output', 'blue');
  log('\nExamples:', 'yellow');
  log('  node test/run-tests.js', 'blue');
  log('  node test/run-tests.js coverage', 'blue');
  log('  node test/run-tests.js unit', 'blue');
  process.exit(0);
}

main();
