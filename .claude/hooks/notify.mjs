// Notification hook: BurntToast (Windows) → msg fallback / termux-notification (Android).
// Reads JSON event from stdin, extracts message field.
// 2026-05-27: added Termux/Android branch (process.platform === 'android').
// 2026-05-28: switched execSync template strings → spawnSync array form to eliminate
//             theoretical shell-injection surface (input is trusted but defense-in-depth).
import { execSync, spawnSync } from 'node:child_process';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  let msg = 'Claude Code event';
  try {
    const j = JSON.parse(input);
    if (typeof j.message === 'string') msg = j.message;
  } catch {
    const m = input.match(/"message"\s*:\s*"([^"]*)"/);
    if (m) msg = m[1];
  }
  msg = msg.slice(0, 100);

  // Termux/Android: termux-notification (requires `pkg install termux-api`)
  if (process.platform === 'android') {
    spawnSync('termux-notification', ['--title', 'Claude Code', '--content', msg], { stdio: 'ignore' });
    return;
  }

  // Windows: BurntToast → msg fallback
  // PowerShell args still need to embed `msg` as a literal inside the -Command string,
  // so escape single quotes by doubling them (PowerShell convention).
  const psMsg = msg.replace(/'/g, "''");
  try {
    const probe = execSync(
      'powershell.exe -NoProfile -Command "Get-Module -ListAvailable BurntToast | Select-Object -ExpandProperty Name"',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    if (probe.includes('BurntToast')) {
      spawnSync('powershell.exe', [
        '-NoProfile',
        '-Command',
        `New-BurntToastNotification -Text 'Claude Code', '${psMsg}'`,
      ], { stdio: 'ignore' });
      return;
    }
  } catch { /* fall through to msg */ }

  spawnSync('msg', [process.env.USERNAME || '*', `Claude Code: ${msg}`], { stdio: 'ignore' });
});
