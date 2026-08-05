# Task 11 Report: Switch the preferences window to React

**Status: BLOCKED — pending human verification on macOS.**

This is a Linux machine. Everything runnable here has been run and passes
(see "Verified" below), but the thing this task actually needs verified —
an Electron `BrowserWindow` loading and rendering the built React bundle —
cannot be observed from this machine. Do not treat anything below as proof
the switch works at runtime.

## File-by-file changes

### `src/main/tray.ts`

**Before** (lines 20-22, single flat renderer root used by both windows):

```ts
const RENDERER_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'renderer')
  : path.join(app.getAppPath(), 'src/renderer');
```

Both windows loaded off this the same way:

```ts
// menubar (~line 172, pre-change)
const indexPath = path.join(RENDERER_PATH, 'index.html');
this.menuWindow.loadFile(indexPath);

// preferences (~line 255, pre-change)
const prefsPath = path.join(RENDERER_PATH, 'preferences.html');
this.preferencesWindow.loadFile(prefsPath);
```

**After.** `RENDERER_PATH` is untouched and still used, unchanged, by the
menubar window only. A second, separate resolver was added for the
Vite-built React bundle, and only the preferences window was pointed at it:

```ts
// Legacy static-HTML renderer root. Still used by the menubar window only
// (Task 19 migrates it and retires this).
const RENDERER_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'renderer')
  : path.join(app.getAppPath(), 'src/renderer');

// Root of the Vite-built React renderer bundle (see vite.renderer.config.ts,
// which sets `base: './'`). Every emitted entry HTML file resolves its
// <script>/<link> tags relative to its OWN directory, several levels up
// from the build root:
//   <root>/src/renderer/windows/preferences/index.html -> ../../../../assets/…
// `dist/` must therefore be treated as one atomic unit.
const BUILT_RENDERER_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(app.getAppPath(), 'dist');

function getBuiltRendererEntry(windowName: 'menubar' | 'preferences'): string {
  return path.join(BUILT_RENDERER_ROOT, 'src', 'renderer', 'windows', windowName, 'index.html');
}
```

```ts
// menubar (~line 201, UNCHANGED)
const indexPath = path.join(RENDERER_PATH, 'index.html');
console.log('Loading renderer from:', indexPath);
this.menuWindow.loadFile(indexPath);

// preferences (~line 284, CHANGED)
const prefsPath = getBuiltRendererEntry('preferences');
console.log('Loading preferences from:', prefsPath);
this.preferencesWindow.loadFile(prefsPath);
```

**Design decision — deviation from the brief's literal wording.** The task
brief (Step 1) said to "replace `RENDERER_PATH`... with a resolver". I did
not literally replace it, because the outer task instructions (which take
precedence — they carry the accumulated Task 1-10 context and explicitly
warn about the menubar) require `tray.ts:172`-area to keep resolving
`src/renderer/index.html` unchanged, and that logic depends on the old flat
`RENDERER_PATH` + `'index.html'` pattern. Deleting or repurposing
`RENDERER_PATH` would have forced touching the menubar's load path, which
is explicitly out of scope for Task 11. Instead: `RENDERER_PATH` stays
exactly as it was (menubar-only now, in effect), and a new,
separately-named `BUILT_RENDERER_ROOT` / `getBuiltRendererEntry()` pair
was added for the nested React bundle. The `console.log` before
`loadFile()` was preserved for both windows, unchanged in the menubar case
and reworded/kept for preferences.

### `forge.config.ts`

**Before:**

```ts
extraResource: [
  './assets',
  './src/renderer',
],
```

**After:**

```ts
extraResource: [
  './assets',
  // Vanilla renderer sources. Still required at runtime because the
  // menubar window (src/main/tray.ts) loads src/renderer/index.html
  // directly and isn't bundled. Task 19 switches the menubar to the
  // React bundle too and removes this entry along with the vanilla
  // sources it ships.
  './src/renderer',
  // Vite-built React renderer (see vite.renderer.config.ts). Ship the
  // whole `dist/` tree as one unit -- its entry HTML files reference
  // assets with relative paths several directories up, so copying only
  // part of this tree (or flattening it) silently breaks asset
  // resolution at runtime. Currently only the preferences window
  // (src/main/tray.ts) loads from here.
  './dist',
],
```

`'./src/renderer'` was deliberately left in place, per the brief's own
fallback instruction ("if you cannot remove it without breaking the
menubar, leave it and say so"): the menubar still `loadFile()`s
`src/renderer/index.html` directly from this shipped copy, so removing it
would break the menubar in a packaged build. Task 19 removes it once the
menubar also moves to the React bundle.

`'./dist'` was added alongside it, per the brief and outer instructions.
`electron-packager`'s `extraResource` copies each listed path to
`resourcesPath/<basename>`; `'./dist'` therefore lands at
`resourcesPath/dist` in a packaged app, matching
`BUILT_RENDERER_ROOT`'s packaged branch.

### `src/renderer/preferences.html`

**Not deleted**, despite the brief's file list saying "Delete". Per the
outer task instructions: "Do not delete `src/renderer/preferences.html` in
this task... leaving it costs nothing and keeps the rollback trivial...
Task 19 deletes both vanilla files together." Confirmed still present at
`/root/GitLabBar/src/renderer/preferences.html` (40751 bytes, unchanged).

## Resolved paths, dev vs packaged

Confirmed by inspecting a real `vite build` output on this machine
(`rm -rf dist && npx vite build --config vite.renderer.config.ts`, run
clean, exit 0):

```
dist/
├── assets/
│   ├── client-BDmZkkqo.js
│   ├── menubar-BoDwdwPp.js
│   ├── preferences-CPZx_xQX.js
│   └── preferences-CR04WDdw.css
└── src/renderer/windows/
    ├── menubar/index.html       (references ../../../../assets/…)
    └── preferences/index.html   (references ../../../../assets/…)
```

**Dev mode** (`app.isPackaged === false`):
`BUILT_RENDERER_ROOT = <project root>/dist`
→ preferences loads `<project root>/dist/src/renderer/windows/preferences/index.html`

**Packaged mode** (`app.isPackaged === true`):
`BUILT_RENDERER_ROOT = <resourcesPath>/dist`
→ preferences loads `<resourcesPath>/dist/src/renderer/windows/preferences/index.html`

In both cases the four-levels-up relative asset references
(`../../../../assets/…`) resolve correctly *only* if the whole `dist/` tree
sits intact under that root — which `extraResource: ['./dist']` guarantees
in the packaged case.

**Operational gap worth flagging explicitly**: nothing in `package.json`
scripts currently produces `dist/` automatically. `pnpm start` does not run
`vite build --config vite.renderer.config.ts` as a pre-step (no `prestart`
script exists), and electron-forge's own internal Vite pipeline (which
builds `vite.renderer.config.ts` into `.vite/renderer/main_window/` for its
own dev-server/packaging bookkeeping) is a *different, unused* output
location — `tray.ts` never reads from `.vite/renderer/main_window`, only
from `dist/`. This is consistent with how the menubar has always worked
(no dev server, `loadFile` from source), and matches what the Task 11
brief itself directs (manually run `pnpm exec vite build` before testing), but it
means: **on the Mac, `dist/` must exist and be up to date before `npm
start`**, or the preferences window will blank-load a missing file. This
was true before Task 11 too (in a weaker sense) — it's now load-bearing
for the first time because the preferences window is the first thing in
this app that depends on a Vite build artifact instead of raw source.

## Verified (this machine)

- `rm -rf dist && npx vite build --config vite.renderer.config.ts` → exit 0.
  Output tree matches the nested structure the brief describes exactly
  (see above).
- `pnpm run typecheck` → exit 0.
- `pnpm run lint` → 41 errors, same as the pre-existing baseline. No new
  errors from the changed files (`tray.ts`'s 5 pre-existing `any`/
  unused-var/`prefer-const` errors are all on lines untouched by this
  change; `forge.config.ts` has none).
- `pnpm run test:run` → 90/90 tests pass (12 files), including
  `src/test/viteRendererConfig.test.ts` (still guards `base: './''`,
  untouched).
- Read the full diff of both changed files; confirmed the menubar's
  load path (`path.join(RENDERER_PATH, 'index.html')` at the former
  line ~172, now ~201) is byte-for-byte unchanged.
- Confirmed `src/renderer/preferences.html` still exists on disk,
  untouched.
- Traced through `node_modules/@electron-forge/plugin-vite`'s source
  (`ViteConfig.js`, `config/vite.renderer.config.js`) to confirm this
  project's `vite.renderer.config.ts` is loaded as `userConfig` and its
  `base: './'` and multi-entry `build.rollupOptions.input` survive
  `mergeConfig` — i.e. forge's own internal renderer build (into
  `.vite/renderer/main_window/`) uses the same relative-base, multi-entry
  config, it's just a separate, currently-unread output location from the
  `dist/` this task wires up.

## Explicitly NOT verified — cannot be, on this machine

- That an actual `BrowserWindow.loadFile()` call against
  `dist/src/renderer/windows/preferences/index.html` renders anything.
  No Electron GUI runtime available here.
- That the three preference pages (Accounts, Projects, General) render,
  that accounts can be added/removed, that project search works, or that
  general settings persist across a restart.
- That a *packaged* app (`electron-forge package` / `make` on macOS) puts
  `dist/` at `resourcesPath/dist` as expected and that `app.isPackaged`
  branch resolves correctly at runtime.
- Anything about macOS-specific behavior (vibrancy, `titleBarStyle:
  'hiddenInset'`, code signing/notarization interactions with the new
  `extraResource` entry).

## Human verification checklist (macOS required)

**Rollback, if anything below fails and you just want a working app back:**
`preferences.html` (the old vanilla window) was never deleted, so
`git revert 19081fd` restores the previous, working behavior immediately.
You do not need to read the rest of this checklist to do that. **Stale as
of Task 19 (commit `29e4dfc`), which deleted `preferences.html` outright:**
this revert-alone approach no longer restores a working preferences
window, because the file it depends on is gone. For a working app after
Task 19, use `git revert 29e4dfc` instead (see the parity checklist's
"Rollback" section, or Task 19's own report).

1. Check out this commit on a Mac with the full toolchain, `pnpm install`
   if needed.
2. `pnpm start`. As of the fix round below, this now runs a `prestart`
   step (`vite build --config vite.renderer.config.ts`) automatically
   before Electron launches — you should NOT need to build anything by
   hand. Confirm you see Vite build output (module count, `dist/...`
   file sizes) in the terminal before the Electron/Forge log lines start.
3. Click the tray icon, right-click (or however this app's tray menu is
   invoked) → **Preferences…**.
4. **Success looks like**: a window titled "GitLabBar - Preferences"
   opens showing a sidebar with three items (Accounts, Projects, General)
   and the Accounts page content on the right. Sidebar navigation switches
   pages. Adding/removing an account works. Project search returns
   results. Changing a General setting and restarting the app (`npm
   start` again) shows the changed value persisted.
5. Also sanity-check the **menubar** window (click the tray icon, not
   right-click) still opens and works as before — Task 11 must not have
   regressed it.

### If the preferences window is blank instead

There are three different failure modes that all look like "blank
window" but mean different things and need different fixes. Work through
them in this order — do not guess, follow the steps:

**Step A — check the terminal log line.** Every time you open
Preferences, the terminal prints a line like:

```
Loading preferences from: /path/to/GitLabBar/dist/src/renderer/windows/preferences/index.html
```

Copy that exact path and check whether the file exists:
`ls -la "<the path from the log>"`.

- **File does NOT exist** → the build never ran. With the `prestart`
  script this should now be impossible when launching via `pnpm start`,
  but if you launched some other way (packaged app, `electron-forge
  start` directly, etc.), the same rule applies: `dist/` must exist and
  be current. Run `pnpm exec vite build --config vite.renderer.config.ts`
  yourself and retry.
- **File exists** → the build is fine. This is not a path/packaging
  problem. Continue to Step B.

**Step B — open DevTools for the preferences window and look at the
console.** There is currently no built-in way to do this (the only
DevTools toggle in `tray.ts` is commented out, and only for the menubar
window). To add one temporarily:

In `src/main/tray.ts`, inside `showPreferencesWindow()`, right after the
line `this.preferencesWindow.loadFile(prefsPath);`, add:

```ts
this.preferencesWindow.webContents.openDevTools({ mode: 'detach' });
```

Rebuild (`pnpm run package` isn't needed — for `pnpm start` just save the
file, Forge will pick it up) and reopen Preferences. Look at the
DevTools **Console** and **Network** tabs:

- **Console shows 404s for paths containing `assets/`** (e.g.
  `../../../../assets/preferences-XXXX.js` failed to load) → the
  relative-path scheme is broken, or the `dist/` folder that got shipped/
  used is incomplete (e.g. `dist/assets/` is missing or only partially
  copied). This would point at a real bug in the `extraResource`/
  `BUILT_RENDERER_ROOT` wiring from this task — report it as such, with
  the exact 404'd URL from the Network tab.
- **Console shows a JavaScript exception** (red error, stack trace) →
  the file loaded correctly but the React app crashed while running.
  This is a bug in the React port itself (Tasks 7-10), not in this
  task's path-switching, but still needs to be reported and fixed before
  Task 11 can be called done.
- **Console is clean (no errors, no failed requests) but the window is
  still visually empty**, and `<div id="root"></div>` in the Elements
  tab has no children → the JS loaded and ran without throwing, but React
  never mounted anything into it, or the app's `window.electronAPI` /
  preload `contextBridge` surface it depends on isn't there. This is
  worth calling out specifically: **this is the first bundled JavaScript
  this app has ever loaded into a `BrowserWindow`** — every prior
  renderer (including the still-vanilla menubar) is raw unbundled source
  with an inline `<script>` tag, so a preload/contextIsolation
  interaction that never mattered before could surface for the first
  time here. Report exactly what's in the Console and Elements tabs.

Remove the temporary `openDevTools` line before considering the app
"normal" again — it should not ship.

## Rollback

Both changes are isolated to two files and are simple reverts:

```bash
git revert 19081fd
```

**Stale as of Task 19 (commit `29e4dfc`):** the above only undoes this
task's own switch, and depends on `preferences.html` still being on disk.
Task 19 deleted it. Use `git revert 29e4dfc` for a working app after Task
19 — see that task's own report for details.

or manually:
- In `src/main/tray.ts`, restore `const prefsPath = path.join(RENDERER_PATH,
  'preferences.html');` in `showPreferencesWindow()` and remove
  `BUILT_RENDERER_ROOT` / `getBuiltRendererEntry`.
- In `forge.config.ts`, remove `'./dist'` from `extraResource`.
- In `package.json`, remove the `prestart` script added in the fix round
  below.

---

## Fix round 1

Reviewer verified the packaging/path work with no defects and confirmed
the dev-mode decision (keep `loadFile` + build-then-start, do not
introduce `loadURL`/`MAIN_WINDOW_VITE_DEV_SERVER_URL` — this app has never
used Forge's per-target Vite dev server, and Forge only declares a single
`main_window` target, so there's no ready-made per-window dev URL to hook
into without inventing one, unverified, in a task that already has a
narrow failure mode). Two things were requested:

### 1. Close the manual-build gap mechanically

`dist/` is gitignored, so a fresh checkout has none, and Forge's own
`preStart` hook only rebuilds its internal `.vite/` output — never
`dist/`. Added to `package.json`:

```json
"scripts": {
  "prestart": "vite build --config vite.renderer.config.ts",
  "start": "electron-forge start",
  ...
}
```

npm's `pre<script>` convention runs this automatically before `npm
start`, with no changes to `tray.ts` or `forge.config.ts`.

**Verified on this machine**: removed `dist/` (`rm -rf dist`), ran `npm
start`, and confirmed the Vite build output (`✓ 47 modules transformed`,
per-file sizes for `dist/src/renderer/windows/{menubar,preferences}/
index.html` and `dist/assets/*`) printed *before* any
`electron-forge`/`plugin-vite` log lines, and that `dist/src/renderer/
windows/preferences/index.html` plus `dist/assets/` existed on disk
afterward. Electron itself proceeded to launch its own dev server and
build the main/preload bundles (`✔ Launched Electron app.`); no actual
window could be observed on this headless Linux box, which is expected
and irrelevant to what this fix needed to prove — only that the build
step fires before Electron starts.

### 2. Rewrite the checklist to distinguish failure modes

Replaced the single "blank window = path problem" checklist entry with a
three-branch diagnostic (see "Human verification checklist" above):
missing file at the logged path (build didn't run — now expected to be
unreachable via `pnpm start` because of `prestart`, but still checked, and
still reachable via other launch methods), 404s under `assets/` in
DevTools (relative-path/`dist/` shipping bug), and a clean console with
an empty mounted root (React/preload/contextBridge failure — flagged as
the most likely *new* class of failure specifically because this is the
first bundled JS this app has ever loaded into a `BrowserWindow`, unlike
the still-raw-source menubar). Included the exact temporary
`openDevTools({ mode: 'detach' })` snippet and where to paste it, with an
explicit instruction to remove it afterward — it was deliberately not
added to the committed code. Added a one-line rollback pointer
(`preferences.html` still exists; revert the commit) at the top of the
checklist per the request.

### Re-verification

- `pnpm run typecheck` → exit 0.
- `pnpm run lint` → 41 errors (unchanged baseline; confirmed by direct
  count, not just eyeballing the summary line).
- `pnpm run test:run` → 90/90 tests pass (12 files).

No changes to `src/main/tray.ts` or `forge.config.ts` in this round, as
instructed — only `package.json` (`prestart` script) and this report.
- No deletions to undo — `src/renderer/preferences.html` was never removed.
