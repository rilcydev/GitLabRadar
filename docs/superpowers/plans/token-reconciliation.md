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
  window under two different custom-property names (e.g. `--bg-card` for
  the menubar window, `--bg-card-preferences` for the preferences window).
  Neither window's rendered value changes; this is pure consolidation.

## From the brief's table (dark theme)

| Token | Old (index.html / menubar) | Old (preferences.html) | New | Resolution | Window(s) whose rendered value changes |
|---|---|---|---|---|---|
| `--bg-elevated` / `--bg-elevated-opaque` | `rgba(18,18,20,0.85)` | `rgba(18,18,20,0.95)` | `--bg-elevated: rgba(18,18,20,0.85)`, `--bg-elevated-opaque: rgba(18,18,20,0.95)` | Split (no visual change) — preferences window is not vibrancy-backed | none |
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
| `--bg-base` / `--bg-base-preferences` | `#f8f9fa` | `#f5f5f7` | `--bg-base: #f8f9fa`, `--bg-base-preferences: #f5f5f7` | Split (no visual change) | none |
| `--bg-elevated` / `--bg-elevated-opaque` | `rgba(255,255,255,0.9)` | `rgba(255,255,255,0.95)` | `--bg-elevated: rgba(255,255,255,0.9)`, `--bg-elevated-opaque: rgba(255,255,255,0.95)` | Split (no visual change) — same token pair as the dark-theme `--bg-elevated` divergence, extended to light | none |
| `--bg-card` / `--bg-card-preferences` | `rgba(255,255,255,0.7)` | `rgba(255,255,255,0.8)` | `--bg-card: rgba(255,255,255,0.7)`, `--bg-card-preferences: rgba(255,255,255,0.8)` | Split (no visual change) | none |
| `--bg-card-hover` / `--bg-card-hover-preferences` | `rgba(245,245,250,0.9)` | `rgba(250,250,255,0.9)` | `--bg-card-hover: rgba(245,245,250,0.9)`, `--bg-card-hover-preferences: rgba(250,250,255,0.9)` | Split (no visual change) | none |
| `--shadow-md` / `--shadow-md-preferences` | `rgba(0,0,0,0.12)` (i.e. `0 4px 16px rgba(0,0,0,0.12)`) | `rgba(0,0,0,0.1)` (i.e. `0 4px 16px rgba(0,0,0,0.1)`) | `--shadow-md: 0 4px 16px rgba(0,0,0,0.12)`, `--shadow-md-preferences: 0 4px 16px rgba(0,0,0,0.1)` | Split (no visual change) | none |
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
