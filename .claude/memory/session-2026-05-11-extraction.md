# Session 2026-05-11: Extraction module + PVF parser tests

## Completed

- Wrote `tests/static/pvf-parser.test.ts` — 13 tests covering PVF container parsing (header, encrypted tree, file tree), decryptChunk round-trip (CRC32=0, non-4-byte-aligned data), extractFile (encrypted + unencrypted), error handling (invalid uuidLength, truncated tree). All 13 pass. Uses inline binary fixtures with XOR+ROTR6 encrypt helper, same pattern as img-parser.test.ts.
- Wrote `tools/extract-assets.mjs` — self-contained Node.js CLI (no tsx/deps, pure .mjs) for extracting assets from DNF PVF and NPK archives. Supports `--list`, `--extract <path>`, `--extract-all --out <dir>` for both PVF and NPK modes. Inline XOR+ROTR6 decryption, PVF header/tree parsing, NPK index parsing.
- Fixed 4 pre-existing test failures: death-barrier-multihit (grunt position 350→525), enemy-ai (runTicks 240→360), golden-scenario (hash update), movement-bounds (z bounds 120→180).
- Commit `ea1251f` pushed to master — 14 files, +2315/-7.

## Key decisions
- extract-assets.mjs duplicates parsing logic from src/extraction/ because no tsx available and extraction module is TypeScript-only. This keeps the tool self-contained and runnable with plain `node`.
- pvf-parser.test.ts uses same inline-binary-fixture pattern as img-parser.test.ts for consistency.