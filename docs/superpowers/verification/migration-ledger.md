# SDD ledger — plan: docs/superpowers/plans/2026-08-04-react-migration.md

Branch: react-migration
Base: e747e66 (plan commit)
Started: 2026-08-04

## Progress

Task 1: implemented (commit f570fa5), DONE_WITH_CONCERNS, review dispatched
Task 1: deviation — config is `vitest.config.mts`, NOT `vitest.config.ts` as the plan
  says. Root package.json has no `"type": "module"`, so the `.ts` name makes Vite's
  loader `require()` the ESM-only @vitejs/plugin-react and the run fails. Later tasks
  that touch the vitest config must use the `.mts` path.
Task 1: controller-verified independently — `npm run test:run` PASS (1 test, vitest 3.2.7)
Task 1: review — spec OK, `.mts` deviation accepted (reviewer reproduced the failure
  independently; also found that `scripts/generate-icons.js` uses require() and would
  break under `"type": "module"`). 1 Important finding -> fix round 1.
Task 1: fix round 1 dispatched — tsconfig.json lacks `paths` for the `@` alias, so
  `tsc --noEmit` fails (TS2307) on any `@/...` import while Vite/Vitest resolve it fine.
  Latent landmine for every later React task. Fix + alias-resolution test in the suite.
Task 1: minor (deferred): if a later test file relies on `globals: true` without importing
  describe/it/expect, tsc needs `"types": ["vitest/globals"]` in tsconfig. Not an issue
  while tests import explicitly, as the plan's samples do.
Task 1: controller edited the PLAN (not code) to say `vitest.config.mts` everywhere, so
  briefs generated for later tasks cannot reference the broken filename. Committed
  separately as d432595 (controller bookkeeping, not implementer scope creep — the
  re-reviewer flagged it as an unexplained extra commit; this is the explanation).
Task 1: fix round 1/5 (1 addressed, 0 open; commits f570fa5..1ca7bb4). Re-reviewer
  proved the alias test is load-bearing by deleting `paths` from tsconfig (tsc TS2307)
  and `resolve.alias` from vitest config (Vite resolution error), then reverting both.
Task 1: complete (commits e747e66..1ca7bb4, review clean)

INTERFACES PRODUCED BY TASK 1 — later tasks depend on these:
  - `npm run test:run` (vitest run), `npm test` (watch), `npm run typecheck` (tsc --noEmit)
  - config lives at `vitest.config.mts` (NOT .ts — see above)
  - jsdom env, globals: true, setupFiles `src/test/setup.ts` (RTL cleanup after each)
  - include glob: `src/**/*.test.ts`, `src/**/*.test.tsx`
  - `@/*` alias resolves to `src/*` in Vite, Vitest AND TypeScript. Safe to use.
  - fixture `src/test/fixtures/alias-target.ts` guards alias resolution; do not delete.

Task 2: implemented (commit 072bb0f), DONE_WITH_CONCERNS. Review found 3 Critical,
  3 Important. TWO OF THE CRITICALS ORIGINATE IN THE PLAN, not the implementer:
  (a) `Exact<>` assertions were non-functional — mismatch branch resolved to `never`,
      and `never extends true` always succeeds (bottom type). Reviewer proved both
      drift directions passed typecheck at exit 0. Fix: mismatch resolves to `false`.
  (b) return types for accounts.add/remove/update were GUESSED in the plan because
      preload.ts is Promise<any>. Real shapes are in src/main/ipc/handlers.ts and are
      `{success, account?, error?}` / `{success, error?}`. Existing pre-migration code
      at src/renderer/hooks/useAccounts.ts:36,48,60 already reads `result.success`, so
      the wrong types would break the moment window.gitlabbar is typed (Task 3).
  Also Important: MRNote uses `createdAt` not `created_at` and its author has no `id`;
  PolledData.lastUpdated is a Date (structured clone, not JSON) and omits `error?`.
Task 2: LESSON RECORDED IN PLAN — preload.ts is untyped and is NOT ground truth for
  return shapes; src/main/ipc/handlers.ts is. Plan corrected accordingly.
Task 2: minor (deferred): constants barrel creates a dual import path, but mirrors the
  pre-existing pattern of src/shared/types/index.ts. Cleanup pass, not a blocker.
Task 2: minor (deferred): dismissPipeline/restorePipelines/dismissMR/restoreMRs/
  dismissRelease/restoreReleases/clearUntagExclusions/config.set are declared `void`
  but resolve `{success:true}`. Type-sound (wider return assignable to void slot) and
  nothing reads them. Revisit only if a caller ever needs the result.
Task 2: minor (deferred): untracked `dist/` from a vite build sanity check — check
  .gitignore covers it before any task commits build output by accident.
Task 2: fix round 1/5 (6 addressed, 0 open; commits 072bb0f..e394e99). Re-reviewer
  re-proved both drift directions itself: TS2344 at contract.ts:158 and :159, exit 2,
  reverted clean. Verified findings 2-5 against handlers.ts/polling.ts directly rather
  than against the controller's finding list.
Task 2: ruling — `accounts.update(accountId, updates)` takes `Partial<GitLabAccount>`
  while the handler really accepts `Partial<Omit<GitLabAccount,'id'>>`. Strictly WIDER,
  so no call site breaks; not a drift hole. Deferred, tighten opportunistically.
Task 2: minor (deferred): TrayStatus is now defined identically in three places
  (tray.ts:5, polling.ts:8, contract.ts). Triplication predates this work — two copies
  already existed. Consolidate into src/shared/types in a later cleanup task.
Task 2: complete (commits d432595..e394e99, review clean)

INTERFACES PRODUCED BY TASK 2 — later tasks depend on these:
  - `src/shared/api/channels.ts`: COMMAND_CHANNELS (32, 4 namespaces), EVENT_CHANNELS (4)
  - `src/shared/api/contract.ts`: GitLabBarApi, Unsubscribe, RefreshStatus, TrayStatus,
    ValidatedUser, TokenValidation, AccountMutationResult, AccountRemovalResult,
    ProjectSearchResult, ProjectMember, MRNote, GitLabGroupSummary, PolledData
  - `src/shared/constants/index.ts`: barrel re-exporting ipcChannels
  - The Exact<> assertions in contract.ts:150-160 FAIL typecheck on manifest/interface
    drift, in both directions. Verified. Never weaken them to make a build pass.
  - GROUND TRUTH RULE: preload.ts is Promise<any> and proves nothing about return
    shapes. Read src/main/ipc/handlers.ts. This cost one fix round already.

Task 3: implemented (commit 48cc4ab), DONE. preload.ts 111 lines -> 5. typecheck exit 0
  project-wide INCLUDING src/renderer/hooks/useAccounts.ts, which reads result.success
  off the account mutations — independent confirmation that Task 2's corrected return
  types describe reality.
Task 3: review — spec OK, surface equivalence independently reconstructed (36 entries:
  5 accounts + 20 gitlab + 3 config + 4 app + 4 on, no adds/drops/renames). Event
  unsubscribe lifecycle verified correct (fresh closure per call, removeListener is a
  no-op when already gone, so double-unsubscribe is safe). Casts contained.
Task 3: 1 Important -> fix round 1. `as unknown as GitLabBarApi` blankets the whole
  returned object, so the compiler checks NONE of the 4 namespace->channel-map wirings
  nor the 4 hand-written on.* wirings. All 8 verified correct today by hand, but the
  guarantee rests on manual review. Reviewer built and typechecked a per-namespace
  generic builder that catches miswiring as TS2739. Tests also too thin: 1 of 32
  commands and 1 of 4 events exercised for routing — inherited from the plan's own
  test, not implementer skimping. Fix: typed builder + table-driven test over all 36.
Task 3: fix round 1/5 (1 addressed, 0 open; commits 48cc4ab..29b3136). 42 tests.
Task 3: ruling — implementer REJECTED the controller's instruction to build `on`
  reflectively via Object.keys(EVENT_CHANNELS).map(). Re-reviewer reproduced the claim
  in the real file: TS does not narrow the loop variable per iteration, so single-entry
  miswiring inside the loop typechecks at 0 errors; only an all-wrong build errors.
  The instruction was factually wrong for its own goal. Explicit per-key generic call
  sites are strictly better. Deviation RULED CORRECT.
Task 3: KNOWN PERMANENT GAP, mitigated by test not types — miswiring `on.error` to the
  refreshStatus channel typechecks silently, because RefreshStatus is a string-literal
  subtype of the `string` payload `on.error` accepts. The reverse direction IS caught
  (TS2322). Structural consequence of subtyping, not an accident. The table-driven test
  catches it (verified: fails `on.error subscribes...` with the wrong channel string).
  If a future task changes contract.ts payload types, re-check this.
Task 3: complete (commits 4e7e9bf..29b3136, review clean)

INTERFACES PRODUCED BY TASK 3 — later tasks depend on these:
  - `src/shared/api/createElectronApi.ts`: `createElectronApi(ipc: IpcLike): GitLabBarApi`
    plus the `IpcLike` interface. 3 narrow casts, all local to this file.
  - `src/preload.ts` is now 5 lines: exposes `createElectronApi(ipcRenderer)` as
    `window.gitlabbar`, typed as GitLabBarApi via src/global.d.ts.
  - STILL OPEN, by design: 6 renderer files still reference window.gitlabbar directly
    (useAccounts.ts, useTheme.ts, ProjectsTab/GeneralTab/NotificationsTab). They are
    dead scaffold, deleted in Task 19. The "no window.gitlabbar outside preload and
    renderer/api" constraint is NOT satisfied project-wide yet — do not mistake it
    for closed.

Task 4: implemented (commit 5558ab8), DONE. 46 tests repo-wide. NO casts anywhere —
  each namespace typed against GitLabBarApi[NS] before assembly. Strongest evidence so
  far that the contract is honestly implementable.
Task 4: REPO GAP for all later tasks — ESLint has no TS-aware import resolver, so
  `import/no-unresolved` cannot follow `@/*` for VALUE imports (type-only imports are
  fine). Same gap already visible in src/test/harness.test.ts. Guidance for later
  tasks: use relative paths for value imports, `@/` is safe for `import type`. Fixing
  properly needs eslint-import-resolver-typescript (a devDependency, permitted) — not
  done mid-plan because lint is not a gate and already has 41 pre-existing errors.
Task 4: baseline lint = 41 pre-existing errors. Later tasks must compare against that
  number, not against zero.
Task 4: review — 1 Important. config.get/getAll handed out LIVE references into the
  fake's store for object/array keys. Real Electron structured-clones every invoke
  reply, so a component with "read config, mutate locally, forget to persist" would
  pass its test and silently fail in the app. Fixed by structuredClone on the read path.
Task 4: fix round 1/5 (1 addressed, 0 open; commits 5558ab8..e2df6c8). Re-reviewer
  reverted ONLY the clone (keeping the test) and confirmed the test fails, then restored.
Task 4: ruling — emit.* payloads deliberately NOT cloned. Verified against real Electron
  semantics: webContents.send emits once, structured-clone happens at renderer entry,
  then EventEmitter fans out the SAME reference to every listener. Cloning per listener
  would itself be a divergence. Non-change RULED CORRECT.
Task 4: deferred question (not a defect): should the fake isolate simultaneous
  subscribers within one emit() from each other? That is a stricter-than-Electron
  requirement, not a divergence fix. Decide only if a real test ever needs it.
Task 4: complete (commits 29b3136..e2df6c8, review clean)

INTERFACES PRODUCED BY TASK 4 — later tasks depend on these:
  - `src/renderer/api/FakeApi.ts`: `createFakeApi(overrides?) => { api, emit }`
  - overrides merge PER NAMESPACE; replacing one method leaves the other 31 working
  - `emit.dataUpdated / refreshStatus / error / untagDataUpdated` fire SYNCHRONOUSLY —
    no await needed to observe them in a test
  - config store is a per-instance structuredClone of DEFAULT_CONFIG, and reads are
    cloned on the way out. No state leaks between instances or through returned values.
  - zero casts, zero `any` — the contract is honestly implementable. Keep it that way.

Task 5: implemented (commit 7f36f74). 1 Important -> fix round 1: renderWithApi
  returned `emit` as `FakeEmitter | undefined`, forcing `emit?.` on the common path and
  making any test that needed BOTH an override and an event bypass the helper entirely.
  Caught while zero downstream callers existed — cheap now, 13 tasks of churn later.
Task 5: fix round 1/5 (1 addressed, 0 open; commits 7f36f74..1cc7350). Re-reviewer
  confirmed non-optionality at the TYPE level with a throwaway call site using no
  optional chaining, exercised all four paths, and re-verified isolation survived.
Task 5: complete (commits e2df6c8..1cc7350, review clean)
Controller: 0da6cc2 gitignores /dist — every review since task 1 had to rule it out.

INTERFACES PRODUCED BY TASK 5 — THE STANDARD TEST PATTERN FOR TASKS 7-18:
  - `ApiProvider`, `useApi()` in src/renderer/api/ApiContext.tsx. useApi throws
    "useApi must be used within an ApiProvider" outside a provider.
  - `renderWithApi(ui, options?)` in src/test/renderWithApi.tsx. Options are
    RenderOptions plus EITHER `overrides` (helper builds the fake — the common path)
    OR `fake: {api, emit}` (caller supplies both halves). Both given -> throws.
  - Returns `{ api, emit, ...renderResult }`. BOTH NON-OPTIONAL. Never write `emit?.`
    or `emit!` — if you feel the need, something regressed.
  - Common usage:
      const { emit } = renderWithApi(<Tab />, {
        overrides: { gitlab: { getMRs: async () => [...] } },
      });
      emit.dataUpdated({ ..., lastUpdated: new Date(...) });   // Date, NOT a string

=== FOUNDATION COMPLETE (tasks 1-5). 54 tests, typecheck clean, lint at 41 baseline. ===

Task 6: implemented (commit e28165e). Review found ZERO fidelity defects — exhaustive
  independent audit of all 41 declarations across both dark and both light blocks, every
  value byte-identical. Implementer self-discovered 7 divergences the plan's table missed
  (2 dark promote-only, 5 light-theme). Only 2 values change what renders:
  --accent-green-glow and --accent-red-glow, preferences window, 0.3 -> 0.4, authorized.
Task 6: 1 Important -> fix round 1. The split-token naming was a trap pointing the wrong
  way: the BARE name held the menubar value, so a preferences-window agent reaching for
  the "generic" token would silently get the wrong one. Scheme also non-uniform
  (-opaque vs -preferences). Fixed at the root, not policed.
Task 6: fix round 1/5 (1 addressed, 0 open; commits e28165e..f63394b). 58 tests.
Task 6: complete (commits 0da6cc2..f63394b, review clean)

INTERFACES PRODUCED BY TASK 6 — BINDING ON EVERY LATER CSS TASK (7-18):
  - `src/renderer/styles/tokens.css` — import once per window entry.
  - TOKEN NAMING RULE, no exceptions: a BARE name means the value is identical in both
    windows and is safe anywhere. A SUFFIXED name (`-menubar` / `-preferences`) means the
    windows genuinely disagree and you MUST pick the one matching the window you are
    building. There is no bare fallback for those — using one is impossible, not merely
    wrong. The 6 split tokens: --bg-base, --bg-elevated, --bg-card, --bg-card-hover,
    --shadow-md, --gradient-mesh.
  - GUARD: `src/test/cssTokenUsage.test.ts` scans every *.module.css under src/renderer/
    and fails if any `var(--x)` names a token not declared in tokens.css. Verified
    load-bearing by a real probe module. It goes live the moment Task 8 writes CSS.
    Handles fallbacks, nested var(), multiple refs per declaration, vars in gradients.
    Known blind spot: a CSS comment between `var(` and the name. Degrades to
    false-negative, not false-positive.
  - Never hardcode a colour, radius, shadow or gradient in a CSS Module. Use var().
  - `docs/superpowers/plans/token-reconciliation.md` is the ALLOW-LIST of permitted
    visual differences for the final parity review. Anything not on it is a regression.

Task 7: implemented (commit bf7aed2). Sidebar markup + all strings verified
  character-for-character. Token discipline clean. Guard test now non-vacuous.
Task 7: implementer self-found the `base` landmine and correctly declined to fix it out
  of scope; controller put it IN scope. 1 Important -> fix round 1.
Task 7: two unanticipated build fixes, both independently verified correct:
  (a) vite.renderer.config.ts is now an ASYNC function using dynamic import() for the
      ESM-only @vitejs/plugin-react. Traced through @electron-forge/plugin-vite's
      ViteConfig.js to Vite's loadConfigFromFile, which awaits function configs. Safe.
  (b) ambient `declare module '*.module.css'` moved to a new import-free `src/css.d.ts`,
      because a wildcard module declaration STOPS MATCHING once its declaring file
      becomes an ES module — global.d.ts got an `import type` back in Task 3. Reviewer
      reproduced the TS2307 by merging them back. global.d.ts itself unchanged.
Task 7: fix round 1/5 (1 addressed, 0 open; commits bf7aed2..9f35ff3). 62 tests.
Task 7: complete (commits f63394b..9f35ff3, review clean)

>>> READ THIS BEFORE STARTING TASK 11 OR TASK 19 <<<
  Vite now emits `base: './'`, so built HTML references assets as `../../../../assets/…`.
  That resolves ONLY if the WHOLE `dist/` tree ships with its structure intact.
  - Ship `dist/` as ONE ATOMIC UNIT (e.g. extraResource: ['./dist']). Copying just the
    two HTML files, or flattening the layout, breaks asset resolution and produces a
    SILENT BLANK WINDOW on macOS — no error, no log.
  - RENDERER_PATH must point at the NESTED paths, replacing the current flat
    path.join(RENDERER_PATH, 'index.html') pattern:
      dist/src/renderer/windows/menubar/index.html
      dist/src/renderer/windows/preferences/index.html
  - forge.config.ts still has the pre-migration `extraResource: ['./assets',
    './src/renderer']` and tray.ts:20-22 still resolves the flat layout. BOTH must change.
  - The 4-level nesting was deliberately NOT flattened: `base: './'` works at any depth,
    flattening would change how every entry's own relative imports resolve, and it cannot
    be verified without a Mac. Depth is not the risk; mis-copying the tree is.
  - Guard: `src/test/viteRendererConfig.test.ts` fails if `base: './'` is removed.

Task 8: implemented (commit 4f71163). Implementer raised 3 findings, ALL THREE correct:
  (1) The plan's avatar/onerror "parity trap" DOES NOT EXIST on this page.
      preferences.html:1026 renders the initial-letter <div> UNCONDITIONALLY; there is no
      <img> and avatarUrl is never read. The controller wrote that trap from the DEAD
      scaffold src/renderer/components/preferences/AccountsTab.tsx:89-95. The real trap
      belongs to the MENUBAR window (Tasks 14-15). Plan corrected.
      LESSON: the dead React scaffold describes an architecture that never ran. It misled
      the plan's own author. Treat it as unreliable, never as reference.
  (2) validateToken's gate is DEAD CODE in the shipped app. preferences.html:1080-1084
      tests the truthiness of an object that is never falsy, so an invalid token adds the
      account anyway. HUMAN RULED: reproduce the bug, fix it in the follow-up lot.
      It is now bug #4 in the plan's Global Constraints.
  (3) add()'s success field is never checked before "Account added successfully!" —
      reproduced literally, no test contradicted it.
Task 8: PLAN SELF-CONTRADICTION, now fixed — it demanded strict parity AND mandated a
  test only satisfiable by fixing bug (2). Any agent facing that must disobey half its
  instructions. The mandated test is now INVERTED to document the bug.
Task 8: fix round 1/5 (1 addressed, 0 open; commits 4f71163..49048d9). Re-reviewer ran a
  mutation test — reintroducing the correct gate makes the new test fail — and confirmed
  the validateToken CALL is still emitted, ruling out a port that just deleted it.
Task 8: minor (deferred): implementer swept the controller's uncommitted plan edits into
  49048d9. Content verified intact, but it muddies the fix diff. Tasks 2 and 5 correctly
  left controller edits alone; this one did not.
Task 8: minor (deferred): an act(...) console warning in PreferencesApp.test.tsx from
  AccountsPage's async mount fetch. Harmless today; watch it does not mask a real issue.
Task 8: complete (commits 9f35ff3..49048d9, review clean)

Task 9: implemented (commit 3c2d7e5). The PLAN WAS WRONG TWICE about this page, both
  caught by reading the source:
  (a) it omitted the under-2-characters branch entirely. preferences.html:1157-1160 shows
      "Type at least 2 characters..." and schedules NO timer at all.
  (b) it called `Searching...` an in-flight indicator. The source sets it SYNCHRONOUSLY
      in the input handler, BEFORE setTimeout — it is a TYPING indicator. Getting this
      wrong would delay it 300ms and change perceived latency.
  Plan rewritten with the real state machine and a note that this section already erred.
Task 9: bug #5 recorded — project search has an out-of-order-response race
  (preferences.html:1153-1180): no generation counter, no AbortController, so a slow
  earlier search resolving after a faster later one overwrites the fresher results.
  Port inherits it deliberately. Reviewer confirmed no guard was added.
Task 9: fix round 1/5 (2 addressed, 0 open; commits 3c2d7e5..c1a0c7a). 78 tests.
Task 9: complete (commits 1c5de09..c1a0c7a, review clean)

Task 10: implementer was KILLED MID-TASK by a server-side 529, work left uncommitted in
  the tree. Resumed from its own transcript rather than the controller taking over; told
  to redo the whole verification because neither of us knew what had completed.
Task 10: implemented (commit 03b6538). FIRST TASK TO PASS REVIEW WITH ZERO FINDINGS —
  no fix round. 90 tests.
Task 10: two more pre-existing bugs found, both reproduced AND pinned by inverted tests
  that name them:
  (6) the notification checkboxes are DEAD. preferences.html:956,967 have no listener, no
      config read, no config write anywhere in the repo — yet the main process honours
      notifications.newMRAssigned/pipelineFailed (notifications.ts:15,78). The settings
      are pinned to DEFAULT_CONFIG forever; the UI cannot change them. The PLAN claimed
      they were wired — that is the 5th time the plan was wrong about the source.
  (7) `failedPipelineMaxAge || 24` (preferences.html:1112) treats a stored 0 ("Never
      hide") as falsy and reverts the display to 24 on reload.
Task 10: complete (commits cfac62d..03b6538, review clean, no fix round)

=== PREFERENCES WINDOW PORT COMPLETE (tasks 7-10). Task 11 switches it over. ===

Task 11: implemented (commit 19081fd) + fix round 1 (e4097a9). Correctly reported BLOCKED.
Task 11: reviewer walked the packaged path arithmetic step by step against the real
  generated HTML: dist/src/renderer/windows/preferences/ up 4 levels lands exactly on
  dist/assets/. extraResource ships './dist' atomically. Menubar load path byte-identical.
Task 11: RULED — keep build-then-start, do NOT wire loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL).
  Forge declares ONE renderer target (main_window), not one per window, so there is no
  per-window dev-server URL. This app has never referenced those globals; it has always
  used loadFile. Introducing an unverifiable pattern for a human with one attempt at a
  no-error failure mode is the riskier choice.
Task 11: fix round 1 added `"prestart": "vite build --config vite.renderer.config.ts"`.
  /dist is gitignored and Forge's preStart only rebuilds .vite/, so a fresh checkout plus
  npm start gave a blank window indistinguishable from a real path bug. Reviewer
  reproduced: one build, before Electron, no double-build.
Task 11: TWO factual errors found in the human checklist, both corrected before relay:
  (a) it named `window.electronAPI`; this app exposes `window.gitlabbar` (preload.ts:4).
  (b) the rollback said `git revert <this-commit-sha>` without naming which. Reverting the
      LATEST commit (e4097a9) only removes the prestart line. The switch lives in 19081fd.
      The human was given 19081fd explicitly.

>>> TASK 11 IS UNVERIFIED. The human deferred the macOS check and asked to proceed as if
>>> it works. That is an instruction about SEQUENCING, not evidence. No one has seen the
>>> React preferences window run. Task 20's parity checklist must carry this as an open
>>> item, and if anything about the preferences window misbehaves later, this is the first
>>> place to look. Same treatment will apply to Task 19.

Task 12: implemented (commit 56ed606). 45 tests over 5 pure functions. Port verified
  byte-for-byte faithful; three quirks preserved and confirmed (getAgeInfo checks hours
  before days, getUntagAgeInfo checks days only, formatTime rolls 60m->1h and 24h->1d by
  independent floor division).

>>> SECURITY: simpleMarkdown injection — CONFIRMED EXPLOITABLE, FIXED IN BOTH FILES <<<
  escapeHtml (index.html:3574) is `div.textContent = x; return div.innerHTML`, which
  escapes & < > and U+00A0 but NOT ' or ". The link rule substitutes the raw URL into
  href AND into a single-quoted JS string inside onclick.
  Proven by execution in a JSDOM with runScripts:'dangerously':
    - a single quote escapes the JS string and runs arbitrary code
    - a double quote escapes the HTML attribute, and HTML's first-attribute-wins rule
      lets a payload OVERRIDE the app's own onclick
    - a NORMAL LEFT CLICK suffices; a captured IPC call proved it reaches window.gitlabbar
  Reach: all 32 IPC commands as the logged-in user (account add/remove/update, MR
  assign/dismiss, config writes). NOT reachable: Node/require (contextIsolation holds),
  and raw PATs (kept in the keychain module, absent from accounts.getAll()).
  Source of the text: MR descriptions and note bodies — anyone who can comment on a
  watched project.
  HUMAN DECIDED: fix now, in vanilla index.html AND in the port, committed together, so
  parity is preserved and the hole closes immediately rather than at Task 19. This is the
  ONLY sanctioned behaviour change in the whole migration.
  Round 1 (f9a6ef1): quote escaping via a function replacer — deliberately NOT by widening
  escapeHtml, which would have altered how every ordinary apostrophe renders.
  Round 2 (in flight): scheme allow-list. Quote escaping alone does NOT close the
  `javascript:` href — the onclick guard is incidental, catching only a plain left-click;
  middle-click, ctrl-click and the context menu bypass it, and there is no will-navigate
  handler in tray.ts.
  OPEN RISK, DELIBERATELY NOT FIXED: shell.openExternal (src/main/ipc/handlers.ts:371-373)
  has no scheme validation either. Main-process code, outside this migration's scope; its
  other callers pass GitLab URLs, and once the allow-list lands no crafted markdown link
  can reach it with a hostile scheme. Flag to the human. Do not fix unattended.
  Round 3 (fae83ec): CRITICAL BYPASS found by the reviewer attacking rather than reading.
  A leading raw C0 byte — [click me](\x01javascript:…) — rendered the link in BOTH files.
  String.trim() strips only ECMA-262 whitespace, not raw C0 controls, so the scheme regex
  missed and extractUrlScheme returned null, taking the pass-through path built for
  relative URLs. But WHATWG (hence Chromium, hence Electron) strips ANY leading
  C0-control-or-space before reading the scheme: new URL("\x01javascript:…").protocol
  === "javascript:". Fixed by stripping the whole /^[\x00-\x20]+|[\x00-\x20]+$/g class.
  Now covered by a programmatic sweep of all 33 code points, leading AND trailing, plus a
  DOM test asserting the RESOLVED .protocol — not the emitted string, which is what let
  the bypass through in the first place.
  CORRECTED REASONING, the report gets this wrong — read this version instead: replacing
  trim() with [\x00-\x20] is NOT a "strict superset". trim() also strips NBSP, BOM,
  U+2028/2029, EM SPACE and IDEOGRAPHIC SPACE, which the new expression leaves. The
  classifier is therefore measurably LESS strict for those six classes. It is safe anyway,
  for a different reason: a real WHATWG parser does not strip those characters either, so
  the rendered href never resolves to javascript: in Chromium. Verified both ways. If
  anyone later "restores" trim() thinking it is stricter, they will reintroduce a mismatch
  with the parser, which is the actual failure mode here.
  Final state: 213 tests. Both implementations verified byte-identical across a 66-case C0
  sweep plus a hostile and benign corpus. index.html's diff across all three rounds is a
  single hunk inside simpleMarkdown's link rule; the other four functions are untouched.
  OPEN, for the human: a rejected link now renders as plain text with no marker, so an
  ftp:/vscode:/slack: link in GitLab content silently loses its anchor. Narrow parity
  consequence of the sanctioned fix. Deliberately not changed unattended.

Task 12: implementer self-disclosed that its own earlier lint checks were piped through
  `tail` and had silently truncated two pre-existing src/main.ts errors, making its
  "41 errors, unchanged" claims accidentally correct rather than verified. Reviewer
  confirmed main.ts was never touched, so no prior conclusion was invalidated. Recorded
  because an agent auditing its own verification method is the behaviour that makes this
  chain trustworthy.
Task 12: complete (commits e4097a9..fae83ec, 3 fix rounds, review clean, safe to land)

Task 13: implemented (eadb7e1) + fix round 1 (5338568). 231 tests. Complete, review clean.
Task 13: implementer fixed a CONTRACT BUG outside its own files, and it was RATIFIED —
  gitlab.getUntagProjects() and on.untagDataUpdated were typed as a bare UntagProject[],
  but untagPolling.ts:14-18 sends {untagProjects, excludedCount, lastUpdated} and
  handlers.ts:332-333 returns the same wrapper unmodified. Command and event carry the
  IDENTICAL shape — verified. Now `UntagPollingResult`. This was MY error in Task 2 and it
  survived that task's own review, which checked the account mutations, MRNote and
  PolledData but never looked at untag. 6th time the plan was wrong about the source.
Task 13: race guard in DataProvider RATIFIED. Vanilla has the same structural hazard but
  cannot practically reach it — init() sequences six IPC round-trips plus a 100ms timer
  before loadData(), and real pushes arrive on a multi-minute poll. DataProvider fires
  loadData() immediately on mount with none of that. The guard is an artifact of
  decomposing loadData() out of init(), NOT a vanilla behaviour being fixed. Do not strip
  it in a later cleanup pass just because no test appears to demand it.

>>> BINDING ON TASKS 15-18: ALL PANES STAY MOUNTED <<<
  index.html:376-383 is .tab-content{display:none} / .tab-content.active{display:block}.
  The four tabs and po-content are permanent DOM siblings; only the `active` class moves.
  loadData() at :3854-3856 recomputes EVERY tab's content on every data event regardless
  of which tab is showing. So your pane mounts on first render and its effects run on
  every data:updated — not lazily on tab selection. Writing a pane that assumes React's
  usual "I mount when looked at" would fire four loads at startup.
  KNOWN GAP for tasks 15-18: badge counts currently use raw collection length. Vanilla
  filters dismissed items out first. Whoever wires the dismissal filters owns fixing this.

Task 14: implemented (d86925c) + fix round 1 (216c9ba). 254 tests. Complete, review clean.
Task 14: CSS/markup verified byte-identical to source across all four components. Widened
  SectionHeader/EmptyState props ruled markup-driven, not speculative — every real consumer
  in Tasks 15/17/18 needs them.
Task 14: CRITICAL caught — the implementer had unified Avatar's MINI placeholder to
  `(name || '?')`. The source's mini path (index.html:2791-2795) has NO fallback:
  `name[0].toUpperCase()` on an empty name THROWS, and inside a .map() in a template
  literal it aborts the ENTIRE MR list render. Reachable: transformMergeRequest applies
  only an array-level `|| []`, and the element types are a compile-time assertion over
  unvalidated GitLab JSON — no zod/io-ts/ajv anywhere in this repo. Reverted to
  size-dependent behaviour. Now preserved bug #8.
  LESSON: a TypeScript type on API data is a claim, not a runtime guarantee.

>>> TEST-DESIGN LESSON, cost two fix rounds tonight — READ BEFORE WRITING A GUARD TEST <<<
  The plan's own `expect(img).not.toHaveAttribute('onerror')` was INERT. React never
  serialises an onError prop to that HTML attribute, so the assertion is vacuously true
  whether or not a handler exists. A reviewer proved it by implementing the exact
  regression the test existed to prevent — useState + onError + conditional placeholder —
  and all 8 tests still passed.
  Same shape as Task 12: tests asserted the string simpleMarkdown emitted instead of the
  .protocol a real URL parser resolved, and a bypass sailed through.
  RULE: fire the event and assert the observable outcome. Never assert the shape of the
  markup you just wrote. And prove every guard test bites by implementing the regression
  it targets and watching it fail — checking it fails for the RIGHT assertion, not because
  the setup threw or a query matched something unrelated.

Task 15: implemented (0de48d4), 280 tests. Section derivation, string fidelity, every
  source id, the +N arithmetic and all five IPC signatures verified against source.
  Reviewer independently mutation-tested three guards; each failed on the right assertion.
Task 15: scope expansion RATIFIED — `isLoading`/`hasAccounts` on Data (renderMRs reads
  both at index.html:2470,:2482, and pipelines/releases gate on the same isLoading at
  :2909,:3137, so it belongs on shared Data), `useMRDismissal()` (MenubarApp's badge and
  the tab are siblings, not ancestor/descendant, and vanilla's module-level
  dismissedMRIds is read by both), and EmptyState's id/titleId/messageId props.
Task 15: CRITICAL — the "Done" button wipe was NOT reproduced and had to be. The
  implementer judged it a vestigial artifact of vanilla's full-innerHTML regeneration.
  Half right: it IS an artifact, but it is routinely visible. Vanilla mutates the button
  node in place (index.html:2643-2651); renderMRs() regenerates list.innerHTML wholesale
  and runs on dismiss (:2550), Show all (:2765), every loadData (:3857,:3878) and every
  data:updated (:3899). AND the assignMR/addReviewer IPC handlers THEMSELVES call
  pollingService.refresh() (handlers.ts:214,231), so a push lands inside the ~1s "Done"
  window on nearly every real action. Vanilla flickers; React's useState survived. Fixed.
  LESSON: "nobody designed this" and "nobody sees this" are different claims. Only the
  second licenses not reproducing it, and it needs evidence from the main process.
Task 15: correction to the controller's own framing — vanilla has THREE dismissible
  collections (MRs :2334, pipelines :2883, releases :3111), not four. Untag has no
  dismiss/restore concept at all.

>>> DECISION FOR TASK 16: introduce a shared dismissal-context factory <<<
  useMRDismissal() is hand-typed to MRs. Tasks 16 and 17 each need the same ~40-line
  pattern (state array, dismiss/restore callbacks, useMemo, provider nesting). Task 16
  introduces a `createDismissalContext`-style factory AND migrates the MR context onto it,
  using Task 15's tests as the safety net. Deliberately NOT done as a Task 15 fix round —
  refactoring reviewed, passing code in the same round as a parity fix mixes concerns and
  makes the review meaningless.

Task 15: fix round 1/5 (2 addressed, 0 open; commits 0de48d4..b462a2a). 284 tests.
  Reviewer traced all five vanilla renderMRs() triggers against the port's clearing:
  dismiss, Show all, loadData success and data:updated push are all covered; the
  loadData FAILURE path is not, but is structurally inert — loadData runs once at mount,
  before isLoading has ever gone false, so no MR row exists and doneActions is empty.
  Also checked the OPPOSITE divergence: the reference-change effect does not over-fire,
  because checkAccounts() and the untag push both spread prev without touching
  mergeRequests. Over-clearing would have been just as wrong as under-clearing.
Task 15: the crash-site tests use a test-local CrashProbe error boundary. A first attempt
  with act()/.rejects.toThrow() was flaky — passing while logging an unhandled rejection,
  traced to React 18's concurrent renderer re-attempting a throwing render. Reviewer ran
  the boundary version 8 times consecutively: stable, no noise.
Task 15: complete (commits 8847087..b462a2a, review clean)

Task 16: implemented (c931449) + 2 fix rounds (0276169, 30c9c7d). 304 tests.
Task 16: TWO more plan errors, both caught by the implementer reading the source:
  (9) getJobIcon is DEAD CODE — one occurrence in index.html, its own declaration at
      :3096. Nothing calls it, no .job-icon CSS rule, real job chips use .job-status-dot.
      The plan had it ported WITH a test per status branch. Removed (9 tests, not 8).
  (10) failedPipelineMaxAge filtering is SERVER-SIDE (polling.ts:164-176, failed pipelines
      only, before the push). renderPipelines never compares ages. The plan listed it as
      renderer behaviour. Correctly not reproduced client-side.
Task 16: METHOD ERROR IN THE PLAN, now recorded in it — this plan was written by reading
  function DEFINITIONS without checking their CALLERS. A defined function is not a used
  function. Same mechanism that made the plan describe the avatar trap from the dead React
  scaffold. Before listing a function as behaviour to reproduce, grep its call sites.
Task 16: the controller's own first plan correction was a PARTIAL CAPTURE — it added a
  "do not port getJobIcon" paragraph while leaving the Files, Interfaces and Step 1 lines
  still calling for it. Briefs are generated mechanically from this file, so a
  self-contradicting section propagates to the next agent. Fixed properly.
Task 16: dismissal factory RATIFIED. Task 15's two test files byte-identical (verified by
  git). MR behaviour unchanged down to IPC args, config key and restore semantics. All
  three collections checked side by side — no invented symmetry. Task 17 can consume
  `createDismissalContext` as-is for releases; dismissRelease/restoreReleases and
  dismissedReleases already exist.
Task 16: the triggering-user avatar is a plain <img>, NOT the shared Avatar — vanilla
  renders literally nothing when avatar_url is absent (index.html:2988-2990) and sizes it
  18px with no border (:1698-1721), a third size Avatar does not have. Using Avatar there
  would have been a bug.
Task 16: THIRD occurrence tonight of "it is typed non-optional so it cannot happen" used
  to skip a test (Task 14 avatar name, Task 15 two crash sites, Task 16 webUrl guard).
  Wrong every time. A TypeScript type on data crossing an API boundary is a claim, not a
  runtime guarantee — and this app's data comes from an instance already known to return
  surprising 401s.
Task 16: controller verified the final guard test by mutation directly — removing
  `if (job.webUrl)` fails exactly one test on exactly the right assertion
  (`expect(openExternal).not.toHaveBeenCalled()`), 18 others still pass. Restored, clean.
Task 16: complete (commits b462a2a..30c9c7d, review clean)

Task 17: implemented (78d3fe9) + fix round 1 (988d9c5). 353 tests. FIRST LARGE TASK WITH
  NO CRITICAL AND NO IMPORTANT FINDINGS.
Task 17: the pane-remount restructure was verified BY EXERCISE, not by reading. The
  reviewer wrote a throwaway probe that mounted the full tree, ran a real "Assign to me"
  flow to put state into MergeRequestsTab's doneActions, then round-tripped
  Developer -> Product Owner -> Developer through the actual profile-nav buttons. All four
  panes kept IDENTICAL DOM node references, the Done state survived, and the four
  mount-time fetches stayed at exactly one call each. They then reintroduced the old JSX
  conditional to prove the probe detects the failure — it did.
Task 17: two more source/brief discrepancies, both confirmed:
  - renderPORelease NEVER reads its deploymentStatusTexts argument (index.html:3536-3548),
    so PO release badges show icon + environment + time with NO status word, unlike the
    Releases tab. Pinned by a test.
  - the footer needs Data.isLoading and Data.lastUpdated, not just Data.error.
Task 17: preserved bug — PO "Load more" page counter is never reset by a data refresh even
  though the loaded items visually are, so a later click silently skips a page. Reviewer
  implemented the fix themselves to confirm the pinning test fails. Reproduced.
Task 17: CONTROLLER OVERRODE THE REVIEWER on one Minor. POView now stays permanently
  mounted (a consequence of the restructure we demanded), so it could no longer mirror
  vanilla's setViewMode-triggered loadWatchedProjects (index.html:2394). The reviewer
  judged the resulting staleness too narrow to fix. Overridden because strict parity is
  the human's explicit standing decision and outranks a cost/benefit call — we reproduced
  eight bugs verbatim and reverted three real improvements on that principle. Accepting a
  known divergence at task 17 because it is small would make the rule mean whatever the
  last reviewer felt like, and would break the human's binary macOS check.
  LESSON: fixing a divergence can CREATE one elsewhere. Removing the unmount removed what
  was hanging off it. Look for the second-order gap deliberately; it does not announce itself.
Task 17: controller verified the fix by mutation directly — removing `viewMode` from the
  effect deps fails exactly one test. Restored, 353/353, tree clean.
Task 17: complete (commits db72139..988d9c5, review clean)

Task 18: implemented (8d959dd). 379 tests. NO FIX ROUND — no Critical, no Important.
Task 18: TWO more plan errors, both dead APIs the plan described as behaviour to port:
  (11) `gitlab.refreshUntag` has ZERO call sites in index.html. It exists as an IPC
      channel, a contract method, a FakeApi stub and a handler — but nothing calls it.
      Same shape as Task 16's getJobIcon. The port correctly does NOT wire it to a button,
      and added a pinning test guarding against a future "helpful" addition.
  (12) "per-project exclusion handling" does not exist in the renderer at all. Exclusion is
      entirely automatic server-side: untagPolling.ts:96,146-153 auto-excludes tag-less
      projects, and excludedCount (:123-127) is just a .length. The UI has only a bulk
      "Reset exclusions" button. The port invented nothing.
Task 18: found and fixed a TASK 13 GAP — DataProvider lacked a separate `isUntagLoading`.
  Vanilla keeps it distinct (index.html:2331 vs :2338) because loadData() flips isLoading
  false at :3855, synchronously BEFORE the nested untag fetch starts; isUntagLoading only
  settles at :3866/:3869 or on a push at :3908. renderUntag's loading gate (:3726) reads
  only the separate flag. Sharing it would have shown "All Tagged" prematurely while
  untagProjects was still empty. Ratified.
Task 18: expanded commit lists collapse on every refresh, including a same-content poll —
  renderUntag does `list.innerHTML = html` wholesale (:3788) and the template never
  contains the `expanded` class; it is added imperatively after the rebuild (:3802-3812).
  Reproduced. Reviewer removed the reset effect and watched the right test fail.
Task 18: implementer DISCLOSED not following tests-first ordering, rather than claiming
  full TDD. That disclosure was useful beyond honesty: it told the review exactly where to
  look — tests written after the code tend to assert what the code does rather than what
  the source requires. The reviewer checked for precisely that and found none; every test
  broken failed at the assertion it was meant to guard.
Task 18: complete (commits 988d9c5..8d959dd, review clean, no fix round)

=== ALL FOUR MENUBAR TABS PORTED. 379 tests. Only the switchover and the checklist remain. ===

Task 19: implemented (29e4dfc) + fix round 1 (19e77b6). Correctly reported BLOCKED.
Task 19: 12 files deleted — both vanilla HTML windows, the root Vite entry index.html,
  src/renderer.ts, App.tsx, components/preferences/*, hooks/*. Reviewer enumerated every
  one, built independent searches rather than reusing the brief's greps, ran a clean
  rm -rf dist && vite build confirming both entries still emit, and confirmed
  src/renderer/styles/ was untouched.
Task 19: the "no component references window.gitlabbar" global constraint is satisfied for
  the FIRST TIME with this commit. The remaining grep hits were verified by reading:
  format.ts:138 is window.gitlabbar as a STRING inside the onclick attribute simpleMarkdown
  generates; the rest are attribution comments.
Task 19: lint baseline is now 40, not 41. Reviewer re-derived it by building a real second
  worktree at the parent commit — one AccountsTab.tsx error deleted, three tray.ts errors
  merely shifted by the 8 deleted RENDERER_PATH lines. Later comparisons must use 40.
Task 19: DOCUMENTATION ROT CAUGHT — Task 19's checklist pointed the human at Task 11's
  report, whose rollback line says "preferences.html was never deleted, so a revert
  restores the working vanilla window." Task 19 DELETED that file. Task 11's document was
  true when written and became false eight tasks later, with no expiry marker. A human at
  a blank window would have followed it to a rollback that restores nothing. Caveat added.
  LESSON: chained artifacts are each true at their own date. When a task invalidates an
  earlier task's premise, the earlier document does not know. Re-read what you cite.
Task 19: three unfilled <this-commit-sha> placeholders in the checklist would have errored
  on copy-paste — the same defect Task 11's checklist had, in a document read precisely
  when nothing works. Fixed to real SHAs.
Task 19: orphaned by the deletions — src/renderer/styles/global.css and preferences.css
  lost their only importer (App.tsx). Nothing loads them; tokens.css is live and must NOT
  be confused with them. Left for the human; a follow-up cleanup, not a blocker.

>>> TASK 19 IS UNVERIFIED, AND IT DELETED THE FALLBACK. Unlike Task 11, there is no vanilla
>>> file left to revert to in place — the rollback is `git revert 29e4dfc` plus a rebuild.
>>> Neither window has EVER been seen running by anyone. When the human launches, it is the
>>> first observation of either.

>>> TIMER TESTS: use `typeWithFakeTimers` from src/test/typeWithFakeTimers.ts <<<
  The obvious pattern — vi.useFakeTimers() + userEvent.type(..., {advanceTimers}) —
  HANGS INDEFINITELY. The obvious workaround, shouldAdvanceTime: true, leaks wall-clock
  time into the virtual clock and was MEASURED at 7 failures in 8 runs on a 299ms
  boundary assertion. It is broken by default, not occasionally flaky. The helper's doc
  comment explains all of this. Tasks with polling intervals or pagination: read it
  before writing your first timer test.
