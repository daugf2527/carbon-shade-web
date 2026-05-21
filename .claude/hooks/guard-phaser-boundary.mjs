// .claude/hooks/guard-phaser-boundary.mjs
// PreToolUse hook: block Phaser imports in src/combat/
import { readFileSync } from 'node:fs';

const p = (process.env.CLAUDE_FILE_PATH || '').replace(/\\/g, '/');
if (/^src\/combat\//.test(p)) {
  try {
    const content = readFileSync(process.env.CLAUDE_NEW_CONTENT || p, 'utf8');
    const hasPhaserImport = /from\s+['"]phaser/.test(content) || /import\s.*phaser/i.test(content);
    if (hasPhaserImport) {
      process.stdout.write('BLOCK: src/combat/ 禁止引入 Phaser — 战斗内核必须保持纯 TS');
      process.exit(2);
    }
  } catch (e) {
    // file not readable yet — skip check
  }
}
