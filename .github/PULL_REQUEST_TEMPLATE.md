# Pull Request Checklist

## Summary

Describe what changed and why.

## Linked Issues

Closes or relates to: <!-- #123 -->

## Change Area

- [ ] Combat kernel (`src/combat/`)
- [ ] Phaser rendering / scene layer (`src/game/`)
- [ ] Assets / sprites / manifests (`public/assets/`)
- [ ] Runtime evidence / browser smoke
- [ ] CI/CD / GitHub Actions
- [ ] Docs / Wiki / README
- [ ] Tests only

## Risk Level

- [ ] Low — docs, comments, isolated tests, or template-only changes
- [ ] Medium — localized behavior, asset, or UI changes
- [ ] High — combat logic, CI/CD, deployment, runtime evidence, or build output changes

## Validation Performed

- [ ] `npm run validate:sprites`
- [ ] `npm run validate:assets`
- [ ] `npm run typecheck`
- [ ] `npm run static:test`
- [ ] `npm run build`
- [ ] `npm run browser:smoke`
- [ ] Docker smoke: `docker compose up --build`
- [ ] Not run — explain below

## Runtime / Visual Evidence

Attach or link relevant evidence when applicable:

- Screenshots or short capture
- `verification/build.json`
- `verification/runtime-evidence.json`
- `verification/browser-smoke.json`
- Playwright report
- GitHub Actions run

## Combat-Kernel Boundary

- [ ] No Phaser imports were added under `src/combat/`
- [ ] Velocity writes remain limited to approved files
- [ ] New or changed combat behavior is covered by static tests
- [ ] New or changed visual behavior is mapped through the rendering layer, not the kernel
- [ ] Death / hit stop / recoil / reaction / armor changes include deterministic evidence

## Deployment Impact

- [ ] No GitHub Pages deployment impact
- [ ] GitHub Pages output changed intentionally
- [ ] CI/CD changed intentionally
- [ ] Artifact or evidence output changed intentionally
- [ ] Docker startup behavior changed intentionally

## Review Focus

Tell reviewers exactly what to inspect first.

## Notes / Follow-ups

Add known tradeoffs, deferred work, or follow-up issues here.
