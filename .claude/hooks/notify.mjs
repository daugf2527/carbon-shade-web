// Notification hook: BurntToast (Windows) → msg fallback.
// Reads JSON event from stdin, extracts message field.
import { execSync } from 'node:child_process';

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
  msg = msg.slice(0, 100).replace(/'/g, '').replace(/"/g, '');

  try {
    const probe = execSync(
      'powershell.exe -NoProfile -Command "Get-Module -ListAvailable BurntToast | Select-Object -ExpandProperty Name"',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    if (probe.includes('BurntToast')) {
      execSync(
        `powershell.exe -NoProfile -Command "New-BurntToastNotification -Text 'Claude Code', '${msg}'"`,
        { stdio: 'ignore' }
      );
      return;
    }
  } catch { /* fall through to msg */ }

  try {
    execSync(`msg "%USERNAME%" "Claude Code: ${msg}"`, { stdio: 'ignore' });
  } catch { /* swallow */ }
});
