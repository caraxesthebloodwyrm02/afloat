# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- **Safety core (sanitized approach)**  
  - **docs/SAFETY_CORE.md**: Documents the minimal, in-process safety model (one gate, one audit write, minimal access). Tool-call free; no external MCP or services for core safety.
  - **src/lib/access.ts**: Minimal access control via `isAllowedCaller(identity)`. When env `ALLOWED_CALLERS` is set (comma-separated), only those identities are allowed; when unset, all authenticated callers are allowed (backward compatible).
  - **.claude/rules/safety.md**: References SAFETY_CORE.md and the single-gate rule.

### Changed

- **src/lib/audit.ts**: Append-only audit entries now include an optional `payload_hash` (SHA-256 of payload) per entry for integrity. No parent/child chain in v1. Existing callers unchanged; `writeAuditLog` computes the hash internally.

### Security

- Single sanitization gate remains `runSafetyPipeline()` (preCheckGate → PII → safety gradient). No second TrustLayer.
- Optional allowlist: set `ALLOWED_CALLERS` to restrict protected operations to specific identities (e.g. `user_id1,user_id2`).
