/**
 * Minimal access control: single allowlist (no roles DB in v1).
 * Use after JWT verification; when ALLOWED_CALLERS is set, only listed identities are allowed.
 */

const ALLOWED_CALLERS_ENV = "ALLOWED_CALLERS";

function getAllowedCallers(): string[] | null {
  const raw = process.env[ALLOWED_CALLERS_ENV];
  if (!raw || !raw.trim()) return null;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Returns true if the identity is allowed to perform protected actions.
 * When ALLOWED_CALLERS is unset, all identities are allowed (backward compatible).
 */
export function isAllowedCaller(identity: string): boolean {
  const allowlist = getAllowedCallers();
  if (!allowlist || allowlist.length === 0) return true;
  return allowlist.includes(identity);
}
