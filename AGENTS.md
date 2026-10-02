# Instructions for every agent working on Dragonbound

This is the only instruction file. Claude reads it through `CLAUDE.md` and Codex reads it directly. Change rules here; don't start another instruction, rules or status file.

## Working with the owner

- The owner cares about the game, not the code or GitHub. Report in game terms: what changed in play, where to see it, and any game decision you need. Leave out code, files, branches, commits, PRs and CI unless the owner asks.
- Handle all repository housekeeping yourself, start to finish: branch, commit, open the PR, fix CI, merge, then delete the branch and any worktree. When you finish, nothing is left uncommitted and no stray branch, worktree or scratch folder remains.
- Ask the owner only about the game: feel, look, design direction and priorities.

## Where things are

- **The plan:** [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md) holds agreed direction, working proposals and open decisions. Record every decision the owner makes there in the same session, whichever chat it came from; a decision that lives only in a chat is lost. Don't start new plan files. The README lists the other docs.
- **Design images** (concepts, icons, mockups) are generated with Codex: any agent can run it headless with `codex exec -m gpt-5.6-sol -C D:\dragonbound-archive\codex --skip-git-repo-check -s workspace-write -i <reference> -` (prompt on stdin), asking it to use its image generation tool and save the PNG. Run it outside the repo: the dev server watches the repo and crashes on files Codex holds open. The owner reviews images in batches before anything goes into the game; concept sheets that models are built from live in `docs/concepts/`.
- **Scratch output** (captures, logs, agent run files) goes in `inspect/`, which git ignores, or outside the repo. Large archives go in `D:\dragonbound-archive`.

## Finding context and checking work

- Start with `git status --short --branch` and `git worktree list`, then this file and the README. Work only in your assigned checkout; another agent's uncommitted work, branch and worktree belong to that agent.
- Read the latest decisions and the relevant section of `docs/DESIGN_DECISIONS.md` for game direction. Search with `rg` before opening whole files. Read the implementation and its nearby tests for current behaviour; `docs/history/` is background, not current instructions.
- Narrow context by task: saves use `src/save/` and `electron/save-*`; launch/check tooling uses `tools/play.cjs`, `package.json` and `vite.config.ts`; world loading and resource lifetime use `src/world/zone.ts`, `src/render/resources.ts` and `src/render/registry.ts`. Art and layout work starts with `docs/ART_CONTRACT.md` and the relevant blueprint/concept.
- `npm run check` runs typecheck, the tests, the production build and the encoding check in sequence, using the same command as CI. Tests use one worker to keep memory bounded. Check for another build, test run, Blender export or capture session before starting a heavy job; do not interrupt the other agent's job.
- Use `inspect/` for temporary output, not `src/` or new plan/status files. Development ignores scratch output and design documents, so writing a report does not reload the game. Stage the files you changed explicitly and remove your temporary output when finished.
- `npm run inspect -- <suite>` starts a server for this checkout and uses a throwaway save, then closes both and removes the temporary profile. Use `memory` for repeated travel/loot/equipment cleanup, `perf` for frame cost, and a targeted visual suite for appearance work. Set `VITE_DEV_SERVER_URL` only when you deliberately want to inspect a specific already-running server.

## How work lands

1. **One writer per folder.** Only one agent edits `D:\gameplanning` at a time. Parallel work uses its own worktree on its own branch, and the worktree is removed once merged.
2. **`main` is always playable.** Changes reach `main` only through a squash-merged pull request with green CI (typecheck, tests, production build, encoding check). Never leave work uncommitted on `main`.
3. **One branch per feature or fix**, named `feat/…`, `fix/…`, `art/…` or `chore/…`, and small enough to review in one sitting.
4. **Independent review before merging.** Send the finished change to a reviewer agent, fix substantive findings, and rerun affected checks. Review is read-only unless the reviewer has its own worktree. Handle review, green CI, squash merge and removal of your branch/worktree automatically; the owner should not have to ask for any of it again.
5. **One heavy job at a time** (build, test run, Blender export or capture session). This PC has crashed from running out of memory.

## Guardrails

- Balance and content live in `src/data/*.ts`; systems read them.
- Pure logic (XP, drops, recipes, saves, pathing) is unit-tested in `tests/`.
- Save format changes bump `SAVE_VERSION` and add a tested migration, so players never lose progress.
- Art is code: every model is a Blender script in `tools/blender/`, and the `.glb` exports are committed. See [docs/ART_CONTRACT.md](docs/ART_CONTRACT.md).
- No placeholder text, TODO stubs or dead code on `main`.
- Files are UTF-8 without a BOM; CI rejects BOMs and mojibake.
