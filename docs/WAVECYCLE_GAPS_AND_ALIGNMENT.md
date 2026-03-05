# Gaps Between the Wavecycle and Codebase Patterns

This document states, in plain English, where the **Afloat Knowledge Consolidation & Execution** wavecycle diverges from the codebase’s custom patterns (including those in GRID’s `AGENT_INSIGHTS_AND_PATTERNS.md`). The goal is to align the approach with how the repos actually work, without introducing technical warnings.

---

## 1. Where the patterns live and which repo does what

**Gap:** The wavecycle says to use “patterns in `docs/AGENT_INSIGHTS_AND_PATTERNS.md`” but does not say where that file lives.

**Reality:** `AGENT_INSIGHTS_AND_PATTERNS.md` exists in **GRID-main** (`docs/AGENT_INSIGHTS_AND_PATTERNS.md`), not in Afloat. Afloat has no copy of it.

**Alignment:** For Afloat, either (a) treat the patterns as “reference in the GRID repo when working in a multi-repo workspace,” or (b) add a short note in the wavecycle or in Afloat’s `docs/` that points to GRID’s path (e.g. `../GRID-main/docs/AGENT_INSIGHTS_AND_PATTERNS.md` or the actual workspace path). That way agents know where to read the patterns from when executing the wavecycle in Afloat.

---

## 2. Pattern section numbers

**Gap:** The wavecycle refers to “Section 3.1,” “Section 3.2,” “Section 3.4,” “Section 3.5” for the patterns. In `AGENT_INSIGHTS_AND_PATTERNS.md`, the **reusable patterns** are under **Section 4** (4.1 Integrity/verification, 4.2 Status + pending steps, 4.3 Consolidation, 4.4 Staging and commit, 4.5 Community contribution). Section 3 is “Recorded insights,” not the pattern steps.

**Alignment:** When the wavecycle says “Patterns Used,” point to **Section 4** (e.g. “Section 4.1,” “Section 4.2”). That keeps the wavecycle consistent with the structure of the patterns doc.

---

## 3. Document names and locations

**Gap:** The wavecycle uses names and locations that don’t match the codebase.

- It asks for **`docs/WSL_STATUS.md`**. In GRID, the equivalent is **`docs/WSL_STATUS_AND_PENDING_STEPS.md`** (status table plus pending steps in one doc).
- It asks for **`docs/SHELL_INTEGRITY.md`**. In GRID, the equivalent is **`docs/SHELL_INTEGRATION_SCRIPT_REPORT.md`** (integrity, hash, safety). Afloat has neither file.
- It says “archived in `docs/`” for **`COMMIT_PLAN_WSL.md`** but doesn’t give a full path in Phase 4; Phase 1 uses `docs/WSL_STATUS.md` with a path. So “commit plan” location is ambiguous.

**Alignment:** Either (a) use the existing GRID names when the wavecycle is applied in a workspace that includes GRID (`WSL_STATUS_AND_PENDING_STEPS.md`, `SHELL_INTEGRATION_SCRIPT_REPORT.md`), or (b) define Afloat-specific names and paths once (e.g. `docs/WSL_STATUS.md` in Afloat, and “no SHELL_INTEGRITY in Afloat” or “optional, link to GRID”). Put the commit plan in one place, e.g. **`docs/COMMIT_PLAN_WSL.md`**, and use that path in every phase that mentions it.

---

## 4. What exists in Afloat today

**Gap:** The wavecycle assumes several artifacts already exist or will live in the same repo. In Afloat today:

- There is **no** `ACKNOWLEDGEMENT.md` (and no “acknowledgement” file). GRID has `docs/project/ACKNOWLEDGEMENT.md` and `docs/acknowledgement.md`; Afloat does not.
- There are **no** WSL-specific docs (`WSL_STATUS`, `WSL_FIX`, `COMMUNITY_WSL_FIX`). Afloat’s `docs/` has safety, architecture, runbooks, etc., but nothing named for WSL.
- There is **no** shell-integration or shell-integrity doc in Afloat; that concern is editor/machine-level and lives in GRID as a reference.

**Alignment:** Spell out that Phase 1–5 **create** these docs in Afloat (or reference GRID’s where appropriate). For acknowledgement, either (a) add a new file (e.g. `docs/ACKNOWLEDGEMENT.md` or `ACKNOWLEDGEMENT.md` at repo root) and link from the wavecycle, or (b) state that “if the project has no acknowledgement file, add a short WSL-fix section to an existing doc (e.g. RUNBOOK or LAUNCH_PROGRESS) and link from there.” That way the wavecycle doesn’t assume a file that isn’t there.

---

## 5. wsl.conf: documentation vs versioned file

**Gap:** The wavecycle says “Create or modify `wsl.conf`” and “git add wsl.conf.” In practice, `wsl.conf` is a **system file inside WSL** (e.g. `/etc/wsl.conf`), not a file in the project repo. Repos don’t usually commit the live system file; they document what to put in it.

**Alignment:** Treat `wsl.conf` as **documented, not committed**. The wavecycle should (a) say “document the contents to add to `/etc/wsl.conf` (inside WSL)” and (b) stage only repo files, e.g. `docs/WSL_FIX.md` (and optionally a template or snippet in docs), not “wsl.conf” as a repo path. The “Implement WSL fixes” phase then means “document the fix and the steps; the user applies the change in their WSL environment.” That matches the pattern of documenting a fix and leaving system config in the system.

---

## 6. One commit vs two commits

**Gap:** Phase 2 describes a commit (“git add wsl.conf docs/WSL_FIX.md …”) and Phase 4 describes another commit with a larger set of files (e.g. `wsl.conf`, `docs/WSL_FIX.md`, `docs/WSL_STATUS.md`, `docs/COMMUNITY_WSL_FIX.md`). That implies two separate commits for overlapping changes, and Phase 4’s “Exclude … SHELL_INTEGRITY.md” assumes a repo that has a shell-integrity doc.

**Alignment:** Follow the **single-concern commit** idea from the patterns: one theme per commit. Either (a) do **one** WSL-docs commit after all WSL artifacts are ready (status, fix, community doc, commit plan), and drop the Phase 2 commit, or (b) define two clear themes (e.g. “Phase 2: implement and document the fix” vs “Phase 4: add status table and community doc”) and make the include/exclude lists explicit for each. The exclude list should only name files that exist or might exist in that repo (for Afloat, no `SHELL_INTEGRITY.md` unless you introduce one or point to GRID).

---

## 7. Shell integration verification and Afloat

**Gap:** Phase 1 asks to “Re-calculate shell integration hash (SHA256) and compare with recorded value” and to “record in `docs/SHELL_INTEGRITY.md`.” Shell integration is an **editor/IDE concern** (Cursor/VS Code script), not an Afloat application concern. Afloat doesn’t ship or control that script; the hash was recorded in GRID’s shell-integration report.

**Alignment:** For an **Afloat-only** wavecycle, treat shell-integration verification as **optional** or **out of scope**: either skip it, or add one sentence (e.g. “If you also need to verify the editor’s shell integration script, see GRID’s SHELL_INTEGRATION_SCRIPT_REPORT.md and run the hash commands there”). Don’t require creating or updating a SHELL_INTEGRITY doc inside Afloat unless Afloat explicitly takes on that responsibility.

---

## 8. Verification commands and session start

**Gap:** Phase 4 says “Run `npm run test && npm run lint` (must pass).” That matches Afloat’s **session start protocol** in CLAUDE.md and AGENTS.md, so the verification step is correct for Afloat. The wavecycle doesn’t say to run it from the repo root or to have deps installed.

**Alignment:** Add one short line: “From Afloat repo root, with dependencies installed, run …” so it’s clear that verification follows the project’s normal workflow. No change to the commands themselves.

---

## 9. Acknowledgement and linking

**Gap:** Phase 5 asks to update `ACKNOWLEDGEMENT.md` with a WSL-fixes section and links. Afloat doesn’t have that file, and the wavecycle doesn’t say where to add credits or links if the project has no acknowledgement file.

**Alignment:** Decide once where “acknowledgement” lives for Afloat: (a) new `docs/ACKNOWLEDGEMENT.md` or root `ACKNOWLEDGEMENT.md`, or (b) a “Contributions” or “Changelog” section in an existing doc (e.g. RUNBOOK, LAUNCH_PROGRESS, or CHANGELOG). Then in the wavecycle, say “Update [that location] with …” and “Confirm all links in [that location] are valid.” That aligns with the consolidation pattern (one place to look) without assuming a file that doesn’t exist.

---

## 10. Upstream and community doc

**Gap:** Phase 3 says to share the WSL fix “as a GitHub issue (if none exists) in the WSL repo” and to add “GitHub Issue #123” to the community doc. The real issue number is unknown until someone opens the issue; the wavecycle uses a placeholder.

**Alignment:** State that the “Upstream links” section in `COMMUNITY_WSL_FIX.md` is filled in **after** the issue or PR is created (e.g. “Add the actual issue or PR URL here once created”). The wavecycle can show “[GitHub Issue #123](url)” as a template. That keeps the pattern (one-line + link) without implying a specific issue number upfront.

---

## Summary table

| Gap | In short | Alignment in plain English |
|-----|-----------|-----------------------------|
| Patterns location | Patterns doc is in GRID, wavecycle is for Afloat | Say where to read patterns from (GRID path or copy) when running the wavecycle in Afloat |
| Section numbers | Wavecycle says Section 3.x, patterns are in Section 4 | Use Section 4.x when referring to pattern steps |
| Doc names | Wavecycle uses WSL_STATUS, SHELL_INTEGRITY; GRID uses longer names; Afloat has none | Use one naming scheme and say which repo each doc lives in; for Afloat-only, create or reference accordingly |
| Existing files | Wavecycle assumes WSL and acknowledgement docs exist | Say which artifacts are created in Afloat and where acknowledgement lives (or that it’s added to an existing doc) |
| wsl.conf | Wavecycle implies committing wsl.conf | Document the fix and steps; do not git-add the system file; only repo docs are committed |
| Commits | Two commits (Phase 2 and 4) overlap in scope | One WSL-docs commit per theme, or two clearly separated themes with explicit include/exclude lists |
| Shell integration | Phase 1 requires hash and SHELL_INTEGRITY in Afloat | For Afloat-only, make shell-integration verification optional or point to GRID’s report |
| Verification | npm test/lint is correct for Afloat | Add “from repo root, with deps installed” so it matches project custom |
| Acknowledgement | Phase 5 updates ACKNOWLEDGEMENT.md | Define where Afloat records credits (new file or existing doc) and use that in the wavecycle |
| Upstream link | Placeholder issue number | Describe “Upstream links” as filled after the issue/PR is created; use template in the doc |

---

## Remaining implementation checklist (Afloat)

When executing the wavecycle in Afloat:

1. **Patterns:** Point to GRID `docs/AGENT_INSIGHTS_AND_PATTERNS.md` **Section 4** (not Section 3) for integrity/verification, status + pending steps, consolidation, staging and commit, and community contribution.
2. **Afloat doc names:** Use `docs/WSL_FIX.md` for the WSL automount fix (created). For status table, either create `docs/WSL_STATUS.md` (Afloat-specific) or link to GRID’s `WSL_STATUS_AND_PENDING_STEPS.md` when in a multi-repo workspace.
3. **Commit:** One WSL-docs commit per theme; stage only repo docs (do not `git add` system `wsl.conf`). Include list e.g. `docs/WSL_FIX.md`, `docs/WAVECYCLE_GAPS_AND_ALIGNMENT.md` (and any new WSL_STATUS or COMMUNITY_WSL_FIX if created).
4. **Verification:** From Afloat repo root, run `npm run test && npm run lint` before committing; fix any failures first.
5. **Upstream link:** Fill “Upstream links” in any community WSL doc after the GitHub issue or PR is created, not with a placeholder number.

---

Using this list, the wavecycle can be adjusted so its steps, artifact names, and locations match the codebase’s custom patterns and what actually exists in Afloat (and, where relevant, in GRID), without raising technical warnings.
