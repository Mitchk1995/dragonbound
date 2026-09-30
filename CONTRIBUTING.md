# How we work (GitHub flow)

1. **`main` is always playable.** Nothing lands on `main` except through a pull request with green CI.
2. **One branch per feature or fix**, named `feat/…`, `fix/…`, `art/…` or `chore/…`. Keep them small enough to review in one sitting.
3. **Open a PR early** (draft is fine). CI runs typecheck, unit tests, a production build and an encoding check.
4. **Every PR gets a review pass** before merge: correctness, scope creep, dead code, and whether numbers belong in `src/data/`.
5. **Squash-merge** into `main` with a descriptive title, then delete the branch.
6. **Playtest builds** are tagged from `main` (`v0.2.0`, …) after a chapter milestone.

## Guardrails against slop
- Data-driven: balance and content live in `src/data/*.ts`; systems read them.
- Pure logic (XP, drops, recipes, saves, pathing) is unit-tested in `tests/`.
- Save format changes bump `SAVE_VERSION` and add a tested migration: players never lose progress.
- Art is code: every model is a Blender script in `tools/blender/`; `.glb` exports are committed.
- No placeholder text, TODO stubs or dead code on `main`.
- Edit files as UTF-8 without BOM (CI rejects BOMs and mojibake).
