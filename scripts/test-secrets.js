#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Secret Validation Test Script
 *
 * This script tests the secret validation functionality and provides
 * actionable feedback for fixing entropy issues.
 */

// Load environment variables from .env.local manually (no dotenv dependency)
const fs = require('fs');
const envPath = require('path').join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0)
          process.env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
      }
    });
}

// Import the compiled JavaScript version
let validateSecrets;
try {
  validateSecrets = require('../dist/lib/secrets.js').validateSecrets;
} catch {
  // Fallback: implement basic validation for testing
  validateSecrets = () => ({ valid: false, errors: [], warnings: [] });
}

function calculateEntropy(value) {
  const unique = new Set(value.split('')).size;
  const ratio = unique / value.length;
  return { unique, total: value.length, ratio };
}

function analyzeSecrets() {
  console.log('🔍 Analyzing current secrets...\n');

  const secrets = {
    JWT_SECRET: process.env.JWT_SECRET,
    PROVENANCE_SIGNING_KEY: process.env.PROVENANCE_SIGNING_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  };

  console.log('📊 Entropy Analysis:');
  console.log('─'.repeat(60));

  Object.entries(secrets).forEach(([key, value]) => {
    if (!value) {
      console.log(`${key}: ❌ MISSING`);
      return;
    }

    const entropy = calculateEntropy(value);
    const status = entropy.ratio < 0.3 ? '❌ LOW' : '✅ GOOD';
    console.log(`${key}: ${status}`);
    console.log(
      `  Length: ${entropy.total} | Unique: ${entropy.unique} | Ratio: ${entropy.ratio.toFixed(3)}`
    );
  });

  console.log('\n🧪 Running validation...');
  console.log('─'.repeat(60));

  const result = validateSecrets();

  if (result.valid) {
    console.log('✅ All secrets passed validation!');
  } else {
    console.log('❌ Validation failed!');
  }

  if (result.errors.length > 0) {
    console.log('\n🚨 Critical Errors:');
    result.errors.forEach((error) => {
      console.log(`  ${error.secret}: ${error.reason}`);
    });
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach((warning) => {
      console.log(`  ${warning.secret}: ${warning.reason}`);
    });
  }

  return result;
}

function generateStrongSecrets() {
  console.log('\n🔧 Generating strong secrets...');
  console.log('─'.repeat(60));

  const crypto = require('crypto');

  function generateStrongSecret(byteLength) {
    return crypto
      .randomBytes(byteLength)
      .toString('base64')
      .replace(/[+/=]/g, '')
      .substring(0, byteLength * 2);
  }

  const newSecrets = {
    JWT_SECRET: generateStrongSecret(32),
    PROVENANCE_SIGNING_KEY: generateStrongSecret(32),
    CRON_SECRET: generateStrongSecret(16),
    OPENAI_API_KEY: 'sk-' + generateStrongSecret(20),
    STRIPE_SECRET_KEY: 'sk_test_' + generateStrongSecret(24),
  };

  console.log('📝 New secrets (copy these to .env.local):');
  Object.entries(newSecrets).forEach(([key, value]) => {
    const entropy = calculateEntropy(value);
    const status = entropy.ratio < 0.3 ? '❌' : '✅';
    console.log(`${status} ${key}=${value}`);
  });

  return newSecrets;
}

function testEntropyFunction() {
  console.log('\n🧪 Testing entropy detection...');
  console.log('─'.repeat(60));

  // Test cases
  const testCases = [
    {
      name: 'Hex string (low entropy)',
      value: '6602544f7a44d48f4411c843d28e827621bcef84fc522ce1ca9616185d8b3e7b',
    },
    {
      name: 'Base64 string (high entropy)',
      value: 'B9WqS5sMazj8bfDlHkktwSv7jI6r74nxYnMkA1Re4E',
    },
    {
      name: 'Repetitive (very low)',
      value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    {
      name: 'Sequential (low)',
      value: 'abcdefghijklmnopqrstuvwxyabcdefghijklmnopqrstuvwxy',
    },
  ];

  testCases.forEach((test) => {
    const entropy = calculateEntropy(test.value);
    const isLow = entropy.ratio < 0.3;
    const status = isLow ? '❌ LOW' : '✅ GOOD';
    console.log(`${status} ${test.name}`);
    console.log(
      `  Ratio: ${entropy.ratio.toFixed(3)} | Unique: ${entropy.unique}/${entropy.total}`
    );
  });
}

// Main execution
function main() {
  const command = process.argv[2];

  switch (command) {
    case 'analyze':
      analyzeSecrets();
      break;
    case 'generate':
      generateStrongSecrets();
      break;
    case 'test':
      testEntropyFunction();
      break;
    case 'fix':
      const analysis = analyzeSecrets();
      if (!analysis.valid) {
        console.log('\n💡 Suggested fix:');
        generateStrongSecrets();
      }
      break;
    default:
      console.log('🔧 Secret Validation Test Tool');
      console.log('');
      console.log('Usage:');
      console.log(
        '  node scripts/test-secrets.js analyze   - Analyze current secrets'
      );
      console.log(
        '  node scripts/test-secrets.js generate  - Generate strong secrets'
      );
      console.log(
        '  node scripts/test-secrets.js test      - Test entropy detection'
      );
      console.log(
        '  node scripts/test-secrets.js fix       - Analyze and suggest fixes'
      );
      console.log('');
      analyzeSecrets();
  }
}

if (require.main === module) {
  main();
}

module.exports = { analyzeSecrets, generateStrongSecrets, testEntropyFunction };
