#!/usr/bin/env node
/**
 * batch-a-fetch.mjs — Neople API Batch A Data Fetch
 *
 * Fetches level 1–10+ skill data from the Neople Open API for all
 * DNF-mapped Berserker actions in Combat Lab.
 *
 * Usage:
 *   export NEOPLE_API_KEY="your-api-key"
 *   node scripts/batch-a-fetch.mjs
 *
 * Output:
 *   src/data/api/raw/          — raw API JSON per skill
 *   src/data/api/skills.json   — normalized multi-skill data
 *
 * Self-contained: no TS compilation, no npm dependencies needed.
 * Requires Node.js >= 18 (uses fetch, fs, path, timers/promises).
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

// ─── Paths ───────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RAW_DIR = join(ROOT, "src", "data", "api", "raw");
const SKILLS_OUT = join(ROOT, "src", "data", "api", "skills.json");
const CAPTURED_AT = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ─── API Constants ───────────────────────────────────────────────────────────
const API_BASE = "https://api.neople.co.kr";
const JOB_ID = "41f1cdc2ff58bb5fdc287be0db2a8df3"; // Male Slayer
const JOB_GROW_ID = "6d459bc74ba73ee4fe5cdc4655400193"; // Neo Berserker

// ─── Skill Mapping ───────────────────────────────────────────────────────────
// Tier 1: skills with known skillId hashes (4 verified, 7 placeholder)
// Placeholder hashes marked with "..." are NOT real — they must be resolved
// from the skill list endpoint before fetching.
const TIER1_KNOWN = new Map([
  ["UpwardSlash",     "fc7a3f4c2852c832a2f20af63d5d212f"],
  ["MountainousWheel", "6e33d47e6622ce03b6defdd912140270"],
  ["RagingFury",       "506e7ed77d517419a6e1c437a2cedb17"],
  ["Bloodlust",        "3829c15bf5f520c13998a3479ba0ce7b"],
]);

// Tier 1 placeholder skills — need name→skillId resolution from skill list
const TIER1_PLACEHOLDERS = [
  { action: "Derange",      officialName: "폭주" },
  { action: "Diehard",      officialName: "다이하드" },
  { action: "Frenzy",       officialName: "프렌지" },
  { action: "BloodyCross",  officialName: "혈십자" },
  { action: "VimAndVigor",  officialName: "혈기왕성" },
  { action: "QuickRebound", officialName: "퀵 스탠딩" },
  { action: "Backstep",     officialName: "백스텝" },
];

// Tier 2: Combat Lab 0.3 skills — need name→skillId resolution
const TIER2 = [
  { action: "GoreCross",        officialName: "고어 크로스" },
  { action: "OutrageBreak",     officialName: "아웃레이지 브레이크" },
  { action: "ExtremeOverkill",  officialName: "익스트림 오버킬" },
  { action: "RagingFury2",      officialName: null, note: "Upgraded Raging Fury — may share skillId or not exist in API" },
  { action: "BloodRuin",        officialName: "블러드 루인" },
  { action: "BloodSword",       officialName: "블러드 소드" },
  { action: "BurstFury",        officialName: "버스트 퓨리" },
  { action: "EarthShatter",     officialName: "어스 섀터" },
  { action: "Thirst",           officialName: "갈증" },
  { action: "BloodMemory",      officialName: "블러드 메모리" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const BLUE = (s) => `\x1b[34m${s}\x1b[0m`;
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const RED = (s) => `\x1b[31m${s}\x1b[0m`;

function checkApiKey() {
  const key = process.env.NEOPLE_API_KEY;
  if (!key || key.trim() === "") {
    console.error(RED("ERROR: NEOPLE_API_KEY environment variable is not set."));
    console.error("Usage: export NEOPLE_API_KEY='your-api-key' && node scripts/batch-a-fetch.mjs");
    process.exit(1);
  }
  return key.trim();
}

/**
 * Fetch with retry + exponential backoff.
 * @param {string} url
 * @param {number} retries
 * @returns {Promise<{ok: boolean, status: number, data: object|null}>}
 */
async function apiFetch(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      // Rate limit hit (HTTP 429)
      if (res.status === 429) {
        const wait = attempt * 10000; // 10s, 20s, 30s
        console.warn(YELLOW(`  Rate limited (HTTP 429). Waiting ${wait / 1000}s (attempt ${attempt}/${retries})...`));
        await sleep(wait);
        continue;
      }
      // Other client/server errors
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.warn(YELLOW(`  HTTP ${res.status} (attempt ${attempt}/${retries}): ${body.slice(0, 200)}`));
        if (attempt < retries) {
          await sleep(attempt * 2000);
          continue;
        }
        return { ok: false, status: res.status, data: null };
      }
      const data = await res.json();
      return { ok: true, status: res.status, data };
    } catch (err) {
      console.warn(YELLOW(`  Network error (attempt ${attempt}/${retries}): ${err.message}`));
      if (attempt < retries) {
        await sleep(attempt * 2000);
        continue;
      }
      return { ok: false, status: 0, data: null };
    }
  }
  return { ok: false, status: 0, data: null };
}

/**
 * Save a JSON object to a file, creating parent directories as needed.
 */
function saveJson(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ─── Step 1: Fetch skill list (resolve name → skillId) ────────────────────────
async function fetchSkillList(apiKey) {
  console.log(BLUE("\n[1/3] Fetching Neo Berserker skill list..."));
  const url = `${API_BASE}/df/skills/${JOB_ID}?jobGrowId=${JOB_GROW_ID}&apikey=${apiKey}`;
  const { ok, status, data } = await apiFetch(url);

  if (!ok) {
    console.error(RED(`  Failed to fetch skill list (HTTP ${status}). Cannot resolve placeholder skill IDs.`));
    return null;
  }

  const skills = data?.skills || [];
  console.log(GREEN(`  Got ${skills.length} skills from API.`));

  // Build name→skillId map (skill names are in Korean)
  const nameToId = new Map();
  for (const sk of skills) {
    if (sk?.skillId && sk?.name) {
      nameToId.set(sk.name.trim(), sk.skillId);
    }
  }

  // Save raw skill list
  saveJson(join(RAW_DIR, "_skill_list.json"), {
    capturedAt: CAPTURED_AT,
    jobId: JOB_ID,
    jobGrowId: JOB_GROW_ID,
    skillCount: skills.length,
    skills: skills.map((s) => ({ skillId: s.skillId, name: s.name })),
  });
  console.log(GREEN("  Saved raw skill list to src/data/api/raw/_skill_list.json"));

  return nameToId;
}

// ─── Step 2: Fetch individual skill detail ────────────────────────────────────
async function fetchSkillDetail(apiKey, skillId, actionName) {
  const url = `${API_BASE}/df/skills/${JOB_ID}/${skillId}?apikey=${apiKey}`;
  const { ok, status, data } = await apiFetch(url);

  if (!ok) {
    return { ok: false, status, data: null, actionName, skillId };
  }

  // Save raw response
  saveJson(join(RAW_DIR, `${actionName}.json`), {
    capturedAt: CAPTURED_AT,
    apiEndpoint: `/df/skills/${JOB_ID}/${skillId}`,
    ...data,
  });

  // Normalize levels into a flat structure
  const levels = {};
  const rawLevels = data?.levels ?? [];
  for (const lv of rawLevels) {
    levels[lv.level] = {
      level: lv.level,
      consumeMp: lv.consumeMp ?? null,
      coolTime: lv.coolTime ?? null,
      castingTime: lv.castingTime ?? null,
      description: lv.description ?? "",
      optionValue: lv.optionValue ?? {},
    };
  }

  return {
    ok: true,
    status,
    actionName,
    skillId,
    skillName: data?.name ?? "",
    maxLevel: data?.maxLevel ?? rawLevels.length,
    requiredLevel: data?.requiredLevel ?? 1,
    levels,
  };
}

// ─── Step 3: Normalize all data ───────────────────────────────────────────────
function normalizeOutput(results) {
  const skills = {};
  for (const r of results) {
    if (r.ok) {
      skills[r.actionName] = {
        skillId: r.skillId,
        skillName: r.skillName,
        maxLevel: r.maxLevel,
        requiredLevel: r.requiredLevel,
        levels: r.levels,
      };
    } else {
      skills[r.actionName] = {
        skillId: r.skillId,
        error: `HTTP ${r.status}`,
        levels: {},
      };
    }
  }
  return {
    capturedAt: CAPTURED_AT,
    version: "batch-a-v1",
    jobId: JOB_ID,
    jobGrowId: JOB_GROW_ID,
    source: "Neople Open API /df/skills/{jobId}/{skillId}",
    note: "Level data from official API. Frame windows, hitbox geometry, and AI parameters are not covered by this endpoint.",
    skills,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const apiKey = checkApiKey();

  // Ensure output directories exist
  mkdirSync(RAW_DIR, { recursive: true });

  // Step 1: Get skill list
  const nameToId = await fetchSkillList(apiKey);
  if (!nameToId) {
    console.error(RED("Aborting: could not retrieve skill list."));
    process.exit(1);
  }

  // Build final fetch queue: start with known IDs
  /** @type {{action: string, skillId: string|null, officialName: string|null}[]} */
  const queue = [];

  // Tier 1 verified
  for (const [action, skillId] of TIER1_KNOWN) {
    queue.push({ action, skillId, officialName: null });
  }

  // Tier 1 placeholders — resolve via name
  for (const { action, officialName } of TIER1_PLACEHOLDERS) {
    const skillId = nameToId.get(officialName);
    if (skillId) {
      queue.push({ action, skillId, officialName });
      console.log(GREEN(`  Resolved ${action} → ${officialName} → ${skillId}`));
    } else {
      console.warn(YELLOW(`  WARNING: Could not find "${officialName}" in skill list for ${action}. Skipping.`));
      queue.push({ action, skillId: null, officialName });
    }
  }

  // Tier 2 — resolve via name
  for (const { action, officialName } of TIER2) {
    if (!officialName) {
      console.warn(YELLOW(`  WARNING: No official name for ${action} (RagingFury2 may not have separate API entry). Skipping.`));
      queue.push({ action, skillId: null, officialName: null });
      continue;
    }
    const skillId = nameToId.get(officialName);
    if (skillId) {
      queue.push({ action, skillId, officialName });
      console.log(GREEN(`  Resolved ${action} → ${officialName} → ${skillId}`));
    } else {
      // Try partial match (API names might differ from our guesses)
      let found = false;
      for (const [name, id] of nameToId) {
        if (name.includes(officialName) || officialName.includes(name)) {
          queue.push({ action, skillId: id, officialName: name });
          console.log(GREEN(`  Partial match: ${action} → "${name}" → ${id}`));
          found = true;
          break;
        }
      }
      if (!found) {
        console.warn(YELLOW(`  WARNING: Could not find "${officialName}" in skill list for ${action}. Skipping.`));
        queue.push({ action, skillId: null, officialName });
      }
    }
  }

  // Step 2: Fetch details for all resolved skills
  console.log(BLUE(`\n[2/3] Fetching detail for ${queue.filter((q) => q.skillId).length} skills...`));

  const results = [];
  const fetchable = queue.filter((q) => q.skillId);

  for (let i = 0; i < fetchable.length; i++) {
    const { action, skillId, officialName } = fetchable[i];
    const label = officialName ? `${action} (${officialName})` : action;
    console.log(BLUE(`  [${i + 1}/${fetchable.length}] Fetching ${label}...`));

    const result = await fetchSkillDetail(apiKey, skillId, action);
    if (result.ok) {
      const levelCount = Object.keys(result.levels).length;
      console.log(GREEN(`    OK — ${levelCount} levels`));
    } else {
      console.warn(RED(`    FAILED — HTTP ${result.status}`));
    }
    results.push(result);

    // Be polite to the API — 500ms delay between requests
    if (i < fetchable.length - 1) {
      await sleep(500);
    }
  }

  // Add skipped skills to results
  for (const q of queue) {
    if (!q.skillId && !results.find((r) => r.actionName === q.action)) {
      results.push({
        ok: false,
        status: 0,
        actionName: q.action,
        skillId: null,
        skillName: "",
        maxLevel: 0,
        requiredLevel: 0,
        levels: {},
        error: "Skipped — no skillId resolved",
      });
    }
  }

  // Step 3: Normalize and save
  console.log(BLUE("\n[3/3] Normalizing and saving..."));
  const normalized = normalizeOutput(results);
  saveJson(SKILLS_OUT, normalized);
  console.log(GREEN(`  Saved ${Object.keys(normalized.skills).length} skills to src/data/api/skills.json`));

  // Summary
  const success = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(BLUE("\n─".repeat(50)));
  console.log(BLUE(`Done. ${success} succeeded, ${failed} failed/skipped.`));
  console.log(BLUE(`Raw data:    ${RAW_DIR}`));
  console.log(BLUE(`Normalized: ${SKILLS_OUT}`));
  console.log(BLUE("─".repeat(50)));

  if (failed > 0) {
    console.warn(YELLOW("\nFailed/skipped skills:"));
    for (const r of results) {
      if (!r.ok) {
        console.warn(YELLOW(`  - ${r.actionName}: ${r.error || `HTTP ${r.status}`}`));
      }
    }
  }
}

main().catch((err) => {
  console.error(RED("FATAL: " + err.message));
  process.exit(1);
});
