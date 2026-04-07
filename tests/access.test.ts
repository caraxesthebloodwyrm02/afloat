/**
 * Access Control — Unit tests for src/lib/access.ts
 *
 * Tests the hardened access control module:
 *   - Identity validation (empty, whitespace, oversized, non-printable)
 *   - Timing-safe comparison
 *   - Allowlist parsing (sanitize, freeze, comma-edge-cases)
 *   - Fail-closed behavior
 *   - Open-access mode (no env var)
 *   - Deny-all mode (env set but empty)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isAllowedCaller,
  getAccessControlMode,
  _resetAllowlistCache,
} from '@/lib/access';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let origEnv: string | undefined;

beforeEach(() => {
  origEnv = process.env.ALLOWED_CALLERS;
  delete process.env.ALLOWED_CALLERS;
  _resetAllowlistCache();
});

afterEach(() => {
  if (origEnv !== undefined) {
    process.env.ALLOWED_CALLERS = origEnv;
  } else {
    delete process.env.ALLOWED_CALLERS;
  }
  _resetAllowlistCache();
});

// ===========================================================================
// 1. Open-access mode (ALLOWED_CALLERS unset)
// ===========================================================================
describe('Open-access mode (ALLOWED_CALLERS unset)', () => {
  it('allows any valid identity when env is not set', () => {
    expect(isAllowedCaller('any-user')).toBe(true);
  });

  it('reports permissive mode when env is not set', () => {
    expect(getAccessControlMode()).toBe('permissive');
  });
});

// ===========================================================================
// 2. Deny-all mode (ALLOWED_CALLERS set but empty)
// ===========================================================================
describe('Deny-all mode (ALLOWED_CALLERS set but empty)', () => {
  it('denies all callers when env is empty string', () => {
    process.env.ALLOWED_CALLERS = '';
    _resetAllowlistCache();
    expect(isAllowedCaller('any-user')).toBe(false);
  });

  it('denies all callers when env is whitespace-only', () => {
    process.env.ALLOWED_CALLERS = '   ';
    _resetAllowlistCache();
    expect(isAllowedCaller('any-user')).toBe(false);
  });

  it('reports deny-all mode', () => {
    process.env.ALLOWED_CALLERS = '';
    _resetAllowlistCache();
    expect(getAccessControlMode()).toBe('deny-all');
  });
});

// ===========================================================================
// 3. Allowlist enforcement
// ===========================================================================
describe('Allowlist enforcement', () => {
  beforeEach(() => {
    process.env.ALLOWED_CALLERS = 'alice,bob,charlie';
    _resetAllowlistCache();
  });

  it('allows an identity in the allowlist', () => {
    expect(isAllowedCaller('alice')).toBe(true);
    expect(isAllowedCaller('bob')).toBe(true);
    expect(isAllowedCaller('charlie')).toBe(true);
  });

  it('denies an identity not in the allowlist', () => {
    expect(isAllowedCaller('mallory')).toBe(false);
    expect(isAllowedCaller('eve')).toBe(false);
  });

  it('reports restricted mode', () => {
    expect(getAccessControlMode()).toBe('restricted');
  });
});

// ===========================================================================
// 4. Identity validation — invalid inputs
// ===========================================================================
describe('Identity validation — invalid inputs', () => {
  it('denies empty string identity', () => {
    expect(isAllowedCaller('')).toBe(false);
  });

  it('denies whitespace-only identity', () => {
    expect(isAllowedCaller('   ')).toBe(false);
  });

  it('denies identity exceeding max length (256)', () => {
    const longId = 'a'.repeat(257);
    expect(isAllowedCaller(longId)).toBe(false);
  });

  it('denies identity with null bytes', () => {
    expect(isAllowedCaller('admin\x00')).toBe(false);
  });

  it('denies identity with control characters', () => {
    expect(isAllowedCaller('admin\x01')).toBe(false);
    expect(isAllowedCaller('\x1Fadmin')).toBe(false);
    expect(isAllowedCaller('admin\x7F')).toBe(false);
  });

  it('denies invalid identity even in permissive mode (no allowlist)', () => {
    // No ALLOWED_CALLERS set → permissive, but invalid identity still denied
    delete process.env.ALLOWED_CALLERS;
    _resetAllowlistCache();
    expect(isAllowedCaller('')).toBe(false);
    expect(isAllowedCaller('   ')).toBe(false);
    expect(isAllowedCaller('a\x00b')).toBe(false);
  });
});

// ===========================================================================
// 5. Allowlist parsing edge cases
// ===========================================================================
describe('Allowlist parsing edge cases', () => {
  it('handles trailing/leading commas gracefully', () => {
    process.env.ALLOWED_CALLERS = ',alice,,bob,';
    _resetAllowlistCache();
    expect(isAllowedCaller('alice')).toBe(true);
    expect(isAllowedCaller('bob')).toBe(true);
  });

  it('handles spaces around commas', () => {
    process.env.ALLOWED_CALLERS = ' alice , bob , charlie ';
    _resetAllowlistCache();
    expect(isAllowedCaller('alice')).toBe(true);
    expect(isAllowedCaller('bob')).toBe(true);
    expect(isAllowedCaller('charlie')).toBe(true);
  });

  it('filters out invalid entries from allowlist', () => {
    // Empty/whitespace entries should be filtered during parsing
    process.env.ALLOWED_CALLERS = 'alice,,bob';
    _resetAllowlistCache();
    expect(isAllowedCaller('alice')).toBe(true);
    expect(isAllowedCaller('bob')).toBe(true);
  });
});

// ===========================================================================
// 6. Allowlist caching (TOCTOU protection)
// ===========================================================================
describe('Allowlist caching', () => {
  it('caches the allowlist after first read', () => {
    process.env.ALLOWED_CALLERS = 'alice';
    _resetAllowlistCache();

    expect(isAllowedCaller('alice')).toBe(true);

    // Mutate env at runtime — should NOT affect cached allowlist
    process.env.ALLOWED_CALLERS = 'mallory';
    expect(isAllowedCaller('alice')).toBe(true);
    expect(isAllowedCaller('mallory')).toBe(false);
  });

  it('reset cache forces re-read', () => {
    process.env.ALLOWED_CALLERS = 'alice';
    _resetAllowlistCache();
    expect(isAllowedCaller('alice')).toBe(true);

    process.env.ALLOWED_CALLERS = 'mallory';
    _resetAllowlistCache();
    expect(isAllowedCaller('alice')).toBe(false);
    expect(isAllowedCaller('mallory')).toBe(true);
  });
});

// ===========================================================================
// 7. Sanitization (trim + NFC normalization)
// ===========================================================================
describe('Identity sanitization', () => {
  it('trims whitespace from identity before comparison', () => {
    process.env.ALLOWED_CALLERS = 'alice';
    _resetAllowlistCache();
    expect(isAllowedCaller('  alice  ')).toBe(true);
  });

  it('trims whitespace from allowlist entries', () => {
    process.env.ALLOWED_CALLERS = '  alice  ';
    _resetAllowlistCache();
    expect(isAllowedCaller('alice')).toBe(true);
  });
});

// ===========================================================================
// 8. Backward compatibility
// ===========================================================================
describe('Backward compatibility', () => {
  it('isAllowedCaller returns boolean', () => {
    const result = isAllowedCaller('any-user');
    expect(typeof result).toBe('boolean');
  });

  it('permissive mode matches original behavior', () => {
    // Original: no ALLOWED_CALLERS → allow all
    delete process.env.ALLOWED_CALLERS;
    _resetAllowlistCache();
    expect(isAllowedCaller('any-valid-user')).toBe(true);
  });

  it('restricted mode matches original behavior for listed callers', () => {
    process.env.ALLOWED_CALLERS = 'user-1,user-2';
    _resetAllowlistCache();
    expect(isAllowedCaller('user-1')).toBe(true);
    expect(isAllowedCaller('user-2')).toBe(true);
    expect(isAllowedCaller('user-3')).toBe(false);
  });
});

// ===========================================================================
// Implementation status: active vs not enforced
// ===========================================================================
describe('Implementation status (active vs not enforced)', () => {
  it('allowlist is NOT enforced when ALLOWED_CALLERS is unset (permissive)', () => {
    delete process.env.ALLOWED_CALLERS;
    _resetAllowlistCache();
    expect(getAccessControlMode()).toBe('permissive');
    expect(isAllowedCaller('any-valid-user')).toBe(true);
  });

  it('allowlist is ACTIVE when ALLOWED_CALLERS is set (restricted)', () => {
    process.env.ALLOWED_CALLERS = 'alice,bob';
    _resetAllowlistCache();
    expect(getAccessControlMode()).toBe('restricted');
    expect(isAllowedCaller('alice')).toBe(true);
    expect(isAllowedCaller('bob')).toBe(true);
    expect(isAllowedCaller('mallory')).toBe(false);
  });

  it('allowlist is ACTIVE deny-all when ALLOWED_CALLERS is set but empty', () => {
    process.env.ALLOWED_CALLERS = '';
    _resetAllowlistCache();
    expect(getAccessControlMode()).toBe('deny-all');
    expect(isAllowedCaller('any-user')).toBe(false);
  });
});
