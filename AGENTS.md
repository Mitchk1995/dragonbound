# Instructions for every agent working on Dragonbound

This is the only instruction file. Claude reads it through `CLAUDE.md` and Codex reads it directly. Change rules here; don't start another instruction, rules or status file.

## Working with the owner

- The owner cares about the game, not the code or GitHub. Report in game terms: what changed in play, where to see it, and any game decision you need. Leave out code, files, branches, commits, PRs and CI unless the owner asks.
- Handle all repository housekeeping yourself, start to finish: branch, commit, open the PR, fix CI, merge, then delete the branch and any worktree. When you finish, nothing is left uncommitted and no stray branch, worktree or scratch folder remains.
- Ask the owner only about the game: feel, look, design direction and priorities.

## Where things are

- **The plan:** [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md) holds agreed direction, working proposals and open decisions. Record every decision the owner makes there in the same session, whichever chat it came from; a decision that lives only in a chat is lost. Don't start new plan files. The README lists the other docs.
- **Design images** (concepts, icons, mockups) can be generated with Codex. The owner reviews them in batches before anything goes into the game.
- **Scratch output** (captures, logs, agent run files) goes in `inspect/`, which git ignores, or outside the repo. Large archives go in `D:\dragonbound-archive`.

## How work lands

1. **One writer per folder.** Only one agent edits `D:\gameplanning` at a time. Parallel work uses its own worktree on its own branch, and the worktree is removed once merged.
2. **`main` is always playable.** Changes reach `main` only through a squash-merged pull request with green CI (typecheck, tests, production build, encoding check). Never leave work uncommitted on `main`.
3. **One branch per feature or fix**, named `feat/…`, `fix/…`, `art/…` or `chore/…`, and small enough to review in one sitting.
4. **One heavy job at a time** (build, test run, Blender export or capture session). This PC has crashed from running out of memory.

## Guardrails

- Balance and content live in `src/data/*.ts`; systems read them.
- Pure logic (XP, drops, recipes, saves, pathing) is unit-tested in `tests/`.
- Save format changes bump `SAVE_VERSION` and add a tested migration, so players never lose progress.
- Art is code: every model is a Blender script in `tools/blender/`, and the `.glb` exports are committed. See [docs/ART_CONTRACT.md](docs/ART_CONTRACT.md).
- No placeholder text, TODO stubs or dead code on `main`.
- Files are UTF-8 without a BOM; CI rejects BOMs and mojibake.
