#!/usr/bin/env node
// Wrapper for preview_start compatibility: strips --dir <path> before passing to next dev
void (async () => {
  const { spawn } = await import('node:child_process');
  const args = process.argv.slice(2).filter((a, i, arr) => {
    if (a === '--dir') return false;
    if (arr[i - 1] === '--dir') return false;
    return true;
  });
  const child = spawn('node', ['node_modules/next/dist/bin/next', 'dev', ...args], {
    stdio: 'inherit',
    cwd: __dirname,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
})();
