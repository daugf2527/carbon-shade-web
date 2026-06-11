# Documentation Pruning And Narrative Convergence Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prune stale Markdown documents, converge documentation entry points, and lock future project language to a smaller set of authoritative docs.

**Architecture:** Treat docs like code: keep a small authoritative trunk, archive stale branches, and replace repeated narrative with links to the trunk. The implementation path is audit first, then index cleanup, then high-noise document consolidation, then review-gate updates so drift does not return.

**Tech Stack:** Markdown docs, Node.js static tests, existing audit docs, `npm run static:test`, `npm run consistency`.

---

### Task 1: Define The Pruning Policy And Canonical Entry Points

**Files:**
- Create: `docs/engineering/documentation-pruning-policy.md`
- Modify: `docs/README.md`
- Modify: `docs/engineering/sot-map.md`
- Test: `tests/static/documentation-pruning-policy.test.ts`

**Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();
const policy = readFileSync(
  join(ROOT, "docs", "engineering", "documentation-pruning-policy.md"),
  "utf-8",
);
const docsReadme = readFileSync(join(ROOT, "docs", "README.md"), "utf-8");
const sot = readFileSync(join(ROOT, "docs", "engineering", "sot-map.md"), "utf-8");

for (const needle of [
  "# Documentation Pruning Policy",
  "## Canonical Trunk Docs",
  "## Archive Rules",
  "## Narrative Rules",
]) {
  assert.ok(policy.includes(needle), `policy should include ${needle}`);
}

for (const needle of [
  "2026-06-04-engine-native-rewrite-roadmap.md",
  "combat-retirement-audit-2026-06-10.md",
  "documentation-pruning-policy.md",
]) {
  assert.ok(docsReadme.includes(needle), `docs README should point at ${needle}`);
}

assert.ok(
  sot.includes("documentation-pruning-policy.md"),
  "sot map should point to the pruning policy for doc ownership rules",
);
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run static:test
```

Expected: FAIL because the new policy doc and test do not exist yet.

**Step 3: Write minimal implementation**

Create `docs/engineering/documentation-pruning-policy.md`:

```md
# Documentation Pruning Policy

## Purpose

Carbon Shade has too many parallel markdown narratives.
This policy defines which docs stay authoritative, which docs become archive-only,
and how future docs must reference trunk docs instead of repeating them.

## Canonical Trunk Docs

The current trunk docs are:

- `docs/README.md`
- `docs/planning/2026-06-04-engine-native-rewrite-roadmap.md`
- `docs/engineering/combat-retirement-audit-2026-06-10.md`
- `docs/engineering/p5-static-blocker-matrix-2026-06-10.md`
- `docs/engineering/sot-map.md`

Any new overview doc should point to these before inventing a parallel summary.

## Archive Rules

Move a doc to archive/historical posture if one of these is true:

1. it describes an implementation path already replaced by a newer path
2. it repeats another doc's decisions with weaker freshness
3. it references runtime ownership that has already moved
4. it is useful as evidence but no longer useful as an entry point

Archived docs may stay on disk, but must be labeled clearly and must not be used as entry docs.

## Narrative Rules

1. One trunk doc per topic.
2. Other docs link upward instead of restating the same narrative.
3. Do not let `docs/README.md` keep historical skeletons as if they were current.
4. If a doc mixes current state and history, split it or mark one side explicitly.
5. Future docs must say whether they are trunk, supporting, or archive.
```

Modify `docs/README.md` so the top section no longer says the index is still based on an outdated master-era skeleton. Replace that warning block with a shorter current-state entry block that points to:

- `planning/2026-06-04-engine-native-rewrite-roadmap.md`
- `engineering/combat-retirement-audit-2026-06-10.md`
- `engineering/p5-static-blocker-matrix-2026-06-10.md`
- `engineering/documentation-pruning-policy.md`

Modify `docs/engineering/sot-map.md` by adding one bullet in the actionable suggestions section:

```md
7. 文档入口漂移时，以 `docs/engineering/documentation-pruning-policy.md` 作为口径收口规则，不再让 `docs/README.md` 承担历史总汇编角色。
```

Create `tests/static/documentation-pruning-policy.test.ts` using the code from Step 1.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run static:test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/engineering/documentation-pruning-policy.md docs/README.md docs/engineering/sot-map.md tests/static/documentation-pruning-policy.test.ts
git commit -m "docs: define pruning policy and current entry points"
```

### Task 2: Audit And Relabel High-Noise Docs Instead Of Letting Them Speak As Current

**Files:**
- Modify: `docs/engineering/architecture-overview.md`
- Modify: `docs/engineering/architecture-improvement-plan.md`
- Modify: `docs/design/stage3-combat-system-survey.md`
- Modify: `docs/engineering/data-contract-baseline.md`
- Test: `tests/static/documentation-currentness-labels.test.ts`

**Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();

const checks = [
  ["docs/engineering/architecture-overview.md", "Status:"],
  ["docs/engineering/architecture-improvement-plan.md", "Status:"],
  ["docs/design/stage3-combat-system-survey.md", "Status:"],
  ["docs/engineering/data-contract-baseline.md", "Status:"],
];

for (const [file, needle] of checks) {
  const source = readFileSync(join(ROOT, file), "utf-8");
  assert.ok(source.includes(needle), `${file} should declare ${needle}`);
  assert.ok(
    source.includes("Authoritative successor:"),
    `${file} should point readers to an authoritative successor`,
  );
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run static:test
```

Expected: FAIL because those docs do not yet declare their currentness labels.

**Step 3: Write minimal implementation**

Add a short frontmatter-style banner near the top of each file:

For `docs/engineering/architecture-overview.md`:

```md
> Status: supporting snapshot
> Authoritative successor: `docs/planning/2026-06-04-engine-native-rewrite-roadmap.md`
> Notes: keep for historical layer mapping, not for current migration status.
```

For `docs/engineering/architecture-improvement-plan.md`:

```md
> Status: superseded planning snapshot
> Authoritative successor: `docs/planning/2026-06-04-engine-native-rewrite-roadmap.md`
> Notes: preserve for pre-engine-native refactor context only.
```

For `docs/design/stage3-combat-system-survey.md`:

```md
> Status: research snapshot
> Authoritative successor: `docs/engineering/combat-retirement-audit-2026-06-10.md`
> Notes: useful for forensic reading, not for present ownership decisions.
```

For `docs/engineering/data-contract-baseline.md`:

```md
> Status: supporting evidence snapshot
> Authoritative successor: `docs/engineering/combat-retirement-audit-2026-06-10.md`
> Notes: keep as field evidence, not as a current runtime ownership map.
```

Create `tests/static/documentation-currentness-labels.test.ts` using the code from Step 1.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run static:test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/engineering/architecture-overview.md docs/engineering/architecture-improvement-plan.md docs/design/stage3-combat-system-survey.md docs/engineering/data-contract-baseline.md tests/static/documentation-currentness-labels.test.ts
git commit -m "docs: relabel stale architecture narratives"
```

### Task 3: Converge The Engine Migration Narrative Into One Trunk

**Files:**
- Modify: `docs/README.md`
- Modify: `docs/planning/2026-06-04-engine-native-rewrite-roadmap.md`
- Modify: `docs/engineering/combat-retirement-audit-2026-06-10.md`
- Modify: `docs/engineering/p5-static-blocker-matrix-2026-06-10.md`
- Test: `tests/static/engine-doc-trunk-links.test.ts`

**Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();
const roadmap = readFileSync(
  join(ROOT, "docs", "planning", "2026-06-04-engine-native-rewrite-roadmap.md"),
  "utf-8",
);
const audit = readFileSync(
  join(ROOT, "docs", "engineering", "combat-retirement-audit-2026-06-10.md"),
  "utf-8",
);
const blocker = readFileSync(
  join(ROOT, "docs", "engineering", "p5-static-blocker-matrix-2026-06-10.md"),
  "utf-8",
);

assert.ok(
  roadmap.includes("Canonical companion docs"),
  "roadmap should declare its companion docs",
);
assert.ok(
  audit.includes("Canonical trunk"),
  "retirement audit should declare trunk placement",
);
assert.ok(
  blocker.includes("Canonical trunk"),
  "static blocker matrix should declare trunk placement",
);
assert.ok(
  audit.includes("p5-static-blocker-matrix-2026-06-10.md"),
  "retirement audit should point to the blocker matrix",
);
assert.ok(
  blocker.includes("combat-retirement-audit-2026-06-10.md"),
  "blocker matrix should point back to the retirement audit",
);
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run static:test
```

Expected: FAIL because the trunk-link language does not exist yet.

**Step 3: Write minimal implementation**

Modify `docs/planning/2026-06-04-engine-native-rewrite-roadmap.md` by adding a short section near the top:

```md
## Canonical companion docs

- migration trunk: `docs/planning/2026-06-04-engine-native-rewrite-roadmap.md`
- retirement evidence: `docs/engineering/combat-retirement-audit-2026-06-10.md`
- static blocker inventory: `docs/engineering/p5-static-blocker-matrix-2026-06-10.md`

Do not create another overview doc for this same topic unless one of these three roles changes.
```

Modify `docs/engineering/combat-retirement-audit-2026-06-10.md` by adding:

```md
> Canonical trunk: retirement evidence for P5 combat removal.
> Companion inventory: `docs/engineering/p5-static-blocker-matrix-2026-06-10.md`
> Higher-level roadmap: `docs/planning/2026-06-04-engine-native-rewrite-roadmap.md`
```

Modify `docs/engineering/p5-static-blocker-matrix-2026-06-10.md` by adding:

```md
> Canonical trunk: static blocker inventory for P5 combat removal.
> Evidence source: `docs/engineering/combat-retirement-audit-2026-06-10.md`
> Higher-level roadmap: `docs/planning/2026-06-04-engine-native-rewrite-roadmap.md`
```

Modify `docs/README.md` to collapse any repeated summary prose for engine migration into one short “follow this chain” list pointing at the three trunk docs above.

Create `tests/static/engine-doc-trunk-links.test.ts` using the code from Step 1.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run static:test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/README.md docs/planning/2026-06-04-engine-native-rewrite-roadmap.md docs/engineering/combat-retirement-audit-2026-06-10.md docs/engineering/p5-static-blocker-matrix-2026-06-10.md tests/static/engine-doc-trunk-links.test.ts
git commit -m "docs: converge engine migration narrative"
```

### Task 4: Add A Lightweight Doc Drift Gate So The Noise Does Not Grow Back

**Files:**
- Modify: `.github/pull_request_template.md`
- Modify: `docs/engineering/03-development-workflow-v0.1.md`
- Test: `tests/static/documentation-review-gate.test.ts`

**Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert } from "./test-utils.js";

const ROOT = process.cwd();
const prTemplate = readFileSync(join(ROOT, ".github", "pull_request_template.md"), "utf-8");
const workflow = readFileSync(
  join(ROOT, "docs", "engineering", "03-development-workflow-v0.1.md"),
  "utf-8",
);

for (const needle of [
  "Documentation pruning / convergence",
  "entry doc updated",
  "duplicate narrative avoided",
]) {
  assert.ok(prTemplate.includes(needle), `PR template should mention ${needle}`);
}

for (const needle of [
  "documentation-pruning-policy.md",
  "entry doc",
  "duplicate narrative",
]) {
  assert.ok(workflow.includes(needle), `workflow doc should mention ${needle}`);
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run static:test
```

Expected: FAIL because the review gate text does not exist yet.

**Step 3: Write minimal implementation**

Modify `.github/pull_request_template.md` by adding a short section:

```md
## Documentation pruning / convergence

- [ ] entry doc updated
- [ ] duplicate narrative avoided
- [ ] stale doc relabeled or linked instead of silently competing
```

Modify `docs/engineering/03-development-workflow-v0.1.md` by adding:

```md
## Documentation gate

If a change adds or updates markdown:

1. decide which doc is the entry doc
2. update that entry doc first
3. avoid writing a second overview if one already exists
4. if an old doc still matters, relabel it instead of letting it compete silently
5. check `docs/engineering/documentation-pruning-policy.md`
```

Create `tests/static/documentation-review-gate.test.ts` using the code from Step 1.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run static:test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add .github/pull_request_template.md docs/engineering/03-development-workflow-v0.1.md tests/static/documentation-review-gate.test.ts
git commit -m "docs(workflow): add pruning and convergence gate"
```

### Task 5: Final Verification And Manual Pruning Pass

**Files:**
- Verify only; no new files required

**Step 1: Run verification**

Run:

```bash
npm run typecheck
npm run static:test
npm run build
```

Expected: all PASS.

**Step 2: Run a manual doc pass**

Review these directories in one pass:

- `docs/planning/`
- `docs/engineering/`
- `docs/design/`

Check for:

1. any doc still presenting itself as current without being the trunk
2. any duplicated overview for engine migration or combat retirement
3. any top-level index that still frames the repo through an outdated era skeleton

**Step 3: Summarize what was pruned vs. what was only relabeled**

Expected outcome:

- trunk docs reduced to a smaller reading path
- stale docs still available as evidence
- future language constrained by the new policy and review gate

**Step 4: Request review**

Use `@requesting-code-review`.

Reviewer focus:

- whether the chosen trunk docs are the right ones
- whether stale docs are being demoted clearly enough
- whether `docs/README.md` has stopped acting as a mixed current+historical omnibus

**Step 5: Merge**

Merge only after reviewers agree the entry path is clearer and the wording is tighter.

---

Plan complete and saved to `docs/plans/2026-06-11-doc-pruning-and-narrative-convergence.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
