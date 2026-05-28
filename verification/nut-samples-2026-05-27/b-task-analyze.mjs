#!/usr/bin/env node
// B-task: .nut event-driven hypothesis verification (2026-05-27)
//
// HYPOTHESIS from earlier (looking at iceorbex.nut only):
//   "All .nut are event-driven hook scripts; no tick/update loops"
//
// SKEPTICAL TEST: sample 8 .nut across types and check:
//   1. Are there `while`/`for` main loops at top level? (not event-driven)
//   2. Are there function names like `tick`/`update`/`onTick`? (procedural)
//   3. Is the function name set the same across all .nut? (consistent contract)
//   4. Or do different .nut types have different event hooks?

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const txt = fs.readFileSync(path.join(HERE, 'all-193.jsonl'), 'utf8');
const parts = txt.split(/\n?---\n?/).filter(s => s.trim());
const nuts = new Map(); // path -> content
for (const p of parts) {
  try { const j = JSON.parse(p); if (j.type === 'text' && j.content) nuts.set(j.path, j.content); } catch {}
}

// Sample 8 .nut across types
const samples = [
  // Skill scripts (active)
  'sqr/character/atmage/iceorbex/iceorbex.nut',
  'sqr/character/atmage/elementalstrikeex/elementalstrikeex.nut',
  'sqr/character/atmage/manaburst/manaburst.nut',
  // Passive object (skill produces)
  'sqr/character/atmage/iceorbex/po_aticeorbex.nut',
  'sqr/passiveobject/character/priest/po_devilstrike_attack3.nut',
  // Appendage (buff/aura)
  'sqr/character/atmage/elementalchange/ap_atmage_elemental_change.nut',
  'sqr/appendage/character/ap_atmage_effect.nut',
  // Root-level init/load
  'sqr/loadstate.nut',
  'sqr/init_character.nut',
];

function analyze(path, content) {
  const lines = content.split(/\r?\n/);
  const functions = [];
  const topLevelLines = []; // non-function, non-comment, non-blank top-level lines
  let inFunc = false;
  let braceDepth = 0;
  let currentFn = null;
  let topLoopCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const trimmed = ln.trim();

    // function declaration
    const fnMatch = ln.match(/^\s*(?:local\s+)?function\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)/);
    if (fnMatch && braceDepth === 0) {
      currentFn = { name: fnMatch[1], args: fnMatch[2], startLine: i + 1, bodyOpen: false };
      functions.push(currentFn);
      inFunc = true;
      continue;
    }

    // Track braces (rough — strings/comments not handled but good enough)
    for (const c of ln) {
      if (c === '{') braceDepth++;
      else if (c === '}') braceDepth--;
    }

    if (braceDepth === 0 && inFunc) {
      currentFn.endLine = i + 1;
      currentFn.bodyLines = currentFn.endLine - currentFn.startLine + 1;
      inFunc = false;
      currentFn = null;
    }

    // Top-level (outside any function) — look for procedural code
    if (!inFunc && braceDepth === 0) {
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !/^function\b/.test(trimmed)) {
        topLevelLines.push({ line: i + 1, text: trimmed.slice(0, 120) });
        // Check for top-level loops (the smoking gun for procedural .nut)
        if (/^\s*(while|for|do)\s*\(/.test(ln) || /^\s*foreach\s*\(/.test(ln)) topLoopCount++;
      }
    }
  }

  // Extract sq_* API calls per function (which system does each fn touch?)
  const callsPerFn = {};
  for (const fn of functions) {
    const body = lines.slice(fn.startLine, fn.endLine || fn.startLine + 1).join('\n');
    const calls = new Set();
    const m = body.matchAll(/\bsq_[A-Za-z_]\w*/g);
    for (const x of m) calls.add(x[0]);
    callsPerFn[fn.name] = [...calls];
  }

  return { path, lines: lines.length, functions, topLevelLines, topLoopCount, callsPerFn };
}

console.log('=== B-task: 9 .nut structural analysis ===\n');

for (const path of samples) {
  const content = nuts.get(path);
  if (!content) { console.log('SKIP (not in jsonl): ' + path); continue; }
  const r = analyze(path, content);
  console.log('--- ' + path + ' (' + r.lines + ' lines) ---');
  console.log('  top-level code lines (outside any function): ' + r.topLevelLines.length);
  console.log('  top-level loop statements (while/for/foreach): ' + r.topLoopCount);
  console.log('  function count: ' + r.functions.length);
  for (const fn of r.functions) {
    const calls = r.callsPerFn[fn.name] || [];
    const bodyLines = fn.bodyLines || '?';
    console.log('    fn ' + fn.name + '(' + fn.args + ')  L' + fn.startLine + '..L' + (fn.endLine || '?') + ' [' + bodyLines + ' lines]  sq_ calls=' + calls.length);
    if (calls.length > 0 && calls.length <= 8) {
      console.log('      → ' + calls.slice(0, 8).join(', '));
    } else if (calls.length > 8) {
      console.log('      → ' + calls.slice(0, 8).join(', ') + ', ...');
    }
  }
  // Top-level code preview
  if (r.topLevelLines.length > 0 && r.topLevelLines.length <= 15) {
    console.log('  top-level code:');
    for (const t of r.topLevelLines) console.log('    L' + t.line + ': ' + t.text);
  } else if (r.topLevelLines.length > 15) {
    console.log('  top-level code (first 6 of ' + r.topLevelLines.length + '):');
    for (const t of r.topLevelLines.slice(0, 6)) console.log('    L' + t.line + ': ' + t.text);
  }
  console.log('');
}

// Cross-file function name set analysis
console.log('=== Function name patterns across samples ===');
const allFnNames = {};
for (const path of samples) {
  const content = nuts.get(path);
  if (!content) continue;
  const r = analyze(path, content);
  for (const fn of r.functions) {
    if (!allFnNames[fn.name]) allFnNames[fn.name] = [];
    allFnNames[fn.name].push(path.split('/').pop());
  }
}
// Group by name PREFIX (event handler convention)
const prefixGroups = {};
for (const name of Object.keys(allFnNames)) {
  const m = name.match(/^(on|check|get|set|init|sq_)([A-Z])/);
  const prefix = m ? m[1] : '(none)';
  if (!prefixGroups[prefix]) prefixGroups[prefix] = [];
  prefixGroups[prefix].push(name);
}
for (const [p, names] of Object.entries(prefixGroups).sort((a, b) => b[1].length - a[1].length)) {
  console.log('  prefix "' + p + '" (' + names.length + ' fns): ' + names.slice(0, 10).join(', ') + (names.length > 10 ? ', ...' : ''));
}
