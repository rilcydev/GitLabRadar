# GitLabBar — working notes

A macOS menubar app for GitLab (Electron + React + TypeScript). Two windows: the
menubar popover and a preferences window.

## Read these before changing anything

- `docs/superpowers/verification/migration-ledger.md` — the record of a 20-task
  rewrite of the entire UI from vanilla HTML/JS to React: every decision, every
  ruling, every deliberately preserved bug, and every constraint discovered the
  hard way. **This is the first thing to read when something looks wrong.**
- `docs/superpowers/plans/parity-checklist.md` — the acceptance document, written
  for the human. Lists what to verify and, crucially, which misbehaviours are
  expected and must not be "fixed".
- `docs/superpowers/plans/2026-08-04-react-migration.md` — the implementation plan,
  corrected in place each time it turned out to be wrong about the source.

## State

Two branches, neither merged to `main`:

- `react-migration` — the React rewrite.
- `deps-modernization` — branches from it: pnpm, oxc, and 13 dependency updates
  including seven majors (Vite 8, Vitest 4, Electron 43, TypeScript 7).

They are kept separate on purpose: if something misbehaves, testing
`react-migration` alone says whether it is the port or the updates.

## Rules that are not obvious from the code

**Bugs are preserved on purpose.** Eight of them, listed in the plan's Global
Constraints, each pinned by a test that names it as deliberate. A test asserting
that an avatar has *no* error fallback, or that an invalid token is accepted, is
not a mistake — it documents behaviour the owner chose to keep and correct later.
If one starts failing, that is a signal, not a test to adjust.

**A TypeScript type on API data is a claim, not a runtime guarantee.** GitLab
JSON crosses into this app with no runtime validation. "It is typed non-optional
so it cannot happen" was wrong three separate times here.

**Prove a guard test bites.** Write the regression it targets, watch it fail, and
check it fails on the *right* assertion. Two guard tests in this repo were
inert — one asserted an HTML attribute React never emits, another asserted a
string where only the URL parser's verdict mattered. Both looked correct.

**Assert observable outcomes, not the shape of the markup you just wrote.**

**Read the source, not the summary.** The migration plan was wrong about the
vanilla source fourteen times. Every one was caught by opening the file. Before
treating a function as behaviour to reproduce, grep for its call sites — two
turned out to be dead code.

## Toolchain gotchas

Package manager is **pnpm**, pinned in `packageManager`. `pnpm-workspace.yaml`
carries commented, deliberate settings — read the comments, they each cost time
to find. In particular `allowBuilds` is a **map**, not a list; written as a list
it is silently ignored, and Electron then installs without its binary.

`nodeLinker: hoisted` is required by electron-forge's preflight check.

Vite configs are `.mts`, not `.ts` — `package.json` has no `"type": "module"`, so
a `.ts` config is loaded as CommonJS and warns.

## Verification

```bash
pnpm run test:run    # 397 tests
pnpm run typecheck
pnpm run lint        # oxlint; 6 pre-existing errors in src/main/** and scripts/
pnpm exec vite build --config vite.renderer.config.mts
```

The app cannot be launched or judged from a Linux machine. On macOS,
`pnpm start` builds the renderer first via `prestart`.
