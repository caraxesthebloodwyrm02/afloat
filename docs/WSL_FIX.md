# WSL Automount Fix

Drive `E:` (or other non-C drives) is often not mounted in WSL by default, blocking cross-OS workflows (e.g. running Afloat or scripts from WSL against a repo on E:). This doc documents the fix. **Do not commit `/etc/wsl.conf`** — it is a system file; apply the steps in your WSL environment.

---

## Steps (persistent)

1. In WSL:
   ```bash
   sudo nano /etc/wsl.conf
   ```
2. Ensure this block exists (add if missing):
   ```ini
   [automount]
   enabled = true
   options = "metadata"
   ```
3. Save (`Ctrl+O`, Enter, `Ctrl+X`), exit WSL, then from **PowerShell**:
   ```powershell
   wsl --shutdown
   ```
4. Start WSL again and verify:
   ```bash
   ls -la /mnt/e/
   ```
   You should see Windows E: drive contents (e.g. `Seeds/`, repo folders).

---

## Path translation

| Windows     | WSL          |
|------------|--------------|
| `E:\`      | `/mnt/e/`    |
| `E:\Seeds\afloat` | `/mnt/e/Seeds/afloat` |

Use these paths when running commands from inside WSL (e.g. `cd /mnt/e/Seeds/afloat`, `npm run test`).

---

## Manual fallback (session only)

If you need E: mounted without changing `wsl.conf` (e.g. one-off session):

```bash
sudo mount -t drvfs E: /mnt/e -o metadata
ls /mnt/e/
```

You must run this after each WSL restart unless automount is configured above.

---

## Verification

From WSL after fix:

```bash
ls /mnt/e/Seeds/afloat   # or your repo path
cd /mnt/e/Seeds/afloat && npm run test && npm run lint
```

---

**Pattern reference:** For full status table and optional Python/uv steps, see GRID `docs/WSL_STATUS_AND_PENDING_STEPS.md`. For reusable patterns (status + pending steps, staging and commit), see GRID `docs/AGENT_INSIGHTS_AND_PATTERNS.md` **Section 4**.
