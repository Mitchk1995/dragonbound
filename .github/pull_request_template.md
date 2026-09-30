## What & why
<!-- One or two sentences: what this changes and the player-facing reason. -->

## How to try it
<!-- Where to go in-game / what to click to see the change. -->

## Checklist
- [ ] Scoped to one feature or fix (no drive-by rewrites)
- [ ] Tuning numbers live in `src/data/`, not hard-coded in systems
- [ ] Tests added/updated for new logic (`npm test`)
- [ ] `npm run typecheck` and `npx vite build` pass
- [ ] New models are scripts in `tools/blender/` and exported to `public/models/`
- [ ] Screenshots attached for visual changes
- [ ] Save format change? Bumped `SAVE_VERSION` and added a `migrate()` step + test
