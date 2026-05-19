#!/usr/bin/env node
/**
 * event-trace.mjs — Scan source files for event emitter/listener pairs.
 *
 * Usage:
 *   node tools/event-trace.mjs [--src <dir>] [--output json|md]
 *
 * Extensibility:
 *   Add patterns to EMITTER_PATTERNS / LISTENER_PATTERNS arrays below.
 *   Each pattern is a regex whose FIRST capture group is the event name.
 *   The regex is applied line-by-line; file:line are extracted automatically.
 *
 * Output (JSON):
 *   { events: [{ name, emitters: [{file,line}], listeners: [{file,line}] }] }
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Configurable patterns ──────────────────────────────────────────────
// Add new patterns here as the project grows (e.g. signal.connect, dispatch, etc.)

const EMITTER_PATTERNS = [
  // bus.emit("EventName", ...)
  /\.emit\(\s*["']([^"']+)["']/g,
  // Future: signal.emit, dispatch("EventName"), etc.
  // /signal\.emit\(\s*["']([^"']+)["']/g,
];

const LISTENER_PATTERNS = [
  // bus.on("EventName", ...)
  /\.on\(\s*["']([^"']+)["']/g,
  // Future: signal.connect, bus.once, bus.subscribe, etc.
  // /\.once\(\s*["']([^"']+)["']/g,
];

// Filter: event names matching these regexes are excluded
const EXCLUDE_EVENTS = [
  /^pointer/,        // Phaser input pointers (pointerdown, pointermove, etc.)
  /^gameobject/,     // Phaser gameobject events
  /^changedata/,     // Phaser data change events
];

// ── File scanning ──────────────────────────────────────────────────────

function* walkDir(dir, extensions = [".ts", ".tsx", ".mjs", ".js"]) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = resolve(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" || e.name === ".tmp") continue;
      yield* walkDir(full, extensions);
    } else if (extensions.includes(extname(e.name))) {
      yield full;
    }
  }
}

function linesOf(filePath) {
  try {
    return readFileSync(filePath, "utf-8").split("\n");
  } catch {
    return [];
  }
}

function shouldExclude(eventName) {
  return EXCLUDE_EVENTS.some(r => r.test(eventName));
}

// ── Main ───────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const srcDir = args.includes("--src") ? args[args.indexOf("--src") + 1] : "src";
  const outputFmt = args.includes("--output") ? args[args.indexOf("--output") + 1] : "json";

  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const absSrc = resolve(projectRoot, srcDir);

  // Collect all emit/listen sites
  const emitters = new Map();  // eventName → [{file,line}]
  const listeners = new Map(); // eventName → [{file,line}]

  for (const file of walkDir(absSrc)) {
    const relPath = relative(projectRoot, file);
    const lines = linesOf(file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      for (const pattern of EMITTER_PATTERNS) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(line)) !== null) {
          const name = m[1];
          if (shouldExclude(name)) continue;
          if (!emitters.has(name)) emitters.set(name, []);
          emitters.get(name).push({ file: relPath, line: lineNum });
        }
      }

      for (const pattern of LISTENER_PATTERNS) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(line)) !== null) {
          const name = m[1];
          if (shouldExclude(name)) continue;
          if (!listeners.has(name)) listeners.set(name, []);
          listeners.get(name).push({ file: relPath, line: lineNum });
        }
      }
    }
  }

  // Pair emitters with listeners by event name
  const allEventNames = new Set([...emitters.keys(), ...listeners.keys()]);
  const events = [...allEventNames].sort().map(name => ({
    name,
    emitters: emitters.get(name) || [],
    listeners: listeners.get(name) || [],
  }));

  // Stats
  const paired = events.filter(e => e.emitters.length > 0 && e.listeners.length > 0);
  const emitOnly = events.filter(e => e.emitters.length > 0 && e.listeners.length === 0);
  const listenOnly = events.filter(e => e.emitters.length === 0 && e.listeners.length > 0);

  if (outputFmt === "md") {
    console.log("# Event Bus Trace\n");
    console.log(`**Total events**: ${events.length} | **Paired**: ${paired.length} | **Emit-only**: ${emitOnly.length} | **Listen-only**: ${listenOnly.length}\n`);

    console.log("## Paired Events\n");
    console.log("| Event | Emitters | Listeners |");
    console.log("|-------|----------|-----------|");
    for (const e of paired) {
      const emitSites = e.emitters.map(s => `${s.file}:${s.line}`).join("<br>");
      const listenSites = e.listeners.map(s => `${s.file}:${s.line}`).join("<br>");
      console.log(`| \`${e.name}\` | ${emitSites} | ${listenSites} |`);
    }

    if (emitOnly.length > 0) {
      console.log("\n## Emit-only (no listener found)\n");
      for (const e of emitOnly) {
        console.log(`- \`${e.name}\` — ${e.emitters.map(s => `${s.file}:${s.line}`).join(", ")}`);
      }
    }

    if (listenOnly.length > 0) {
      console.log("\n## Listen-only (no emitter found)\n");
      for (const e of listenOnly) {
        console.log(`- \`${e.name}\` — ${e.listeners.map(s => `${s.file}:${s.line}`).join(", ")}`);
      }
    }
  } else {
    console.log(JSON.stringify({ events, stats: { total: events.length, paired: paired.length, emitOnly: emitOnly.length, listenOnly: listenOnly.length } }, null, 2));
  }
}

main();
