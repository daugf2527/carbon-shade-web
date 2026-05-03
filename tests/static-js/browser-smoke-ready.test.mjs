import assert from 'node:assert/strict';
import { detectViteReadyUrl } from '../../scripts/browser-smoke.mjs';

const ansiLocalLine = '  \u001b[32m➜\u001b[39m  \u001b[1mLocal\u001b[22m:   \u001b[36mhttp://localhost:\u001b[1m5175\u001b[22m/carbon-shade-web/\u001b[39m\n';
assert.equal(
  detectViteReadyUrl(ansiLocalLine),
  'http://localhost:5175/carbon-shade-web/',
  'Vite ready parser should ignore ANSI escape codes and return the actual local URL'
);

assert.equal(
  detectViteReadyUrl('  Local:   http://localhost:5173/carbon-shade-web/\n'),
  'http://localhost:5173/carbon-shade-web/',
  'Vite ready parser should keep working for plain output'
);

assert.equal(
  detectViteReadyUrl('Port 5173 is in use, trying another one...\n'),
  null,
  'Vite ready parser should not treat pre-ready port messages as readiness'
);

console.log('browser smoke ready parser tests passed');
