// .claude/hooks/reset-status.mjs
// SessionStart / UserPromptSubmit hook: 重置 .claude/status.json 为初始占位值
// statusline.sh 读取该文件展示 task / conf 字段
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const target = resolve(process.cwd(), '.claude/status.json');
const payload = { progress: '0/?', confidence: '评估中' };

try {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(payload, null, 2) + '\n', 'utf8');
} catch (err) {
  // hook 失败不应阻塞任何工作流
  process.stderr.write(`reset-status: ${err.message}\n`);
}
