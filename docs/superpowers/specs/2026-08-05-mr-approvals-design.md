# Design — Suivi des approbations de MR

Date : 2026-08-05
Statut : validé (design)

## Contexte

L'app affiche les merge requests où l'utilisateur est impliqué (auteur,
assigné, reviewer, mentionné) mais n'expose jamais leur **état
d'approbation**. On veut, sur une base React déjà testée :

- un **badge d'approbation persistant** sur **toutes** les MRs affichées ;
- une **notification macOS** quand quelqu'un approuve une MR **créée par moi**.

**Prérequis / contrainte.** Les approbations de MR (règles d'approbation,
liste `approved_by`, nombre requis) sont une fonctionnalité GitLab
**Premium/Ultimate**. Sur une instance sans approbations (Free), il n'y a
rien à lire : le badge ne s'affiche simplement pas et aucune notification ne
part. Ce design suppose une instance de travail avec les approbations
activées.

## Périmètre

### Inclus

- Lecture de l'état d'approbation par MR via l'API REST
  `GET /projects/:id/merge_requests/:iid/approvals`.
- Extension du modèle `MergeRequest` : `approvedBy`, `approvalsRequired`.
- **Badge** sur chaque ligne de MR : pile d'avatars des approbateurs +
  progression **« N / M »** (approbations obtenues / requises).
- **Notification** « {name} approved your MR » pour les MRs dont je suis
  l'auteur, au moment d'une **nouvelle** approbation, dédupliquée.
- Réglage `notifications.mrApproved` (+ toggle Préférences → General →
  Notifications).
- Tests (TDD) à chaque étape.

### Exclu

- Approuver / désapprouver depuis l'app (lecture seule).
- Le détail des règles d'approbation (quelle règle, quels approbateurs
  requis nommément) — on n'utilise que le compte requis global.
- Batch GraphQL — le REST par MR suffit à ce volume (voir §1).
- Faire fonctionner la feature sur une instance sans approbations : dégradation
  silencieuse (pas de badge, pas de notif), pas un cas à « gérer ».

## Architecture

### 1. Récupération (processus main) — le seul vrai arbitrage

L'état d'approbation n'est pas dans la réponse liste des MRs ; chaque MR
demande son propre appel `/approvals`
(`{ approved_by: [{ user }], approvals_required, approvals_left }`).

- **REST par MR, à chaque poll** ← retenu. S'aligne exactement sur le client
  existant : le poller fait déjà des appels par MR (`getProject`, détection de
  mention). N appels supplémentaires par poll, acceptables à un intervalle de
  30 s–5 min.
- *GraphQL en batch* (toutes les approbations en une requête) — moins d'appels
  mais introduit GraphQL dans une base 100 % REST. YAGNI ici.

Implémentation :
- `src/main/api/gitlab.ts` : `getMergeRequestApprovals(projectId, iid)` →
  l'endpoint ci-dessus, mappe `approved_by[].user` → `MergeRequestAuthor[]` et
  renvoie `{ approvedBy, approvalsRequired }`.
- `src/main/services/polling.ts` : après avoir constitué la liste des MRs,
  enrichir chaque MR avec `approvedBy` / `approvalsRequired`, en parallèle avec
  une concurrence limitée (même motif `batchSize` que la détection de mention).
- **Robustesse** : un `/approvals` en échec (404/403 sur instance sans
  approbations, erreur réseau) est *best-effort* → `approvedBy = []`,
  `approvalsRequired = 0`, sans bloquer le poll ni les autres MRs.

### 2. Modèle

- `src/shared/types/mergeRequest.ts` : `MergeRequest` +
  `approvedBy: MergeRequestAuthor[]`, `approvalsRequired: number`.
- Ces champs traversent l'événement `data:updated` (clone structuré) sans
  changement de contrat. Mettre à jour `FakeApi` et les fixtures/factories de
  test (`makeMR`) pour défauter `approvedBy: []`, `approvalsRequired: 0`.

### 3. Badge (renderer) — toutes les MRs

- Nouveau composant `ApprovalBadge` sous
  `src/renderer/features/merge-requests/`, rendu dans la ligne MR
  (`MergeRequestsTab`) à côté des badges draft / conflict / comment.
- Contenu : icône **✓** (verte) + **pile d'avatars mini** des approbateurs
  (réutilise `Avatar` taille `mini` + `AvatarOverflow`, plafond 3 + « +N ») +
  texte de progression.
- Progression :
  - `approvalsRequired > 0` → **« N / M »** (N = `approvedBy.length`,
    M = `approvalsRequired`).
  - `approvalsRequired === 0` (pas de règle) → **« N »** seul (le compte des
    approbateurs), pas de « / M ».
- **Pas de badge** quand `approvedBy` est vide.
- Tooltip : noms des approbateurs.

### 4. Notification (processus main) — mes MRs seulement

- `src/main/services/notifications.ts` : `checkNewApprovals(oldMRs, newMRs)`,
  appelée depuis `polling.ts` après chaque refresh (comme `checkNewMRs` /
  `checkPipelineStatusChange`).
- Logique : pour chaque MR de `newMRs` où `userRole === 'author'`, comparer son
  `approvedBy` (par id d'approbateur) à la version précédente (indexée par
  `mr.id`). Pour chaque **nouvel** approbateur :
  - si `notifications.enabled && notifications.mrApproved`,
  - et pas déjà notifié (Set `notifiedApprovals`, clé `mrId:approverId`),
  - afficher une notif : **titre « MR approved »**, **corps
    « {approver.name} approved: {mr.title} »**, clic → `openExternal(mr.webUrl)`.
- Chaînes de notification en **anglais**, comme les notifications existantes.
- `notifiedApprovals` purgé dans `cleanNotificationCache()` comme les autres
  caches.

### 5. Config

- `src/shared/types/config.ts` : `NotificationConfig` +
  `mrApproved: boolean` (défaut `true`) ; `DEFAULT_CONFIG` mis à jour.
- `GeneralPage` : un troisième toggle de notification **« MR approved »**
  (à la suite de « New assigned MRs » / « Failed pipelines »), câblé exactement
  comme les deux autres — contrôlé, lit/écrit `config.notifications`.

## Tests (TDD)

- `gitlab.ts` : `getMergeRequestApprovals` mappe `approved_by` → `approvedBy`
  et remonte `approvalsRequired`.
- `polling` : les MRs sont enrichies ; un `/approvals` en échec dégrade en
  `[]` / `0` sans casser le reste.
- `checkNewApprovals` : notifie sur un nouvel approbateur (auteur uniquement),
  dédupe, ignore les MRs non-author, respecte `mrApproved` et `enabled`.
- `ApprovalBadge` : rend la pile d'avatars + « N / M » ; « N » seul si
  `approvalsRequired === 0` ; rien si `approvedBy` vide.
- `GeneralPage` : le toggle `mrApproved` lit et persiste `config.notifications`.

## Découpage de l'implémentation

1. **Fondation** : modèle (`MergeRequest`, `NotificationConfig`), `FakeApi` +
   factories de test.
2. **Récupération** : `getMergeRequestApprovals` + enrichissement dans
   `polling.ts`.
3. **Notification** : `checkNewApprovals` + `mrApproved` (config + toggle
   GeneralPage).
4. **Badge** : `ApprovalBadge` + intégration dans `MergeRequestsTab`.

Chaque étape se termine sur une app qui typecheck, teste vert, et reste
utilisable.
