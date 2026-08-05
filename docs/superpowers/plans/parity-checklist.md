# Phase 1 parity checklist — vanilla → React

This is the acceptance document for the whole React migration (Tasks 1-20,
branch `react-migration`). It exists so you can compare the new React app
against your own memory of the old one, one screen at a time, without having
to go dig through twenty tasks' worth of reports to know what to expect.

## Ownership

**Every line in section 6 requires macOS and a running, packaged-or-`npm
start`'d app.** This machine that produced the migration is Linux and cannot
launch Electron — no agent, including the ones that wrote this document, has
ever seen either window render. **Only you can tick a box below.** No agent
may check one on your behalf, now or later. If an agent ever hands you this
file with boxes already checked, do not trust them — verify yourself.

---

## 1. What has never been verified — read this before anything else

Two tasks switched the app's windows from the old hand-written HTML/JS to
this React build, and **neither switch has ever actually been run**:

- **Task 11** (commit `19081fd`, fix round `e4097a9`) switched the
  **preferences window**.
- **Task 19** (commit `29e4dfc`, fix round `19e77b6`) switched the
  **menubar window** and then **deleted the vanilla HTML/JS files
  outright** (`src/renderer/index.html`, `src/renderer/preferences.html`,
  and the dead React scaffold alongside them).

Both tasks' agents built everything this Linux machine can check (build,
typecheck, lint, the full test suite) and then stopped and reported
**BLOCKED — pending human verification on macOS**, exactly as the plan
required. When you open either window for the first time, you are the
first person to ever see it render.

**Full diagnostic steps if a window opens blank** (three failure modes,
how to tell them apart, and exactly what to look at in DevTools) are
written out in:
- `docs/superpowers/verification/preferences-window-switchover.md` — section
  "Human verification checklist (macOS required)", preferences window.
- `docs/superpowers/verification/menubar-window-switchover.md` — same
  section, menubar window. This one also documents the case where **both**
  windows fail together, since Task 19 removed the last fallback.

This document does not repeat those steps; read them if you hit a blank
window.

### Rollback

- **Preferences window only** (if only Task 11 turns out to be broken and
  you want the old preferences window back while keeping everything else):
  see Task 11's report — but **its own rollback line is stale**. It claims
  reverting Task 11 alone restores a working vanilla preferences window,
  because at the time it was written `preferences.html` still existed on
  disk. Task 19 deleted that file eight tasks later. Task 19's own report
  already carries the correction (search it for "stale"), so treat
  Task 19's version as authoritative, not Task 11's.
- **Either window, or if you just want the whole migration undone**:
  ```
  git revert 29e4dfc
  ```
  then rebuild (`npm start` runs the build automatically via the
  `prestart` script). This restores all twelve files Task 19 deleted plus
  its two config edits in one commit. It does **not** un-ship any release
  already packaged from this branch — see Task 19's report, "Rollback"
  section, for what that means in practice.

---

## 2. Known differences — read this before reporting anything as a regression

Everything in this section is **expected**. If you see one of these, it is
not a bug you introduced by reading this checklist — it was already there,
or it was an explicitly authorized change. Do not file it. Everything
**not** listed here that looks wrong **is** worth reporting.

### 2.1 Seven preserved bugs

The migration's standing rule was **strict parity**: no bug fixes, no
behaviour changes. These seven misbehaviours were confirmed present in the
original app and were ported on purpose, to be fixed together later in a
separate, dedicated lot. Expect all seven in the React app, unchanged.
(There is an eighth, related bug — the empty-name crash — but its
**blast radius** is not parity; it's worse in React. See 2.1a immediately
below, not this table.)

| # | Name | What you'll actually see | Lives in (React) | Lived in (original) |
|---|---|---|---|---|
| 1 | Self-hosted avatar 401 | An avatar image that fails to load — see #2 below, they compound | `src/renderer/shared/Avatar/Avatar.tsx:68-76` (plain `<img src={src}>`, no auth header — inherent to loading an avatar via a bare `<img>` tag) | `index.html:2782-2784`, `:2791-2796`, `:2806-2811` |
| 2 | No fallback when an avatar image fails | **#1 and #2 together are why this migration exists**: on a self-hosted GitLab instance, the avatar request gets a 401, and because there is no `onerror` handler, the browser shows its own broken-image glyph instead of falling back to the initial-letter placeholder. You will see a broken-image icon where a colored circle with a letter should be, on MR/pipeline author avatars, assignee/reviewer mini-avatars, and comment-author avatars. | `Avatar.tsx:68-76` | same lines as #1 |
| 3 | Project names shown short, not full path | Search results (Preferences → Projects) **do** show the full `namespace/path` on a second line — that part is fine. But once a project is added to **Watched projects**, its chip shows the short name only (no group/namespace), and the **Untag tab** rows in the menubar show the short project name too — so two same-named projects in different groups look identical there. | `src/renderer/features/preferences/ProjectsPage/ProjectsPage.tsx:210-216` (chips); `src/renderer/features/untag/UntagProjectRow.tsx:97-102` (untag rows) | `preferences.html:1246-1253`; `index.html:3715`, `:3765` |
| 4 | Invalid token doesn't block adding an account | Preferences → Accounts: paste a bad URL or an invalid/expired token and click **Add account** — it validates, always gets back an object (never `false`/`null`), and adds the account anyway. No error is ever shown for "the token doesn't work." | `AccountsPage.tsx:96-100` | `preferences.html:1080-1084` |
| 5 | Project search race | Preferences → Projects: type a query, then immediately overwrite it before the first search resolves. If the slower, earlier search's response happens to land after the faster, later one, the **stale** results are what's shown, with no indication anything is wrong. Hard to trigger reliably by hand; typing fast while your network is inconsistent is the realistic way to hit it. | `ProjectsPage.tsx` (`performSearch`/`handleSearchChange`, lines ~71-120 — no request-generation counter, no abort) | `preferences.html:1153-1180` |
| 6 | Notification checkboxes do nothing | Preferences → General → Notifications: "New assigned MRs" and "Failed pipelines" toggles can be clicked and will visually flip, but they are not wired to anything — no config is read on load, none is written on change. The main process's actual notification behaviour (`notifications.newMRAssigned`/`pipelineFailed`) is permanently pinned to its default and this UI cannot change it either way. | `GeneralPage.tsx:226-244` | `preferences.html:956`, `:967` |
| 7 | "Never hide" pipeline setting reverts to 24h on reload | Preferences → General → "Hide failed pipelines after": pick **Never hide** (stored as `0`), quit and relaunch. The dropdown will show **24 hours** again — the stored `0` is falsy, so `config.failedPipelineMaxAge \|\| 24` silently substitutes the default. (The actual stored value is unaffected by this — it's a *display* bug on reload, not a data-loss bug — but you have no way to tell that from the UI.) | `GeneralPage.tsx:37`, `:51` | `preferences.html:1112` |

### 2.1a Bug #8 — empty assignee/reviewer name: a known divergence in blast radius, NOT parity

This one does not belong in the table above, on purpose: the *trigger* is
parity (an empty/blank name on a GitLab user record — assignee, reviewer,
or comment author on a merge request — reaching `name![0].toUpperCase()`
with no guard, same as the original), but the *consequence* is not.

- **Vanilla**: the throw happened inside `renderMRs()`
  (`index.html:2791-2795`) and was contained there — it aborted only that
  one render function, so the header, tabs, and the other three lists
  (Pipelines, Releases, Untag) kept working. You'd see a broken Merge
  Requests tab, nothing else.
- **React** (`Avatar.tsx:85`, mini size only): **there is no error
  boundary anywhere in this app's real component tree** —
  `componentDidCatch`/`getDerivedStateFromError` exist only inside a
  test-local probe (`MergeRequestsTab.test.tsx`'s `CrashProbe`), never in
  shipped code. An uncaught render throw here unmounts the *entire* React
  tree, blanking the whole menubar window — header, tabs, footer, all four
  lists — until you close and reopen it. Confirmed directly by the review
  process (see "Worth flagging" below), not a guess.

**This is a known, deliberate divergence from vanilla's blast radius, not
preserved parity — and it is left for you to decide, not fixed here.** Do
not read the rest of this document as license to add an error boundary;
that decision belongs to you. Very unlikely to happen day-to-day; worth
knowing so you don't debug a "randomly blank menubar" as if it were a new
regression from this migration.

### 2.2 The one sanctioned behaviour change: markdown link scheme filtering

During the port (Task 12), a real, exploitable script-injection hole was
found in the original app's `simpleMarkdown` renderer and fixed **in both
the vanilla file and the React port, at the same time**, with the human's
explicit sign-off. This is the **only** intentional behaviour change in
the whole migration.

**Where you'll actually see it:** `simpleMarkdown` has exactly one call
site in the shipped React app —
`src/renderer/features/releases/POReleaseRow.tsx`'s `release.description`
rendering, i.e. a **release's description text, in the Product Owner
view** (profile nav → Product Owner; expand a release's "Show more").
Nowhere else in the React app routes text through `simpleMarkdown`: merge
requests never render a description field at all, and MR comment/note
bodies (`MergeRequestsTab.tsx`'s `NotesPanel`) deliberately use a
*narrower*, separate transform — backtick-code and newline-to-`<br>`
only, no link parsing, no `simpleMarkdown` call — so this scheme filter
cannot apply there regardless. (This differs from vanilla, where
`simpleMarkdown` *did* run over MR descriptions and note bodies too, which
is where Task 12 originally found and fixed the hole — but that is not
the surface you're verifying here; the React port's own reachable surface
is narrower.)

**What changed, in terms you'll actually notice:** a `[text](url)` markdown
link in a release description only renders as a clickable link if its
URL's scheme is `http:`, `https:`, or `mailto:`. Any other scheme —
including `ftp:` and app-custom schemes like `vscode://...` or
`slack://...` — now renders as **plain, unlinked text** instead of a
link. There is no visual marker that a link was suppressed; it just looks
like plain text where a link used to be. Relative/protocol-relative links
(no scheme at all) are unaffected.

If you see a release description in the Product Owner view where a link
you'd expect to be clickable (e.g. a `vscode://` deep link someone pasted
into the description) is just plain text — that's this, working as
intended, not a bug.

Implementation: `src/renderer/utils/format.ts` (`ALLOWED_LINK_SCHEMES`,
around lines 32 and 96-135).

### 2.3 Reconciled design tokens

Both windows' CSS custom properties were consolidated into one shared
`src/renderer/styles/tokens.css` (Task 6). The full reconciliation table is
in `docs/superpowers/plans/token-reconciliation.md` if you want the detail,
but the short version is all that matters for spotting a real regression:

**Only two token values actually change what's painted on screen — both in
the preferences window, both dark theme only:**

- `--accent-green-glow`: opacity `0.3` → `0.4`
- `--accent-red-glow`: opacity `0.3` → `0.4`

These are subtle glow/shadow effects around success/error accents in the
preferences window's dark theme. Everything else in that reconciliation —
dozens of renamed/split tokens — is a pure rename with the byte-for-byte
same rendered value in both themes, both windows. If preferences-window
dark-theme green/red glows look very slightly more intense than you
remember, that's expected. Any other visual difference in colour, spacing,
shadow, or gradient is not on this list and is worth reporting.

---

## 3. Two known gaps (not blockers, not yours to fix by hand)

- **`src/renderer/styles/global.css` and `preferences.css` are orphaned.**
  Their only importer (the dead scaffold `App.tsx`) was deleted in Task 19.
  Nothing loads them any more — they have no effect on anything you'll see.
  `src/renderer/styles/tokens.css` is the live stylesheet; don't confuse
  the two if you go looking at the styles directory.
- **The Product Owner view's "stale watched projects" question was
  already investigated and closed in Task 17** (see the ledger,
  `docs/superpowers/verification/migration-ledger.md`, Task 17
  section, for the reasoning). Not re-litigated here.

---

## 4. Worth flagging, not a checklist item

Bug #8's blast radius (whole-window crash, not just the affected pane —
see 2.1a) is a structural consequence of this app having no error boundary
anywhere in its real component tree — confirmed by a reviewer during Task
15 who observed "the tree unmounts" when reproducing the crash outside a
test's purpose-built `CrashProbe` boundary. This is a **known divergence
from vanilla's blast radius, not parity**: vanilla's equivalent crash was
contained to `renderMRs()`; React's isn't contained to anything. It is
**deliberately left as-is, for you to decide** — not something to fix as
part of checking this list, and not license to add an error boundary.

---

## 5. Before you start checking boxes

1. Check out this branch (`react-migration`) on a Mac with the full
   toolchain, `npm install` if you haven't already.
2. `npm start`. A `prestart` script builds the React bundle
   (`dist/`) automatically — you should see Vite build output
   (module count, file sizes) in the terminal *before* Electron/Forge log
   lines start. If you don't, or if `dist/` looks stale, see the
   diagnostics linked in section 1.
3. Work through section 6 top to bottom, in one sitting if you can — it's
   organised so you don't have to jump around. Check a box only once
   you've actually looked at that thing on screen and it matches your
   memory of the old app (accounting for section 2's known differences).
4. Quit and relaunch once partway through (see the last item in each
   window's checklist) to catch anything that only breaks on a warm start.

---

## 6. The checklist

### 6.1 Menubar window (click the tray icon)

**Header**
- [ ] Logo, "GitLabBar" title render correctly.
- [ ] Subtitle summarizes activity correctly (e.g. "3 MRs • 1 pipeline • 2 releases"), or "No activity" when everything is empty.
- [ ] Refresh button (circular arrow, top right) spins while a refresh is in flight and stops shortly after it completes.
- [ ] Clicking refresh actually triggers a data refresh (badge counts / list contents update if there was new data).

**Profile nav (Developer / Product Owner toggle)**
- [ ] Hidden entirely when no GitLab account is configured; visible once one is.
- [ ] "Developer" and "Product Owner" buttons, exactly those two labels.
- [ ] Clicking a button switches the active pane and highlights the clicked button.
- [ ] The choice persists across quitting and relaunching the app.

**Tab bar (Developer mode only: MRs / Pipelines / Releases / Untag)**
- [ ] Hidden while in Product Owner mode; visible in Developer mode (and hidden entirely with no accounts configured).
- [ ] Four tabs, labels exactly "MRs", "Pipelines", "Releases", "Untag".
- [ ] Each tab shows a numeric badge that matches the count of items actually visible in that tab (not counting anything you've dismissed/hidden).
- [ ] Clicking a tab switches which pane is showing without losing state in the other panes (e.g. open dropdowns/notes elsewhere close, but scroll position and in-progress state in a pane you're not looking at should survive switching away and back).

**Merge Requests tab**
- [ ] Loading state: spinner + "Loading merge requests..." on first load.
- [ ] Empty state (no accounts): "No Merge Requests" + message telling you to add an account, with a working "Configure GitLab" button that opens Preferences.
- [ ] Empty state (accounts, but nothing open): "No Merge Requests" + a different message (no open MRs found).
- [ ] Sections appear only when they have items, in this order: "To review", "No reviewer", "Assigned", "Created by me". An empty section shows no header at all.
- [ ] Each MR row: author avatar (see known bugs #1/#2), author name, age-based colored badge/time, draft badge when applicable, conflict badge when applicable, source→target branch tags, assignee/reviewer mini-avatar stacks (label "Assigned"/"Reviewers", capped at 3 avatars + "+N" overflow chip).
- [ ] Comment-count badge appears when there are notes on the MR, highlighted differently when you're mentioned; clicking it opens a floating notes panel showing up to 10 comments with author, time, and body (backtick code spans and line breaks render, nothing else does).
- [ ] "+ Assign" / "+ Reviewer" buttons appear only when that role is unfilled; clicking opens a member-picker dropdown ("Me" always listed first) and, after picking someone, the button briefly shows a green checkmark "Done" before reverting once the list refreshes.
- [ ] Clicking anywhere else on a row's card opens the MR in your browser.
- [ ] Dismiss (X) button hides the MR; a "N MRs hidden — Show all" banner appears; "Show all" restores everything. It sits at a constant half-opacity whether or not you're hovering the row (an inline style overrides the hover-fade rule here) — that's expected, not a missing `:hover` effect.
- [ ] Clicking outside any open dropdown/notes panel closes it.

**Pipelines tab**
- [ ] Loading state: spinner + "Loading pipelines...".
- [ ] Empty state: "No Pipelines" + explanatory message, no configure button.
- [ ] Each pipeline row shows: status icon + colored status tag (Running/Failed/Success/Pending/Canceled), a source tag (Push/Web/Schedule/API/Trigger/MR/Pipeline/Parent/External), the branch/ref, and "Triggered by" with the triggering user's name and avatar (shown only when that user has one — no placeholder if they don't, unlike the row's own avatars elsewhere).
- [ ] Jobs are grouped under a header per stage, in first-seen order; each job is a colored chip (color follows its own status, a wider set than the pipeline-level statuses: running/success/failed/pending/skipped/canceled/manual/created), with a small play-triangle glyph added for manual jobs. Clicking a job chip opens *that job* externally, not the pipeline.
- [ ] Clicking anywhere else on the row opens the pipeline externally.
- [ ] Dismiss/"Show all N pipelines hidden" behaves the same as the MRs tab, including the same constant half-opacity dismiss button (no hover-fade — see the MRs tab note).
- [ ] Failed pipelines older than your configured max-age are simply absent (filtered server-side before they ever reach this tab) — you won't see an aged-out failed pipeline at all, which is correct, not a bug.

**Releases tab**
- [ ] Loading state: spinner + "Loading releases...".
- [ ] Empty state: "No Releases" + message, with a working "Configure projects" button that opens Preferences.
- [ ] Releases are grouped under a header per project (path, or name if no path), in whatever order they were received — not alphabetically sorted (that's the Product Owner view's behaviour, not this tab's).
- [ ] Each release row: title (release name, or tag name if no release name), tag chip, one row per deployment showing status text/icon + environment + who triggered it + when, or "Not deployed" if there are none.
- [ ] Dismiss/"Show all N releases hidden" behaves the same as the other tabs. Note: here the dismiss (X) button is the **opposite** of MRs/Pipelines — it's invisible by default and only fades in on hover, instead of sitting at a constant half-opacity. That's a genuine, source-faithful difference between this tab and the other two, not a bug.

**Product Owner view (toggle via the profile nav, not a tab)**
- [ ] Loading state: spinner + "Loading releases...".
- [ ] Empty state: title/message differ depending on whether you have any watched projects configured at all ("No projects configured" vs. "No releases yet"), with a matching "Configure projects" / "Manage projects" button.
- [ ] A project filter dropdown ("All projects" + one entry per project, alphabetically sorted) narrows the list when changed.
- [ ] Each project section shows a header (icon, project path, release count) and its releases underneath, same per-release layout as the Releases tab's deployment rows **except: no status word next to a deployment's icon here** — icon, environment, and time only. (The Releases tab shows the status word; this view deliberately doesn't — a real, pre-existing difference between the two views, not a porting bug.)
- [ ] A release with a non-empty description shows a "Show more"/"Show less" toggle; expanding it renders the description through `simpleMarkdown`'s constrained subset (bold, italic, headers, inline code, lists, links) — this is the **only** place in the whole app any description is rendered this way (the Releases tab shows no description at all), and so the place to look for the sanctioned link-scheme change from section 2.2, if a description contains a link with an unusual scheme.
- [ ] "Load more releases" button fetches and appends 5 more releases for that project; disappears once a fetch returns fewer than 5 (exhausted); shows "Loading..." while in flight.
- [ ] A page counter for "Load more" is not reset by a background data refresh, even though the extra releases visually are — so after loading a few extra pages, an unrelated refresh, then clicking "Load more" again can silently skip ahead. This was deliberately reproduced (see the ledger, Task 17) — do not report it.

**Untag tab**
- [ ] Loading state ("Scanning unreleased commits...") is its own separate spinner from the other tabs' loading state — it can be showing while everything else has already finished loading.
- [ ] Empty state: "All Tagged" + message, only when there are zero untagged projects AND zero exclusions.
- [ ] An "N projects excluded (no tags) — Reset exclusions" banner appears whenever there are exclusions, even if the untagged-project list itself is empty; clicking "Reset exclusions" clears them (updated data arrives via a push, not immediately).
- [ ] Each project row: name (short name, not full path — see known bug #3), last tag, "+N commits ahead", age badge. A "Show commits"/"Hide commits" button appears only when the project has commits, and toggles a detail panel listing each commit's short SHA, title, and author. Clicking anywhere else on the row (not that button) opens the project externally.
- [ ] Expanded rows collapse again after any data refresh/poll, even for identical data — this is a preserved quirk (the underlying list is always rebuilt from scratch), not a bug.

**Footer**
- [ ] Status dot: gray/"offline"-styled before the first load settles, green once connected, red/error-styled if the last refresh failed.
- [ ] Text next to it: "Not connected" before any data has loaded, otherwise "Updated at HH:MM" in your local time, updating after each successful refresh.
- [ ] "Preferences" link opens the Preferences window.

**Warm-start check**
- [ ] Quit and relaunch the app; repeat a handful of the items above (especially profile-nav/tab selection persistence, footer status) to confirm nothing only worked on a cold first launch.

### 6.2 Preferences window (right-click the tray icon → Preferences)

**Sidebar**
- [ ] Exactly three items, in this order: Accounts, Projects, General. (There is no fourth page — notifications live inside General.)
- [ ] Clicking an item switches the page and highlights the clicked item.
- [ ] Window title reads "GitLabBar - Preferences" (or equivalent, per your window manager's title bar).

**Accounts page**
- [ ] Lists configured accounts: colored circle with the account name's first letter (no image avatar is ever shown here — see the parity note under known bug #1/#2's table row, this page has no `<img>` at all), name, instance URL.
- [ ] "No accounts configured" empty state when the list is empty.
- [ ] Add-account form: name, instance URL (defaults to `https://gitlab.com`), personal access token (password-masked) fields; "Add account" button.
- [ ] Submitting with any field blank shows "Please fill in all fields" and does not submit.
- [ ] Submitting shows "Validating..." on the button while in flight, then a success ("Account added successfully!") or error message that auto-clears after 5 seconds.
- [ ] An invalid token/URL is **not** rejected — the account is added anyway (known bug #4, expected).
- [ ] Delete (trash icon) on an account asks for confirmation, then removes it and shows "Account deleted".

**Projects page**
- [ ] "Watched projects" section (with a count) appears only once you have at least one; each is a removable chip showing the **short project name only** (known bug #3, expected).
- [ ] Search box, placeholder "Search for a project...".
- [ ] Typing fewer than 2 characters shows "Type at least 2 characters..." and does not search.
- [ ] Typing 2+ characters shows "Searching..." immediately (before any network round-trip — it's a typing indicator, not strictly an in-flight one), then either results, "No projects found", or "Error during search".
- [ ] Each search result shows the project name **and** its full `namespace/path` on a second line (the full path **is** shown here, unlike the watched chips above).
- [ ] Clicking a search result toggles it into/out of your watched projects (checkmark indicates selected).
- [ ] Removing a chip's "x" removes it from watched projects immediately.

**General page**
- [ ] "Launch at startup" toggle — flips and persists.
- [ ] "Interface mode" select (Developer / Product Owner) — writes the same setting the menubar's own Developer/Product Owner toggle reads. The menubar window is normally created once and then just shown/hidden by the tray icon, so don't be surprised if an already-open menubar doesn't pick up a change made here until you quit and relaunch the whole app — that's how the window lifecycle has always worked, not a porting regression.
- [ ] "Update interval" select (30s / 1 min / 2 min / 5 min) — persists.
- [ ] "Hide failed pipelines after" select (1h through 168h, plus "Never hide") — persists, **except** picking "Never hide" and reloading shows 24 hours again in the dropdown (known bug #7, expected — the underlying stored value is fine, only the displayed selection reverts).
- [ ] "MRs without reviewer" toggle (shows/hides unassigned-reviewer MRs) — flips and persists.
- [ ] Notifications section, two toggles: "New assigned MRs" and "Failed pipelines" — both flip visually when clicked but do nothing underneath (known bug #6, expected — do not expect them to affect actual notification behaviour, and do not expect their state to survive a reload since nothing persists it).

**Warm-start check**
- [ ] Close the Preferences window (its own close button — unlike the menubar, this window is actually destroyed on close and freshly recreated next time, so you don't need to quit the whole app to test this) and reopen it from the tray; confirm every setting you changed above (except the two dead notification toggles, and except the "Never hide" display quirk) shows the value you set, not a default.

---

## 7. Sign-off

Once every box above is checked (or explicitly reported as a real
divergence, distinct from the known differences in section 2), Phase 1 of
the React migration is accepted. This file is the record of that
acceptance — do not delete it once checked; leave the boxes ticked as the
evidence.
