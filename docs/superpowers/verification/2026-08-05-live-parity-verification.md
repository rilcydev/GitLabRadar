# Compte-rendu — vérification de parité en live (macOS)

- **Date** : 2026-08-05
- **Branche** : `deps-modernization` (part de `react-migration`)
- **Contexte** : première exécution réelle de l'app sur un Mac. Toute la
  migration React (Tasks 1-20) + la modernisation d'outils avaient été faites
  sur Linux, sans jamais lancer Electron. Les tests, le typecheck et le build
  passaient, mais aucun rendu n'avait jamais été observé.
- **Référence** : `docs/superpowers/plans/parity-checklist.md` (section 6).
  Les cases de ce fichier **n'ont pas été cochées** par l'agent (le document
  l'interdit — seul l'humain coche, après vérification de son œil).

---

## Résultat global

- **Les deux fenêtres tournent et s'affichent correctement.** C'est la première
  observation du rendu des deux switchovers jamais lancés :
  - Task 11 (`19081fd` / `e4097a9`) — fenêtre **préférences**
  - Task 19 (`29e4dfc` / `19e77b6`) — fenêtre **menubar** (+ suppression du vanilla)
- **Aucune divergence inattendue trouvée.** Tout le rendu observé correspond à
  la checklist et aux bugs préservés attendus. Aucune régression.

---

## Méthode

- Compte gitlab.com réel **Rilcyy** (id 4697894) ajouté via le **vrai formulaire**
  Préférences > Comptes (ce qui coche aussi le flux d'ajout).
- Projet **`Rilcyy/test-project`** (id 85144484) peuplé via l'API REST avec un
  token de scope `api` :
  - commits + branche `feature-x`
  - tags `v1.0.0`, `v1.1.0` + 2 commits ahead du dernier tag (→ Untag)
  - 2 releases (v1.1.0 avec description markdown : `**gras**`, `` `code` ``,
    un lien `https://` et un lien **`vscode://`** pour le filtre de schéma)
  - MR **!1** (Created by me) + une **note @mention**
  - MR **!2** **Draft** (reviewer = Rilcyy → section *To review*)
  - `.gitlab-ci.yml` (build/test/fail-job/manual-deploy) → pipeline **Failed**
- Rendu inspecté par le **protocole DevTools** (CDP sur `--remote-debugging-port=9222`) :
  DOM, styles calculés, et captures via `Page.captureScreenshot`. Persistance
  testée par **quit/relaunch** (warm-start).
- Un hook debug **temporaire, gated par `GLB_DEBUG_OPEN`** (pour ouvrir la fenêtre
  menubar sans clic tray, la fenêtre n'existant qu'au clic sur l'icône) a été
  ajouté puis **reverté** (`src/main/tray.ts`, `src/main.ts`). **Arbre git propre.**

---

## Vérifié en live ✓

### Menubar (données réelles)
- Rendu non-blanc (fin du risque « fenêtre blanche » Task 19).
- Header : logo, titre, sous-titre d'activité (« 2 MRs • 1 pipeline • 2 releases • 1 untag »), bouton refresh.
- Profile-nav + barre d'onglets : `display:none` sans compte → `flex` avec compte.
- 4 onglets ; badges = nombre d'éléments visibles (dismiss fait 2→1→2).
- **MRs** : sections *To review* / *Created by me* ; par rangée : avatar auteur,
  nom, badge d'âge coloré, **Draft**, tags source→cible, pile *Reviewers*,
  **badge de commentaire mention `@`** (`_notesBadgeMentioned_`), panneau de notes
  flottant (code inline + retour-ligne, rien d'autre), boutons *+ Assign*/*+ Reviewer*,
  bouton dismiss à **`opacity:0.5` constant** (style inline). Dismiss → bannière → Show all restaure.
- **Pipelines** : statut **Failed**, source **Push**, ref, *Triggered by*,
  jobs groupés par stage, chips colorés par statut (dot). *(Le glyphe « manual »
  n'a pas été exercé : le job manuel était `skipped` après l'échec amont — sous-cas mineur.)*
- **Releases** : groupées par projet, chips de tag, *Not deployed* ; dismiss à
  **`opacity:0`** (hover-fade — l'inverse des MRs/Pipelines, conforme).
- **Untag** : bannière « 1 project excluded (no tags) — Reset exclusions » →
  après Reset, rangée projet (nom court, `v1.1.0`, `+2 commits`, âge, *Show/Hide commits*).
- Footer : dot vert *connected*, « Updated at HH:MM », lien Preferences.
- **Warm-start** : après relaunch, mode Developer conservé, projet surveillé
  conservé, exclusions untag conservées, **toutes les données rechargées**.

### Product Owner
- Filtre « All projects », releases triées, layout par déploiement.
- **Changement sanctionné (§2.2) vérifié** : `vscode://…` rendu en **texte brut**,
  `https://…` en **lien cliquable** ; *Show more/less* OK.

### Préférences
- Sidebar : 3 items (Accounts / Projects / General), ordre, item actif, titre « GitLabBar - Preferences ».
- **Accounts** : empty state, formulaire (labels, défaut `https://gitlab.com`,
  hint scope `api`) ; flux d'ajout *Validating… → « Account added successfully! » →
  carte (initiale + nom + URL + poubelle)* ; persistance disque (username validé) ;
  minuteur d'auto-effacement **5 s** (`AccountsPage.tsx:73`).
- **Projects** : recherche (placeholder, « Type at least 2 characters… »,
  **« Searching… » synchrone** avant réseau, résultats **nom + chemin complet**,
  « No projects found »), chip *Watched projects* en **nom court**.
- **General** : tous les contrôles + options ; **persistance** vérifiée sur disque
  (refresh, viewMode, showUnassignedMRs, launchAtStartup, failedPipelineMaxAge).
- **Warm-start** : réglages conservés après relaunch.

---

## Bugs préservés — statut

| # | Nom | Statut de vérification |
|---|---|---|
| 1 | Avatar self-hosted 401 | **Non déclenchable ici** — gitlab.com sert les avatars en 200. Se voit uniquement sur une instance self-hosted (la raison d'être de la migration). |
| 2 | Pas de fallback quand l'avatar échoue | Idem #1. |
| 3 | Noms de projet courts | **Reproduit en live** (chip watched + rangées Untag). |
| 4 | Token invalide n'empêche pas l'ajout | Documenté + épinglé par test. **Pas re-testé en live** (créerait un compte poubelle ; le handler `add` re-valide). |
| 5 | Race de recherche projet | Inhérente, non déclenchée à la main. |
| 6 | Toggles de notif inertes | **Reproduit en live** : la case bascule dans le DOM mais `config.notifications` ne change pas. |
| 7 | « Never hide » → 24 h au reload | **Reproduit en live** (navigation + warm-start) : stocké `0`, le select réaffiche `24`. |
| 8 | Crash nom vide (blast radius) | Non déclenché (nécessite une donnée GitLab malformée). |

---

## Question notification / signature (Electron 42+ → UNNotification)

**Constat de départ :** il n'existe **aucun bouton « Send a test notification »**
dans le code — la section Notifications n'a que les 2 toggles morts (bug #6). Ce
qui existe : les notifs événementielles, le logger `failed` de **def6de4**, et une
notif « Application started » au démarrage (`tray.ts:132`). De plus, `pnpm start`
lance un Electron **non signé** (`com.github.Electron`) → ne teste pas la signature.

**Test réalisé :** condition exacte reproduite — Electron 43, **signé ad-hoc**
(`codesign --sign -`, identifier `com.yoanbernabeu.gitlabbar`, `flags=0x2(adhoc)`,
comme `forge.config.ts`), notif tirée via le wrapper `show`/`failed`.

**Résultat :**
- App ad-hoc : `failed` → **« Notifications are not allowed for this application »**.
- Electron standard `com.github.Electron` : `failed` → **`UNErrorDomain` code 1**
  (= `UNErrorCodeNotificationsNotAllowed`, la même « not allowed »).
- ⇒ Dans **cet environnement d'automatisation**, les notifs sont bloquées
  système/session pour **les deux** apps → impossible d'isoler la variable
  « signature ad-hoc » ici. Session pourtant Aqua, `cyril` loggé.

**Établi malgré tout :** (a) le logger **def6de4 fonctionne** et révèle la cause
exacte ; (b) l'app ad-hoc est **reconnue** par le système de notif (elle reçoit
une erreur d'**autorisation**, pas un rejet de signature) — encourageant mais non
concluant.

**Pour trancher (humain, ~2 min) :** `pnpm make` → installer le `.app` dans
**/Applications** → lancer via **Finder**. Si **GitLabBar apparaît dans
Réglages > Notifications** et peut être activé → la signature ad-hoc **suffit**
(il ne manquait que l'autorisation). Sinon, le log console de def6de4 donne la raison.
*(Note : `pnpm package` échoue ici à « Finalizing » sur un fetch github
d'`@electron/get` — artefact du sandbox d'automatisation ; devrait passer dans un
shell normal.)*

---

## Ce qui demande l'œil de l'humain (non vérifiable par programme)

- **Fidélité visuelle** vs souvenir de l'app vanilla : couleurs, glows, espacements,
  polices, gradients. (L'agent n'a jamais vu la version vanilla.)
- Les **2 seules valeurs de token qui changent** (§2.3) :
  `--accent-green-glow` / `--accent-red-glow` `0.3→0.4` (préférences, thème sombre).
- Le **401 self-hosted** (#1/#2) — uniquement sur l'instance self-hosted.
- Interactions non pilotées : confirmation de suppression de compte (`window.confirm`),
  retrait d'un chip projet, clic-carte → navigateur, dropdown Assign/Reviewer
  (l'action *assign* exige le scope `api`), animation de spin du bouton refresh
  (le refresh fonctionne).

---

## Loose ends

- ⚠️ **Révoquer les deux tokens** utilisés pendant la session (surtout celui de
  scope `api`) : GitLab → Settings → Access Tokens.
- Le compte **Rilcyy reste configuré dans l'app** (token stocké) — à retirer via
  Préférences > Comptes si souhaité.
- **`Rilcyy/test-project` a été peuplé** (commits, branche `feature-x`, tags
  `v1.0.0`/`v1.1.0`, 2 releases, MR !1/!2, `.gitlab-ci.yml`) — à nettoyer si souhaité.
- **Arbre git propre** (modifications temporaires revertées) ; `dist`/`out`/`.vite`
  gitignorés. `pnpm start` relance l'app normalement (menubar au clic tray).
