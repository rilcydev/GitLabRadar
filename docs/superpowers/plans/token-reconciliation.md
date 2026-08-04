# Token reconciliation — Task 6

`src/renderer/styles/tokens.css` consolidates the design tokens that
`src/renderer/index.html` (menubar window) and `src/renderer/preferences.html`
(preferences window) previously each defined inline and inconsistently.

This is the **allow-list of acceptable visual differences** for the parity
review. Every token below either (a) has its value changed for one or both
windows relative to what that window rendered before this task, or (b) had
its logical value split into two window-specific tokens purely so that no
window's rendered value changes. Anything not listed here is a regression.

Two kinds of entries appear:

- **Unified** — both windows now compute to the same value; one window's
  rendered output changes. Only done where explicitly authorized by the
  task-6 brief's divergence table.
- **Split (no visual change)** — the two windows disagreed and there was no
  authorization to unify them, so the value was kept byte-for-byte per
  window under two differently-named custom properties, with **no bare/
  unsuffixed name at all** — see "Naming scheme" below.
  Neither window's rendered value changes; this is pure consolidation.

## Naming scheme (revised in fix round 1)

**A bare token name means the value is identical for both windows** (or was
deliberately unified — see the two glow tokens below). **A token that
genuinely differs between the two windows has no bare name**; both sides
carry an explicit `-menubar` or `-preferences` suffix, e.g. `--bg-card-menubar`
/ `--bg-card-preferences`. There is no naive/default token to reach for by
accident — a CSS Module author must pick the window they're styling.

The original version of this file and of `tokens.css` used an inconsistent
scheme for split tokens: the unsuffixed name silently carried the menubar
value (e.g. `--bg-card` meant "menubar", with `--bg-card-preferences` as the
override), and one pair used a one-off `-opaque` suffix instead of
`-preferences` (`--bg-elevated` / `--bg-elevated-opaque`). That was flagged
in code review as a trap: an agent building a preferences-window CSS Module
in Tasks 8-18 would naturally reach for the bare name and silently get the
menubar's value instead, and the `-opaque` outlier would evade a
`-preferences` grep sweep. Fix round 1 renamed every split pair so both
sides are always explicit and consistently suffixed. No token value changed
in this rename — see "Fix round 1" at the bottom of this document for the
full rename map and verification.

## From the brief's table (dark theme)

| Token | Old (index.html / menubar) | Old (preferences.html) | New | Resolution | Window(s) whose rendered value changes |
|---|---|---|---|---|---|
| `--bg-elevated-menubar` / `--bg-elevated-preferences` | `rgba(18,18,20,0.85)` | `rgba(18,18,20,0.95)` | `--bg-elevated-menubar: rgba(18,18,20,0.85)`, `--bg-elevated-preferences: rgba(18,18,20,0.95)` | Split (no visual change) — preferences window is not vibrancy-backed | none |
| `--accent-green-glow` | `rgba(16,185,129,0.4)` | `rgba(16,185,129,0.3)` | `rgba(16,185,129,0.4)` | Unified to `0.4` | **preferences** (0.3 → 0.4) |
| `--accent-red-glow` | `rgba(239,68,68,0.4)` | `rgba(239,68,68,0.3)` | `rgba(239,68,68,0.4)` | Unified to `0.4` | **preferences** (0.3 → 0.4) |
| `--bg-input` | absent | `rgba(20,20,24,0.8)` | `rgba(20,20,24,0.8)` | Promoted to shared (no conflicting value existed) | none |
| `--bg-card-active`, `--text-muted`, `--accent-cyan`, `--accent-orange`, `--accent-orange-glow`, `--gradient-blue`, `--gradient-green`, `--gradient-orange`, `--gradient-red`, `--shadow-sm`, `--shadow-lg`, `--shadow-glow` | present (menubar-only) | absent | unchanged value | Promoted to shared (no conflicting value existed) | none |
| `--gradient-mesh` | 3 radial stops | 2 radial stops | `--gradient-mesh-menubar` (3 stops), `--gradient-mesh-preferences` (2 stops) | Split (no visual change), per-window rename | none |

## Additional tokens found missing from the brief's "promote" list (dark theme)

These are present only in `index.html` (menubar) and absent from
`preferences.html`, same as the other "promote to shared" rows above, but
weren't named individually in the brief's table. No value conflict — no
rendered change for either window.

| Token | Old (menubar) | Old (preferences) | New | Resolution |
|---|---|---|---|---|
| `--accent-blue-glow` | `rgba(59,130,246,0.4)` | absent | `rgba(59,130,246,0.4)` | Promoted to shared |
| `--radius-xl` | `20px` | absent | `20px` | Promoted to shared |

## Light-theme divergences (not covered by the brief's table — discovered during this task)

The brief's table only documents the dark-theme divergences. Consolidating
the `@media (prefers-color-scheme: light)` blocks surfaced further
disagreements between the two windows that the brief does not authorize
unifying. Per the task's instruction ("if you find yourself unifying a token
the brief's table does not name — stop"), these are all resolved as **splits**,
preserving each window's original light-theme value byte-for-byte under a
window-specific token name. No rendered value changes for either window.

| Token | Old (index.html light) | Old (preferences.html light) | New | Resolution | Window(s) whose rendered value changes |
|---|---|---|---|---|---|
| `--bg-base-menubar` / `--bg-base-preferences` | `#f8f9fa` | `#f5f5f7` | `--bg-base-menubar: #f8f9fa`, `--bg-base-preferences: #f5f5f7` | Split (no visual change) | none |
| `--bg-elevated-menubar` / `--bg-elevated-preferences` | `rgba(255,255,255,0.9)` | `rgba(255,255,255,0.95)` | `--bg-elevated-menubar: rgba(255,255,255,0.9)`, `--bg-elevated-preferences: rgba(255,255,255,0.95)` | Split (no visual change) — same token pair as the dark-theme `--bg-elevated` divergence, extended to light | none |
| `--bg-card-menubar` / `--bg-card-preferences` | `rgba(255,255,255,0.7)` | `rgba(255,255,255,0.8)` | `--bg-card-menubar: rgba(255,255,255,0.7)`, `--bg-card-preferences: rgba(255,255,255,0.8)` | Split (no visual change) | none |
| `--bg-card-hover-menubar` / `--bg-card-hover-preferences` | `rgba(245,245,250,0.9)` | `rgba(250,250,255,0.9)` | `--bg-card-hover-menubar: rgba(245,245,250,0.9)`, `--bg-card-hover-preferences: rgba(250,250,255,0.9)` | Split (no visual change) | none |
| `--shadow-md-menubar` / `--shadow-md-preferences` | `rgba(0,0,0,0.12)` (i.e. `0 4px 16px rgba(0,0,0,0.12)`) | `rgba(0,0,0,0.1)` (i.e. `0 4px 16px rgba(0,0,0,0.1)`) | `--shadow-md-menubar: 0 4px 16px rgba(0,0,0,0.12)`, `--shadow-md-preferences: 0 4px 16px rgba(0,0,0,0.1)` | Split (no visual change) | none |
| `--gradient-mesh` | 3 radial stops (light values) | 2 radial stops (light values) | `--gradient-mesh-menubar`, `--gradient-mesh-preferences` (light values under the same names as the dark split) | Split (no visual change), continuation of the dark-theme rename | none |

Note that `--shadow-md`'s *dark* value is identical between the two windows
(`0 4px 16px rgba(0, 0, 0, 0.4)` in both `index.html` and `preferences.html`),
so `--shadow-md-preferences` in the dark block is set to that same value
purely so the preferences window has one consistent token name to reference
across both themes; this is not a value change, just consistent naming.
The same reasoning applies to `--bg-card-preferences`,
`--bg-card-hover-preferences`, and `--bg-base-preferences` in the dark block:
their dark values are copied unchanged from the shared token because the
two windows already agreed there.

## Net summary — which tokens actually change a window's rendered appearance

Only two tokens change what is actually painted on screen, both authorized
explicitly by the brief, both affecting only the **preferences window**,
both **dark theme only**:

- `--accent-green-glow`: preferences window's dark-theme glow opacity changes from `0.3` to `0.4`.
- `--accent-red-glow`: preferences window's dark-theme glow opacity changes from `0.3` to `0.4`.

Every other change in this document is a rename/split that preserves the
exact previous byte-for-byte value for both windows in both themes.

---

## Fix round 1

An independent byte-fidelity review of the original Task 6 output found
**zero value defects** — all seven divergences documented above were
confirmed correct, no eighth was found, and the completeness check (37
union token names, none silently dropped) held. The one finding was a
naming-scheme hazard, raised by the implementing agent itself and confirmed
by the reviewer: for the five split tokens, the **unsuffixed name silently
carried the menubar value**, and one pair (`--bg-elevated` /
`--bg-elevated-opaque`) used a one-off `-opaque` suffix instead of
`-preferences`. An agent writing a preferences-window CSS Module in Tasks
8-18 would naturally reach for the bare name as "the default" and silently
get the menubar's value — a regression that typecheck, lint, and the test
suite would not catch, surfacing only when a human looks at the running app.

### Rename map (values unchanged — only names moved)

No token's *value* changed in this fix (the two authorized glow unifications
from Task 6 are untouched). Every split token was renamed so **both** sides
carry an explicit window suffix and neither has a bare/default name:

| Old name (menubar side) | Old name (preferences side) | New name (menubar) | New name (preferences) |
|---|---|---|---|
| `--bg-base` | `--bg-base-preferences` | `--bg-base-menubar` | `--bg-base-preferences` (unchanged) |
| `--bg-elevated` | `--bg-elevated-opaque` | `--bg-elevated-menubar` | `--bg-elevated-preferences` |
| `--bg-card` | `--bg-card-preferences` | `--bg-card-menubar` | `--bg-card-preferences` (unchanged) |
| `--bg-card-hover` | `--bg-card-hover-preferences` | `--bg-card-hover-menubar` | `--bg-card-hover-preferences` (unchanged) |
| `--shadow-md` | `--shadow-md-preferences` | `--shadow-md-menubar` | `--shadow-md-preferences` (unchanged) |
| `--gradient-mesh-menubar` | `--gradient-mesh-preferences` | *(no change — already followed this shape)* | *(no change)* |

Every token in this document's tables above is written using the **new**
(post-fix) names.

### Dropped-token check, re-run after the rename

```
$ grep -o '^\s*--[a-z-]*' /tmp/tokens-menubar.css /tmp/tokens-prefs.css | sed 's/.*--/--/' | sort -u > /tmp/tokens-before.txt
$ grep -o '^\s*--[a-z-]*' src/renderer/styles/tokens.css | sed 's/.*--/--/' | sort -u > /tmp/tokens-after.txt
$ comm -23 /tmp/tokens-before.txt /tmp/tokens-after.txt
--bg-base
--bg-card
--bg-card-hover
--bg-elevated
--gradient-mesh
--shadow-md

$ comm -13 /tmp/tokens-before.txt /tmp/tokens-after.txt
--bg-base-menubar
--bg-base-preferences
--bg-card-hover-menubar
--bg-card-hover-preferences
--bg-card-menubar
--bg-card-preferences
--bg-elevated-menubar
--bg-elevated-preferences
--gradient-mesh-menubar
--gradient-mesh-preferences
--shadow-md-menubar
--shadow-md-preferences
```

All six "dropped" bare names are exactly the six tokens renamed above
(`--gradient-mesh` was already renamed in the original Task 6 pass;
`--bg-base`, `--bg-card`, `--bg-card-hover`, `--bg-elevated`, and
`--shadow-md` lost their bare form in this fix). No unexplained line —
every dropped name has a corresponding pair of newly-added, explicitly
suffixed names.

### Mechanical guard added

`src/test/cssTokenUsage.test.ts` (with its extractor helpers in
`src/test/cssTokens.ts`) extracts every `var(--…)` reference from `*.module.css`
files under `src/renderer/` and asserts each one resolves to a token
declared in `src/renderer/styles/tokens.css`. Scope is `*.module.css`
specifically (the actual future consumers per the Task 6 interface —
"Every CSS Module in Tasks 8-18 uses `var(--…)`"), not every CSS file under
`src/renderer/`: `src/renderer/styles/global.css` and
`src/renderer/styles/preferences.css` predate this migration and define an
entirely separate, unrelated token vocabulary (`--color-*`, `--spacing-*`,
`--font-*`); scanning them against `tokens.css` would be a false-positive
factory, not a real check.

Because zero CSS Modules exist yet, the real-project-scan assertion in that
test currently passes vacuously by itself. To prove the detector is
load-bearing rather than decorative, the test also runs against two fixture
files under `src/test/fixtures/css/`:

- `invalid-token-usage.module.css` — deliberately references
  `var(--does-not-exist)`, which is not declared anywhere in `tokens.css`.
  The test asserts the extractor flags exactly that one undefined
  reference.
- `valid-token-usage.module.css` — references only tokens that are declared
  (including a window-specific split token,
  `var(--shadow-md-preferences)`), and the test asserts nothing is flagged.

These fixtures live outside `src/renderer/`, so they are never picked up by
the real project scan — they're read directly by name — which means they
can't accidentally "fix" the vacuous-pass problem by polluting the real
scan; they exist solely to prove the extractor's detection logic works
today, independent of whether any real CSS Modules exist yet.

### Commands run and real output

```
$ npm run test:run
 ✓ src/test/cssTokenUsage.test.ts (4 tests) 7ms
 ✓ src/renderer/api/ApiContext.test.tsx (2 tests) 42ms
 ✓ src/test/renderWithApi.test.tsx (5 tests) 62ms
 ✓ src/renderer/api/FakeApi.test.ts (5 tests) 9ms
 ✓ src/shared/api/createElectronApi.test.ts (37 tests) 22ms
 ✓ src/shared/api/channels.test.ts (3 tests) 5ms
 ✓ src/test/harness.test.ts (2 tests) 16ms

 Test Files  7 passed (7)
      Tests  58 passed (58)
```
58 = the original 54-test baseline + the 4 new guard tests. No regressions.

```
$ npm run typecheck
> tsc --noEmit
(no output — clean)
```

```
$ npm run lint
✖ 41 problems (41 errors, 0 warnings)
```
41 — matches the documented pre-existing baseline exactly. Confirmed with
`npm run lint 2>&1 | grep -i "cssTokens\|cssTokenUsage\|fixtures/css"` → no
hits: none of the new files contributed any lint error.

`git status --short` before committing:

```
 M docs/superpowers/plans/token-reconciliation.md
 M src/renderer/styles/tokens.css
?? src/test/cssTokenUsage.test.ts
?? src/test/cssTokens.ts
?? src/test/fixtures/css/
```

`src/renderer/index.html`, `src/renderer/preferences.html`,
`src/renderer/styles/global.css`, and `src/renderer/styles/preferences.css`
remain untouched, as required.
