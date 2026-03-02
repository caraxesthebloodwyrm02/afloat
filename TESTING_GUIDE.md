# Secret Validation Testing Guide

## How to Test Secret Validation and Entropy Issues

### 1. Unit Tests (Vitest)

**Run the test suite:**
```bash
npm test -- tests/secrets.test.ts
```

**What it tests:**
- ✅ **Entropy Detection**: Validates `hasLowEntropy()` function with various string patterns
- ✅ **Validation Logic**: Tests `validateSecrets()` with different scenarios
- ✅ **Error Cases**: Missing secrets, short secrets, weak defaults
- ✅ **Warning Cases**: Low entropy detection
- ✅ **Generation**: Secret generation utilities

**Key Test Results from Current Run:**
- ❌ **13 tests failed** - confirming the entropy validation issues
- ❌ **Missing exports** - `hasLowEntropy` not exported from secrets module
- ❌ **Validation logic gaps** - some expected error conditions not being caught

### 2. Manual Testing Script

**Quick analysis:**
```bash
node scripts/test-secrets.js analyze
```

**Generate strong secrets:**
```bash
node scripts/test-secrets.js generate
```

**Test entropy detection:**
```bash
node scripts/test-secrets.js test
```

**Get suggested fixes:**
```bash
node scripts/test-secrets.js fix
```

### 3. Development Server Test

**Current status validation:**
```bash
npm run dev
```
*Expected to fail with entropy validation errors*

### 4. Environment Variable Testing

**Check current secrets:**
```bash
node -e "
const fs = require('fs');
const path = require('path');
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  if (line.startsWith('JWT_SECRET=') || line.startsWith('PROVENANCE_SIGNING_KEY=') || line.startsWith('CRON_SECRET=')) {
    const secret = line.split('=')[1];
    const unique = new Set(secret.split('')).size;
    const ratio = unique / secret.length;
    console.log(line.split('=')[0] + ': ' + (ratio < 0.3 ? 'LOW ENTROPY' : 'GOOD') + ' (' + ratio.toFixed(3) + ')');
  }
});
"
```

### 5. Integration Testing

**Test with actual secrets:**
```bash
# Create test environment
cp .env.local .env.test

# Update with strong secrets
node -e "
const crypto = require('crypto');
const fs = require('fs');
let content = fs.readFileSync('.env.test', 'utf8');
content = content.replace(/JWT_SECRET=.*/, 'JWT_SECRET=' + crypto.randomBytes(32).toString('base64').replace(/[+/=]/g, ''));
content = content.replace(/PROVENANCE_SIGNING_KEY=.*/, 'PROVENANCE_SIGNING_KEY=' + crypto.randomBytes(32).toString('base64').replace(/[+/=]/g, ''));
content = content.replace(/CRON_SECRET=.*/, 'CRON_SECRET=' + crypto.randomBytes(16).toString('base64').replace(/[+/=]/g, ''));
fs.writeFileSync('.env.test', content);
console.log('Updated .env.test with strong secrets');
"

# Test with new environment
cp .env.test .env.local && npm run dev
```

## Test Results Analysis

### Current Issues Identified

1. **Low Entropy Secrets** (Ratio < 0.3)
   - Hex-encoded secrets: ~0.25 ratio (16/64 unique chars)
   - Fails validation: `hasLowEntropy()` returns `true`

2. **Missing Function Export**
   - `hasLowEntropy` not exported from `src/lib/secrets.ts`
   - Tests cannot import the function directly

3. **Validation Logic Gaps**
   - Some error conditions not being caught
   - Weak value detection needs refinement

### Expected Test Outcomes

**Before Fix:**
- ❌ Development server fails to start
- ❌ 13/13 unit tests fail
- ❌ Entropy ratio < 0.3 for hex secrets

**After Fix:**
- ✅ Development server starts successfully
- ✅ All unit tests pass
- ✅ Entropy ratio > 0.7 for base64 secrets

## Testing Best Practices

### 1. Entropy Validation
```javascript
// Test entropy calculation
function testEntropy(secret, expectedMinRatio = 0.3) {
  const unique = new Set(secret.split('')).size;
  const ratio = unique / secret.length;
  return ratio >= expectedMinRatio;
}
```

### 2. Secret Generation Testing
```javascript
// Test secret generation
function testSecretGeneration() {
  const crypto = require('crypto');
  const secret = crypto.randomBytes(32).toString('base64').replace(/[+/=]/g, '');
  console.log('Generated:', secret);
  console.log('Length:', secret.length);
  console.log('Entropy:', new Set(secret.split('')).size / secret.length);
}
```

### 3. Integration Testing
```javascript
// Test full validation pipeline
function testValidation() {
  process.env.JWT_SECRET = 'test-secret';
  const result = validateSecrets();
  console.log('Valid:', result.valid);
  console.log('Errors:', result.errors);
  console.log('Warnings:', result.warnings);
}
```

## Continuous Testing

### Add to CI/CD
```yaml
# .github/workflows/test-secrets.yml
- name: Test Secret Validation
  run: |
    npm test -- tests/secrets.test.ts
    node scripts/test-secrets.js analyze
```

### Pre-commit Hook
```bash
# .husky/pre-commit
#!/bin/sh
npm test -- tests/secrets.test.ts
```

### Development Monitoring
```bash
# Watch for secret changes
npm run test:watch -- tests/secrets.test.ts
```

## Summary

The testing framework provides comprehensive coverage:
- **Unit tests** for individual functions
- **Integration tests** for full validation pipeline  
- **Manual scripts** for quick analysis
- **Development server** validation for real-world testing

All tests confirm the entropy validation issues and provide clear paths for resolution.
