# Task 19 Report: Switch the menubar window and delete the vanilla UI

**Status: BLOCKED — pending human verification on macOS.**

This is a Linux machine. Everything runnable here has been run and passes
(see "Verified" below), but the thing this task actually needs verified —
an Electron `BrowserWindow` loading and rendering the built React bundle in
the **menubar window**, plus the fact that this task deletes the vanilla
fallback entirely — cannot be observed from this machine. Do not treat
anything below as proof the switch works at runtime. Unlike Task 11, there
is no trivial in-repo rollback here: the vanilla files are gone from disk,
not just unused.

## File-by-file changes

### `src/main/tray.ts`

**Before** (menubar load path, ~line 201, and the `RENDERER_PATH` constant
it depended on, ~lines 20-26):

```ts
// Legacy static-HTML renderer root. Still used by the menubar window only
// (Task 19 migrates it and retires this): ...
const RENDERER_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'renderer')
  : path.join(app.getAppPath(), 'src/renderer');

...

// Load the HTML file
const indexPath = path.join(RENDERER_PATH, 'index.html');
console.log('Loading renderer from:', indexPath);
this.menuWindow.loadFile(indexPath);
```

**After.** `RENDERER_PATH` and its comment block are deleted outright (it
had exactly one remaining caller — the menubar window — so once that
caller moved off it, it was dead code, not left for a future task). The
menubar now uses the same `getBuiltRendererEntry()` resolver Task 11
introduced for preferences, just with `'menubar'` instead of
`'preferences'`:

```ts
// Load the built React bundle
const indexPath = getBuiltRendererEntry('menubar');
console.log('Loading renderer from:', indexPath);
this.menuWindow.loadFile(indexPath);
```

`BUILT_RENDERER_ROOT` and `getBuiltRendererEntry()` themselves are
byte-for-byte unchanged from Task 11 — only their doc comment above
`BUILT_RENDERER_ROOT` was left as-is since it already described the
generic mechanism, not preferences-specifically. The preferences window's
`showPreferencesWindow()` (which already called
`getBuiltRendererEntry('preferences')`) is untouched.

Confirmed via `grep -n "RENDERER_PATH" src/main/tray.ts` → no output; the
symbol is fully retired.

### `forge.config.ts`

**Before:**

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
  // whole `dist/` tree as one unit -- ...
  // resolution at runtime. Currently only the preferences window
  // (src/main/tray.ts) loads from here.
  './dist',
],
```

**After:**

```ts
extraResource: [
  './assets',
  // Vite-built React renderer (see vite.renderer.config.ts). Ship the
  // whole `dist/` tree as one unit -- its entry HTML files reference
  // assets with relative paths several directories up, so copying only
  // part of this tree (or flattening it) silently breaks asset
  // resolution at runtime. Both the menubar and preferences windows
  // (src/main/tray.ts) load from here.
  './dist',
],
```

`'./src/renderer'` is removed, per the brief. `'./assets'` and `'./dist'`
are kept unchanged.

### Deleted files

```
index.html                                          (root, dead Vite scaffold entry)
src/renderer.ts                                      (dead scaffold, mounted App.tsx into root index.html)
src/renderer/App.tsx                                  (dead scaffold, rendered PreferencesWindow)
src/renderer/components/preferences/AccountsTab.tsx   (dead scaffold, superseded by src/renderer/features/preferences/AccountsPage)
src/renderer/components/preferences/GeneralTab.tsx    (dead scaffold, superseded by .../GeneralPage)
src/renderer/components/preferences/NotificationsTab.tsx (dead scaffold, no live replacement needed — folded into GeneralPage)
src/renderer/components/preferences/PreferencesWindow.tsx (dead scaffold, superseded by src/renderer/windows/preferences/PreferencesApp.tsx)
src/renderer/components/preferences/ProjectsTab.tsx   (dead scaffold, superseded by .../ProjectsPage)
src/renderer/hooks/useAccounts.ts                     (dead scaffold, only consumer was the deleted components)
src/renderer/hooks/useTheme.ts                        (dead scaffold, only consumer was the deleted components)
src/renderer/index.html                               (vanilla menubar UI, 3974 lines)
src/renderer/preferences.html                         (vanilla preferences UI, 1296 lines)
```

**What was checked before deleting, per the outer instructions' explicit
warning not to delete the list blindly:**

- **Root `index.html`**: read its contents — `<script type="module"
  src="/src/renderer.ts">`, the dead scaffold's own entry point.
  `vite.renderer.config.ts`'s `build.rollupOptions.input` was inspected and
  it points at `src/renderer/windows/menubar/index.html` and
  `src/renderer/windows/preferences/index.html` — **not** the root
  `index.html**. The root file is not a Vite build entry for the real
  renderer config; it was scaffold left over from before the
  `windows/menubar` and `windows/preferences` entry points existed.
  Confirmed with `grep -rn "index.html"` across the repo (excluding
  `dist/` and `node_modules/`) that nothing outside the dead files
  themselves referenced it as an entry.
- **`src/renderer.ts`**: `grep -rln "renderer\.ts"` (excluding the file
  itself and comments) → no live importer anywhere.
- **`src/renderer/App.tsx`**: only importer was `src/renderer.ts` (also
  deleted). Its own import, `PreferencesWindow`, lives in
  `src/renderer/components/preferences/`, also deleted.
- **`src/renderer/components/`**: `grep -rln "renderer/components"` across
  `src/` → no hits outside the dead-scaffold files themselves. Each of the
  five `*Tab.tsx` / `PreferencesWindow.tsx` files was cross-checked against
  its `src/renderer/features/preferences/*Page` counterpart (confirmed to
  exist and be the live, tested replacement from earlier tasks).
- **`src/renderer/hooks/`**: `grep -rln "useAccounts\|useTheme"` → only
  hits were the dead components that imported them (now also deleted) and
  the hook files' own definitions.
- **`src/renderer/styles/`**: explicitly left untouched, per the outer
  instructions ("NOT yours to remove"). Note for the record: `global.css`
  and `preferences.css` in that directory were previously imported only by
  the now-deleted `App.tsx`; their only remaining reference in the repo is
  `src/test/cssTokenUsage.test.ts` (still passing). `tokens.css` in the
  same directory is actively imported by both
  `src/renderer/windows/menubar/main.tsx` and
  `src/renderer/windows/preferences/main.tsx` and is very much live. No
  action taken on any of these three files — flagging the now-orphaned
  status of `global.css`/`preferences.css` for whoever owns that directory
  next, not treating it as this task's problem to fix.
- **`src/renderer/windows/menubar/index.html` and
  `src/renderer/windows/preferences/index.html`**: these are the **real**
  Vite entry HTML files (confirmed referenced by
  `vite.renderer.config.ts`'s `rollupOptions.input`), completely distinct
  from the deleted `src/renderer/index.html` /
  `src/renderer/preferences.html` despite the similar names. **Not**
  touched.

## Resolved paths, dev vs packaged

Confirmed by a clean `rm -rf dist && npx vite build --config
vite.renderer.config.ts` on this machine (exit 0):

```
dist/
├── assets/
│   ├── menubar-D5wi7uAy.css
│   ├── menubar-Q5zLreS5.js
│   ├── preferences-D58-7_ub.js
│   ├── preferences-DI8Pku4q.css
│   ├── tokens-CRXLopla.js
│   └── tokens-ySZRZfY8.css
└── src/renderer/windows/
    ├── menubar/index.html       (references ../../../../assets/…)
    └── preferences/index.html   (references ../../../../assets/…)
```

`dist/src/renderer/windows/menubar/index.html` was inspected directly;
its `<script type="module" crossorigin src="../../../../assets/menubar-…js">`
and `<link ... href="../../../../assets/tokens-…css">` tags confirm the
same four-levels-up relative scheme Task 11 documented for preferences.

**Dev mode** (`app.isPackaged === false`):
`BUILT_RENDERER_ROOT = <project root>/dist`
→ menubar loads `<project root>/dist/src/renderer/windows/menubar/index.html`
→ preferences loads `<project root>/dist/src/renderer/windows/preferences/index.html`
(unchanged from Task 11)

**Packaged mode** (`app.isPackaged === true`):
`BUILT_RENDERER_ROOT = <resourcesPath>/dist`
→ menubar loads `<resourcesPath>/dist/src/renderer/windows/menubar/index.html`
→ preferences loads `<resourcesPath>/dist/src/renderer/windows/preferences/index.html`

Both windows now depend on the same `extraResource: ['./assets', './dist']`
entries; `'./src/renderer'` (the vanilla-sources copy) is gone, and nothing
in `tray.ts` references it anymore.

The `prestart` script Task 11 added (`vite build --config
vite.renderer.config.ts`, runs automatically before `pnpm start`) is
unchanged and now the *only* thing that produces `dist/` for either
window — there is no vanilla fallback left if it doesn't run.

## The two required greps — real output

### Grep 1

```
grep -rn "window.gitlabbar" src/ --include=*.ts --include=*.tsx | grep -v "src/preload.ts" | grep -v "src/renderer/windows"
```

This is **not empty**. It returns hits in four files, none of them
deleted-scaffold files:

- `src/renderer/utils/format.ts:104,138` — live code. This file renders
  markdown-style `[text](url)` links into an HTML string (used by
  merge-request/pipeline/release/untag row components via
  `dangerouslySetInnerHTML`), and the generated `<a onclick="...">`
  literally embeds the string `window.gitlabbar.app.openExternal(...)` as
  the runtime call the click handler makes in the renderer's real DOM.
  This predates Task 19 (file dated from an earlier port task) and has
  nothing to do with the deleted scaffold.
- `src/renderer/utils/format.test.ts` — the test file for the above;
  asserts on the exact generated HTML strings, including the
  `window.gitlabbar.app.openExternal(...)` substring.
- `src/renderer/features/preferences/AccountsPage/AccountsPage.tsx:33` —
  a doc comment referencing the API shape (`window.gitlabbar.accounts.
  validateToken(...)`), not a scaffold reference.
- `src/renderer/features/merge-requests/MergeRequestsTab.tsx:410` — a doc
  comment (`mirrors await window.gitlabbar.gitlab.dismissMR(mrId)`), same
  category.

**I verified this is not something I broke or missed.** I diffed
`window.gitlabbar` occurrence counts in the actually-deleted files against
`HEAD` before removing them:

```
src/renderer/index.html: 64
src/renderer/preferences.html: 25
src/renderer/components/preferences/GeneralTab.tsx: 4
src/renderer/components/preferences/NotificationsTab.tsx: 2
src/renderer/components/preferences/ProjectsTab.tsx: 4
src/renderer/hooks/useAccounts.ts: 5
src/renderer/hooks/useTheme.ts: 2
```

All 106 of those are gone now (the files no longer exist). The brief's
"six dead-scaffold files ... deleting them is what finally closes that
global constraint" undercounted slightly (it's seven files with
`window.gitlabbar`, including `index.html` and `preferences.html`
themselves) but was right in spirit — those are gone. What the brief did
not anticipate is that `format.ts` (a live, tested, pre-existing utility
outside `src/preload.ts` and `src/renderer/windows/`) also matches the
literal string `window.gitlabbar`, for a legitimate, unrelated reason: it
generates that exact JS call as part of rendered HTML output, not as an
import/reference to any deleted file. I'm reporting the real output rather
than the expected-empty result the brief predicted, per the instruction to
paste real output. I do not believe this represents a problem — no import,
`require`, or `loadFile` anywhere in `src/` or `forge.config.ts`
references any of the deleted paths (see the targeted greps below).

### Grep 2

```
grep -rn "renderer/index.html\|preferences.html\|src/renderer.ts" src/ forge.config.ts
```

Also **not empty** — dozens of hits, all in code comments (`// Ported
from src/renderer/index.html:442-476 ...`, `/* preferences.html:212-243
*/`, etc.) that attribute where a piece of ported markup/CSS/logic came
from in the vanilla source, for traceability during the migration. None of
these are live references to the deleted files as load paths, imports, or
build entries.

**Targeted follow-up greps to confirm no live code references the deleted
files** (run after the above, not part of the brief's required two, but
necessary to actually validate the "nothing references them" claim given
the two required greps both had non-scaffold noise):

```
grep -rn "from ['\"].*\(App\|renderer\.ts\|components/preferences\|hooks/useAccounts\|hooks/useTheme\)['\"]\|loadFile.*\(index\.html\|preferences\.html\)\|require(.*renderer\.ts" src/ forge.config.ts --include=*.ts --include=*.tsx
```
→ only false-positive substring matches on `MenubarApp`/`PreferencesApp`
(live, unrelated files); no actual hits on the deleted paths.

```
grep -rn "'\.\./\.\./components/preferences\|'\./components/preferences\|hooks/useAccounts'\|hooks/useTheme'" src/ --include=*.ts --include=*.tsx
```
→ no output (exit 1 / no matches).

```
grep -n "RENDERER_PATH" src/main/tray.ts
```
→ no output — the retired symbol has zero remaining references.

## New lint baseline

**40 errors** (down from the pre-existing baseline of 41; confirmed by
running lint on `HEAD` via `git stash` before re-applying these changes,
not just eyeballing the number).

Exactly one real error disappeared: `src/renderer/components/preferences/
AccountsTab.tsx:6:78 'isLoading' is assigned a value but never used`, in a
file that no longer exists. Everything else is unchanged: the three
`tray.ts` errors present at baseline (`'e' is defined but never used`,
`'y' is never reassigned. Use 'const' instead`, one `Unexpected any`) are
still present, just at shifted line numbers (98→90, 229→221, 322→314)
because deleting the `RENDERER_PATH` block moved code up — same errors,
not new ones. `forge.config.ts` contributes zero lint errors, unchanged.
Diffed the full before/after lint output line-by-line to confirm this,
not just the summary count.

## Verified (this machine)

- `pnpm run typecheck` → exit 0, no output.
- `pnpm run test:run` → **379/379 tests pass, 24 files**, including
  `src/test/viteRendererConfig.test.ts` (still guards `base: './'`,
  untouched) and `src/test/cssTokenUsage.test.ts` (still passing;
  unaffected by the untouched `src/renderer/styles/` directory).
- `pnpm run lint` → 40 errors (down from 41), fully accounted for above via
  a line-by-line diff against a `git stash`-verified baseline run.
- `rm -rf dist && npx vite build --config vite.renderer.config.ts` → exit
  0. Output tree matches the nested `src/renderer/windows/<name>/
  index.html` + `assets/` structure exactly as documented. Inspected
  `dist/src/renderer/windows/menubar/index.html` directly and confirmed
  its `<script>`/`<link>` tags use the `../../../../assets/…` relative
  scheme.
- Read the full diff of `src/main/tray.ts` and `forge.config.ts`.
  Confirmed `RENDERER_PATH` has zero remaining references anywhere in the
  file, and that `getBuiltRendererEntry()` / `BUILT_RENDERER_ROOT` are
  otherwise byte-for-byte unchanged from Task 11's version.
- Confirmed via targeted greps (above) that no import, `require`, or
  `loadFile` call anywhere in `src/` or `forge.config.ts` references any
  of the twelve deleted files.
- Confirmed `src/renderer/styles/`, `src/renderer/windows/menubar/
  index.html`, and `src/renderer/windows/preferences/index.html` (the
  real Vite entries) were **not** touched, despite similar filenames to
  what was deleted.

## Explicitly NOT verified — cannot be, on this machine

- That an actual `BrowserWindow.loadFile()` call against
  `dist/src/renderer/windows/menubar/index.html` renders anything. No
  Electron GUI runtime available here.
- That the menubar UI (merge requests, pipelines, releases/PO view, untag
  tab — all of Tasks 7-18's work) actually renders and behaves correctly
  when loaded as a real bundled `BrowserWindow` page, as opposed to
  passing in `vitest`'s jsdom environment.
- That the **preferences window** (Task 11's switch) works either — it was
  never verified on macOS, per Task 11's own report, and this task does
  not change anything about it except removing the now-unused `'./src/
  renderer'` `extraResource` entry it never depended on.
- That a *packaged* app (`electron-forge package` / `make` on macOS) puts
  `dist/` at `resourcesPath/dist` as expected, that `app.isPackaged`
  branches resolve correctly, and that removing `'./src/renderer'` from
  `extraResource` doesn't break something packaging-related that isn't
  visible from a plain `vite build`.
- Anything macOS-specific: tray icon click behavior, window vibrancy,
  `alwaysOnTop`/`skipTaskbar` interactions, code signing/notarization with
  the now-smaller `extraResource` list.
- That deleting `src/renderer/styles/global.css` and `preferences.css`'s
  only non-test consumer (the deleted `App.tsx`) doesn't matter — it
  shouldn't, since neither is imported by any live window entry, but this
  was not exercised at runtime.

## Human verification checklist (macOS required)

**Rollback, if anything below fails:** `git revert 29e4dfc`
restores every deleted vanilla file and both config changes in one step —
but read "Rollback" below first; it is not as simple as Task 11's, because
the vanilla files are gone from disk, not just unreferenced.

1. Check out this commit on a Mac with the full toolchain, `pnpm install`
   if needed.
2. `pnpm start`. The `prestart` script (`vite build --config
   vite.renderer.config.ts`) runs automatically first — confirm you see
   Vite build output (`✓ NN modules transformed`, per-file sizes for both
   `dist/.../menubar/index.html` and `dist/.../preferences/index.html`)
   in the terminal before Electron/Forge log lines start. If `dist/` is
   missing or stale for any reason, **both** windows will now fail (there
   is no vanilla fallback left for either).
3. Click the tray icon (left-click, not right-click) to open the
   **menubar window**.
4. **Success looks like**: the same menubar UI as before — merge
   requests, pipelines, releases (including the product-owner view if
   applicable), and the untag tab, all showing real data (or an
   appropriate empty/error state) exactly as the vanilla version did.
   Resize the window and confirm the saved size persists across restarts
   (this behavior is unchanged, driven by `windowStore`, not the renderer
   switch). Click a merge-request/pipeline link and confirm it opens in
   the external browser (this exercises the still-live
   `window.gitlabbar.app.openExternal` path documented above in the grep
   1 discussion).
5. Right-click the tray icon → **Preferences…** and sanity-check the
   preferences window still works (Task 11's switch, still unverified
   itself — see its own checklist in `task-11-report.md`, which this task
   does not repeat but does not want silently skipped either since both
   windows now share the exact same failure modes). Task 11's DevTools
   instructions there remain accurate and are worth following if you hit
   a problem. **Its rollback line is stale as of this commit**, though:
   it says `preferences.html` (the old vanilla window) was never deleted,
   so reverting Task 11's commit alone restores a working vanilla window.
   That is no longer true — this task deleted `preferences.html`. The
   correct rollback for **both** windows now is this task's
   `git revert 29e4dfc` (see below), not Task 11's commit.
6. Quit and relaunch (`pnpm start` again) and repeat steps 3-5 to catch any
   first-launch-only vs. warm-launch difference.

### If the menubar window is blank instead

Same three-branch diagnostic Task 11 documented for preferences — repeated
here because it now applies to the menubar too, and because there is no
DevTools toggle currently wired up for the menubar window (the only one in
`tray.ts` is commented out, at the `// DevTools in dev - disabled` block
in `createMenuWindow()`).

**Step A — check the terminal log line.** Every time you open the
menubar, the terminal prints:

```
Loading renderer from: /path/to/GitLabBar/dist/src/renderer/windows/menubar/index.html
```

Copy that exact path and run `ls -la "<the path from the log>"`.

- **File does NOT exist** → the `prestart` build never ran or failed
  silently. Run `pnpm exec vite build --config vite.renderer.config.ts`
  yourself, check its exit code and output, and retry.
- **File exists** → not a path/packaging problem. Continue to Step B.

**Step B — open DevTools for the menubar window and look at the
console.** In `src/main/tray.ts`, inside `createMenuWindow()`, there is
already a commented-out block right after `this.menuWindow.show();`:

```ts
// DevTools in dev - disabled
// if (!app.isPackaged) {
//   this.menuWindow.webContents.openDevTools({ mode: 'detach' });
// }
```

Uncomment those three lines (do not add a new call elsewhere — this is
the correct, existing insertion point). Save, let Forge pick it up (or
restart `pnpm start`), reopen the menubar.
Check the DevTools **Console** and **Network** tabs:

- **404s for paths containing `assets/`** (e.g.
  `../../../../assets/menubar-XXXX.js` failed) → the relative-path
  scheme is broken, or the shipped/used `dist/` tree is incomplete. This
  would be a real bug in this task's `getBuiltRendererEntry('menubar')`
  wiring or the `extraResource` change — report it with the exact 404'd
  URL from the Network tab.
- **A JavaScript exception** (red error, stack trace) → the file loaded
  but the React app crashed while running. This is a bug in the React
  port of the menubar (Tasks 7-18), not in this task's path-switching,
  but still blocks calling this task done.
- **Console clean, no failed requests, but `<div id="root"></div>` in
  Elements has no children** → JS loaded and ran without throwing, but
  React never mounted, or `window.gitlabbar` (the preload contextBridge
  surface) isn't present. Worth flagging specifically because — same
  reasoning as Task 11's report for preferences — this may be the point
  where an as-yet-unexercised preload/contextIsolation interaction
  surfaces for the menubar for the first time under a bundled-JS load
  instead of raw inline `<script>` source. Report exactly what's in
  Console and Elements.

Remove the temporary `openDevTools` line before considering the app
"normal" again — it must not ship.

## Rollback

```bash
git revert 29e4dfc
```

restores all twelve deleted files and both config changes. **Important
difference from Task 11's rollback**: Task 11 could revert cleanly because
the vanilla preferences file was left on disk the whole time — reverting
just changed which path `tray.ts` pointed at. Here, the vanilla files
themselves are gone. A `git revert` brings them back in the git history
and working tree, but:

- Anyone who already pulled this commit and has a build/package
  artifact based on it will need to **rebuild** — the old files won't
  reappear in an already-packaged app.
- `git revert` restores the files correctly (verified this is a pure
  file-restoration + two-file edit-reversal commit, nothing else touched),
  but it does not undo any already-shipped release built from this commit.

Manual, non-revert rollback if preferred: restore the twelve files listed
under "Deleted files" from the parent commit
(`git checkout 8d959dd -- <path>` for each), restore the
`RENDERER_PATH` constant and the menubar's `path.join(RENDERER_PATH,
'index.html')` call in `src/main/tray.ts`, and restore the `'./src/
renderer'` entry in `forge.config.ts`'s `extraResource`.
