# Pull Request Checklist

## Summary

Describe what changed and why.

## Change Area

- [ ] Combat kernel (`src/combat/`)
- [ ] Phaser rendering / scene layer (`src/game/`)
- [ ] Assets / sprites / manifests (`public/assets/`)
- [ ] Runtime evidence / browser smoke
- [ ] CI/CD / GitHub Actions
- [ ] Docs / Wiki / README
- [ ] Tests only

## Risk Level

- [ ] Low — docs, comments, or isolated test changes
- [ ] Medium — localized behavior or asset changes
- [ ] High — combat logic, CI/CD, deployment, or runtime evidence changes

## Validation Performed

- [ ] `npm run validate:sprites`
- [ ] `npm run validate:assets`
- [ ] `npm run typecheck`
- [ ] `npm run static:test`
- [ ] `npm run build`
- [ ] `npm run browser:smoke`
- [ ] Not run — explain below

## Runtime / Visual Evidence

Attach or link relevant evidence when applicable:

- Screenshots
- `verification/runtime-evidence.json`
- `verification/browser-smoke.json`
- Playwright report
- GitHub Actions run

## Combat-Kernel Boundary

- [ ] No Phaser imports were added under `src/combat/`
- [ ] Velocity writes remain limited to approved files
- [ ] New or changed combat behavior is covered by static tests
- [ ] New or changed visual behavior is mapped through the rendering layer, not the kernel

## Deployment Impact

- [ ] No GitHub Pages deployment impact
- [ ] GitHub Pages output changed intentionally
- [ ] CI/CD changed intentionally
- [ ] Artifact or evidence output changed intentionally

## Notes for Reviewers

Add review focus, known tradeoffs, or follow-up tasks here.
