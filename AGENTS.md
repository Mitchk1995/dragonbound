# Instructions for every agent working on Dragonbound

This is the only instruction file. Claude reads it through `CLAUDE.md` and Codex reads it directly. Change rules here; don't start another instruction, rules or status file.

## Working with the owner

- The owner cares about the game, not the code or GitHub. Report in game terms: what changed in play, where to see it, and any game decision you need. Leave out code, files, branches, commits, PRs and CI unless the owner asks.
- Handle all repository housekeeping yourself, start to finish: branch, commit, open the PR, fix CI, merge, then delete the branch and any worktree. When you finish, nothing is left uncommitted and no stray branch, worktree or scratch folder remains.
- Ask the owner only about the game: feel, look, design direction and priorities.
- **Show, don't tell.** Progress, options and questions go to the owner as pictures (in-game captures, concept images), with a line or two of text at most. No score tables, long lists or walls of text; the owner won't open the game to check. Show progress regularly, not only at the end.
- **One thing at a time for the owner's eye.** The owner judges one area at a time from pictures before it counts as done. The owner's eye is the judge: visual work goes to the owner straight from the builder, with no separate reviewer or critic stage (owner, October 3, to save usage). Stop and show the owner when progress stalls.
- **Be honest about style.** Say plainly when a look is or is not achievable with how we build things, and show it. Concept paintings are mood, not blueprints: they tend to be generic, so scrutinise their layout and use your own taste.
- **Push back, and own the cohesion.** The owner trusts Claude with the look's cohesion and wants pushback, not agreement: when an idea would hurt the game or how it all fits together, say so briefly and propose something better (owner, October 3).
- **Parallel jobs for implementation (October 3).** Run parallel jobs (Claude's Workflow tool, or several agents) where they help, partitioned so they never edit the same code, each job in its own worktree on its own branch. Heavy jobs still run one at a time through the shared lock (see "How work lands"). Keep the repo, branches and scratch output clean.
- **Spend usage carefully (October 3).** Even on the larger allowance, three max-effort jobs used 6% of the week in about two hours. To make it last:
  - give each job one focused task in a fresh context, and continue an agent by message rather than starting a new one on the same work;
  - keep max effort for visual work the owner will judge (it gives clearly more polished results); run planning, code and groundwork at high;
  - run routine work (doc edits, code reviews, placing things, simple fixes) on Sonnet;
  - take only the captures needed to judge, and read pictures at the size they need.
- **How to work through a batch of owner notes.**
  - Export the notes, with marked pictures, to one notes file.
  - Group them by kind (for example masonry; doors and glass; landscaping).
  - Run one fresh, focused job per group. A single long-running agent costs more with every step; groups that touch the same code run one after another, the rest can run side by side in their own worktrees.
  - Give every job one shared brief: rules, style, where the code is, how to capture and how to report.
  - A job checks each fix from several camera angles, not only the review view, and extends the geometry audit where it can.
  - The owner judges the result from pictures; there is no separate visual review stage.
- **Every visual builder starts from the style.** Its prompt points it at "The look" in [docs/ART_CONTRACT.md](docs/ART_CONTRACT.md) and the owner's picks for that area in the plan. Nothing reaches the owner as finished until the geometry checks pass and the builder has zoomed into every capture it shows; work-in-progress pictures can go sooner, labelled as unfinished.
- **Mechanics and non-visual systems go to Codex** (GPT 6.1 Sol, max effort, run headless with the Codex app's newest bundled `codex.exe`); Claude does design, planning, look and feel.

## Where things are

- **The plan:** [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md) holds agreed direction, working proposals and open decisions. Record every decision the owner makes there in the same session, whichever chat it came from; a decision that lives only in a chat is lost. Don't start new plan files. The README lists the other docs.
- **Design images** (concepts, icons, mockups) are generated with Codex: any agent can run it headless with `codex exec -m gpt-5.6-sol -C D:\dragonbound-archive\codex --skip-git-repo-check -s workspace-write -i <reference> -` (prompt on stdin), asking it to use its image generation tool and save the PNG. Run it outside the repo: the dev server watches the repo and crashes on files Codex holds open. The owner reviews images in batches before anything goes into the game; concept sheets that models are built from live in `docs/concepts/`.
- **Scratch output** (captures, logs, agent run files) goes in `inspect/`, which git ignores, or outside the repo. Large archives go in `D:\dragonbound-archive`.

## Finding context and checking work

- Start with `git status --short --branch` and `git worktree list`, then this file and the README. Work only in your assigned checkout; another agent's uncommitted work, branch and worktree belong to that agent.
- Read the latest decisions and the relevant section of `docs/DESIGN_DECISIONS.md` for game direction. Search with `rg` before opening whole files. Read the implementation and its nearby tests for current behaviour; `docs/history/` is background, not current instructions.
- Narrow context by task: saves use `src/save/` and `electron/save-*`; launch/check tooling uses `tools/play.cjs`, `package.json` and `vite.config.ts`; world loading and resource lifetime use `src/world/zone.ts`, `src/render/resources.ts` and `src/render/registry.ts`. Art and layout work starts with `docs/ART_CONTRACT.md` and the relevant blueprint/concept.
- `npm run check` runs typecheck, the tests, the production build and the encoding check in sequence, using the same command as CI. Tests use one worker to keep memory bounded. Run every heavy job through the shared lock (below); do not interrupt another agent's job.
- Use `inspect/` for temporary output, not `src/` or new plan/status files. Development ignores scratch output and design documents, so writing a report does not reload the game. Stage the files you changed explicitly and remove your temporary output when finished.
- `npm run inspect -- <suite>` starts a server for this checkout and uses a throwaway save, then closes both and removes the temporary profile. Use `memory` for repeated travel/loot/equipment cleanup, `perf` for frame cost, and a targeted visual suite for appearance work. Set `VITE_DEV_SERVER_URL` only when you deliberately want to inspect a specific already-running server.

## How work lands

1. **One writer per folder.** Only one agent edits `D:\gameplanning` at a time. Parallel work uses its own worktree on its own branch, and the worktree is removed once merged.
2. **`main` is always playable.** Changes reach `main` only through a squash-merged pull request with green CI (typecheck, tests, production build, encoding check). Never leave work uncommitted on `main`.
3. **One branch per feature or fix**, named `feat/…`, `fix/…`, `art/…` or `chore/…`, and small enough to review in one sitting.
4. **Independent review before merging.** Send the finished change to a reviewer agent, fix substantive findings, and rerun affected checks. Review is read-only unless the reviewer has its own worktree. Handle review, green CI, squash merge and removal of your branch/worktree automatically; the owner should not have to ask for any of it again.
5. **One heavy job at a time** (build, test run, Blender export or capture session). This PC has crashed from running out of memory. Run each one as `node tools/heavy.cjs <command>` from your checkout: it waits for the machine-wide lock (a Windows named pipe, freed the moment its holder ends), runs the command through cmd.exe and exits with its code. Put a compound command in one quoted argument (`node tools/heavy.cjs "npm run build && npm test"`), and stop a heavy job by ending its whole process tree (`taskkill /T /F /PID <pid>`), never the wrapper alone. Blender 5.2 is `D:/pokemon/tools/blender-5.2.2/blender.exe`.

## Guardrails

- Balance and content live in `src/data/*.ts`; systems read them.
- Pure logic (XP, drops, recipes, saves, pathing) is unit-tested in `tests/`.
- Save format changes bump `SAVE_VERSION` and add a tested migration, so players never lose progress.
- Art is code: every model is a Blender script in `tools/blender/`, and the `.glb` exports are committed. See [docs/ART_CONTRACT.md](docs/ART_CONTRACT.md).
- No placeholder text, TODO stubs or dead code on `main`.
- Files are UTF-8 without a BOM; CI rejects BOMs and mojibake.
