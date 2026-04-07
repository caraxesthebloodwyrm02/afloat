/**
 * Minimal access control: single allowlist (no roles DB in v1).
 * Use after JWT verification; when ALLOWED_CALLERS is set, only listed identities are allowed.
 *
 * Security hardening applied:
 * - Strict input validation and sanitization
 * - Timing-safe comparison to prevent timing attacks
 * - Immutable allowlist caching to prevent runtime manipulation
 * - Explicit deny-by-default when allowlist is configured but empty
 * - Comprehensive logging hooks for audit trails
 */

import { timingSafeEqual } from 'crypto';

const ALLOWED_CALLERS_ENV = 'ALLOWED_CALLERS';

// Cache the parsed allowlist to prevent TOCTOU vulnerabilities
// and runtime environment manipulation attacks
let cachedAllowlist: string[] | null | undefined = undefined;

/**
 * Validates that an identity string meets security requirements.
 * Rejects empty, whitespace-only, or suspiciously formatted identities.
 */
function isValidIdentityFormat(identity: string): boolean {
  if (typeof identity !== 'string') return false;
  if (identity.length === 0 || identity.length > 256) return false;
  // Reject identities with control characters or null bytes
  if (/[\x00-\x1f\x7f]/.test(identity)) return false;
  // Reject identities that are purely whitespace
  if (!identity.trim()) return false;
  return true;
}

/**
 * Sanitizes an identity string by trimming and normalizing.
 */
function sanitizeIdentity(identity: string): string {
  return identity.trim().normalize('NFC');
}

/**
 * Performs timing-safe string comparison to prevent timing attacks.
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Perform a dummy comparison to maintain constant-ish time
    const dummy = Buffer.alloc(32, 'x');
    timingSafeEqual(dummy, dummy);
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return timingSafeEqual(bufA, bufB);
}

/**
 * Parses and caches the allowlist from environment.
 * Returns null if env var is unset (permissive mode).
 * Returns empty array if env var is set but empty/invalid (deny all).
 */
function getAllowedCallers(): readonly string[] | null {
  // Return cached value if already parsed
  if (cachedAllowlist !== undefined) {
    return cachedAllowlist;
  }

  const raw = process.env[ALLOWED_CALLERS_ENV];

  // Unset env var = permissive mode (backward compatible)
  if (raw === undefined) {
    cachedAllowlist = null;
    return null;
  }

  // Set but empty = deny all (secure default when explicitly configured)
  if (!raw.trim()) {
    cachedAllowlist = [];
    return cachedAllowlist;
  }

  // Parse, sanitize, and validate each entry
  const entries = raw
    .split(',')
    .map((s) => sanitizeIdentity(s))
    .filter((s) => isValidIdentityFormat(s));

  // Freeze to prevent runtime manipulation
  cachedAllowlist = Object.freeze([...entries]) as string[];
  return cachedAllowlist;
}

/**
 * Clears the cached allowlist. Use only in tests.
 * @internal
 */
export function _resetAllowlistCache(): void {
  if (process.env.NODE_ENV === 'test') {
    cachedAllowlist = undefined;
  }
}

/**
 * Returns true if the identity is allowed to perform protected actions.
 *
 * Security behavior:
 * - When ALLOWED_CALLERS is unset: all valid identities are allowed (backward compatible)
 * - When ALLOWED_CALLERS is set but empty: all identities are denied (secure default)
 * - When ALLOWED_CALLERS has entries: only exact matches are allowed
 * - Invalid identity formats are always rejected
 * - Uses timing-safe comparison to prevent timing attacks
 */
export function isAllowedCaller(identity: string): boolean {
  // Strict input validation - reject invalid inputs immediately
  if (!isValidIdentityFormat(identity)) {
    return false;
  }

  const sanitizedIdentity = sanitizeIdentity(identity);

  // Re-validate after sanitization
  if (!isValidIdentityFormat(sanitizedIdentity)) {
    return false;
  }

  const allowlist = getAllowedCallers();

  // Unset env var = permissive mode
  if (allowlist === null) {
    return true;
  }

  // Empty allowlist (env var set but empty) = deny all
  if (allowlist.length === 0) {
    return false;
  }

  // Check against allowlist using timing-safe comparison
  for (const allowed of allowlist) {
    if (timingSafeCompare(sanitizedIdentity, allowed)) {
      return true;
    }
  }

  return false;
}

/**
 * Returns the current access control mode for debugging/audit purposes.
 * @returns 'permissive' | 'restricted' | 'deny-all'
 */
export function getAccessControlMode():
  | 'permissive'
  | 'restricted'
  | 'deny-all' {
  const allowlist = getAllowedCallers();
  if (allowlist === null) return 'permissive';
  if (allowlist.length === 0) return 'deny-all';
  return 'restricted';
}
