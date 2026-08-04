# Phase 1 — Migration de l'UI vers React (sur Electron)

Date : 2026-08-04
Statut : validé

## Contexte

GitLabBar est une application menubar macOS en Electron. L'interface réellement
affichée est du HTML/CSS/JS vanilla inline, embarqué en source brute dans le
paquet. Un squelette React existe dans le dépôt (`src/renderer.ts`, `App.tsx`,
`src/renderer/components/`, `src/renderer/hooks/`) : il est compilé par Vite à
chaque build mais **jamais chargé au runtime**, `tray.ts` ouvrant les fichiers
vanilla à la place. C'est une migration abandonnée en cours de route.

Objectif à terme : React + Tauri. La réécriture est découpée en deux phases
indépendantes, la présente phase 1 ne changeant que la couche UI.

### Pourquoi deux phases

Passer en React et passer à Tauri sont deux chantiers qui ne se recouvrent
presque pas. Leur seul point de contact est la frontière UI/backend. Menés
ensemble, une panne devient indiscernable : composant React fautif ou commande
Rust fautive ? Menés en séquence autour d'une interface stable, chaque phase se
termine sur une application fonctionnelle et vérifiable.

La phase 1 est également utile seule : si Tauri s'avère pénible, on s'arrête
après elle sans rien perdre.

## Périmètre

### Inclus

- Réécriture en React des deux fenêtres (menubar et préférences).
- Définition d'une interface TypeScript typée pour la frontière UI/backend.
- Consolidation des valeurs visuelles en tokens partagés.
- Mise en place d'un harnais de test (Vitest + Testing Library + jsdom).
- Recâblage du build pour charger le bundle Vite au lieu des sources brutes.

### Exclu

- Toute correction de bug. La phase 1 est à **parité stricte**, bugs compris :
  avatars self-hosted en 401, absence de repli `onerror`, arborescence tronquée
  dans les projets surveillés et la recherche. Ces trois correctifs forment un
  lot séparé, traité après la phase 1 sur une base React testée.
- Toute refonte visuelle. La disposition et la logique visuelle sont conservées.
- Tauri, le processus main, le client GitLab, le polling, les notifications.
- Suppression du squelette React mort : il disparaît par remplacement.

### Critère de réussite

L'application se comporte exactement comme avant. Toute différence observable
est une régression, à l'exception des écarts de tokens explicitement listés lors
de la consolidation (section 3).

## Architecture

### 1. Le contrat — `src/shared/api/`

Une interface `GitLabBarApi` décrit la totalité de la frontière : **32
commandes** en 4 espaces de noms et **4 événements** poussés par le main
process.

| Espace | Commandes | Rôle |
|---|---|---|
| `accounts` | 5 | comptes GitLab, validation de token |
| `gitlab` | 20 | données, actions, recherche, untag |
| `config` | 3 | configuration persistée |
| `app` | 4 | fenêtres, lien externe, quitter |

| Événement | Charge utile |
|---|---|
| `data:updated` | MR, pipelines, releases, statut |
| `refresh:status` | état du rafraîchissement |
| `error:occurred` | message d'erreur |
| `untag:dataUpdated` | projets untag |

Les types proviennent de `src/shared/types/*`, déjà présents et corrects. Tous
les `any` de `preload.ts` disparaissent.

**Règle absolue : aucun composant React n'accède à `window.gitlabbar`.** L'accès
se fait par un hook `useApi()` lisant un contexte React, alimenté à la racine
par une implémentation concrète.

Deux implémentations en phase 1 :

- `ElectronApi` — délègue à `window.gitlabbar`, exposé par `preload.ts`.
- `FakeApi` — en mémoire, déterministe, pour les tests.

En phase 2, une `TauriApi` s'ajoute et remplace `ElectronApi`. Aucun composant
ne change. C'est la raison d'être de cette indirection.

### 2. Découpage des composants

Fenêtre menubar (`src/renderer/index.html`, 3924 lignes) :

- `features/merge-requests/`
- `features/pipelines/`
- `features/releases/` — inclut la vue PO paginée
- `features/untag/`
- `shared/` — `Avatar`, `ItemCard`, `SectionHeader`, `Filters`, `EmptyState`

Fenêtre préférences (`src/renderer/preferences.html`, 1296 lignes) — trois pages,
pas quatre : les réglages de notification sont dans la page General et non dans
un onglet dédié, contrairement à ce que laisse croire le squelette React mort.

- `features/preferences/AccountsPage`
- `features/preferences/ProjectsPage`
- `features/preferences/GeneralPage` — inclut les notifications

Les fichiers `.tsx` existants servent de matériau de référence. Ils n'ont jamais
été exécutés : rien ne garantit leur correction, ils ne sont jamais repris tels
quels.

### 3. Tokens et styles

Les variables CSS existent déjà, mais dupliquées et divergentes entre les deux
fenêtres. Elles sont consolidées dans un `tokens.css` unique — couleurs,
espacements, rayons, typographie, dégradés.

Toute divergence réconciliée est **consignée par écrit** : c'est la seule
catégorie d'écart visuel autorisée par rapport à l'application actuelle, et elle
doit être listée pour rester distinguable d'une régression.

Le style par composant passe en CSS Modules. Le choix de CSS Modules plutôt que
Tailwind est délibéré : le CSS existant se transpose presque mécaniquement,
là où Tailwind imposerait de réécrire chaque règle — travail sans rapport avec
l'objectif et générateur de régressions.

### 4. État

État React natif et contexte, sans TanStack Query. Les données sont poussées par
le polling du main process via `data:updated` ; il n'y a pas de cache de
requêtes à gérer. Un `DataProvider` s'abonne aux événements et distribue.

### 5. Câblage du build

C'est le seul point capable de casser le packaging macOS.

État actuel :

- `forge.config.ts:31-34` — `extraResource: ['./assets', './src/renderer']`
  embarque le dossier source brut.
- `tray.ts:20-22` — `RENDERER_PATH` pointe sur ce dossier ; `loadFile()` ouvre
  `index.html` et `preferences.html`.
- L'entrée Vite `main_window` (racine `index.html` → `src/renderer.ts`) est
  compilée puis ignorée.

Cible :

- Vite produit deux entrées, `menubar` et `preferences`.
- `RENDERER_PATH` pointe sur la sortie de build.
- `extraResource` n'embarque plus les sources du renderer.

Cette modification est isolée dans sa propre tâche, exécutée en premier, et
validée séparément.

## Tests

Vitest, Testing Library, jsdom.

- Composants montés contre `FakeApi`.
- Transformations et formatages de données.
- Pas d'E2E Electron : coût disproportionné pour cette phase.

Le harnais fait partie de la tâche fondation. Sans lui, un agent d'exécution ne
peut rien prouver de son travail.

## Vérification — limite structurelle

L'environnement de développement est sous Linux. Y sont exécutables : tests,
typecheck, lint, build du renderer.

**Le lancement de l'application et le jugement de parité visuelle ne le sont
pas** — c'est un menubar macOS. Ces deux vérifications incombent à l'humain, sur
son Mac.

Toute affirmation de parité produite par un agent d'exécution est donc une
affirmation *non vérifiée*. Le plan d'implémentation doit l'énoncer explicitement
à chaque tâche concernée, et la checklist de parité doit rester ouverte jusqu'à
validation humaine.

## Découpage de l'exécution

1. **Fondation** (bloquante, séquentielle) — contrat, `preload.ts` typé,
   `ElectronApi`, `FakeApi`, harnais de test, câblage du build, `tokens.css`.
   Tout le reste en dépend.
2. **Zones fonctionnelles** (parallélisables) — une tâche par dossier `features/`.
   Elles ne partagent aucun fichier.
3. **Intégration et parité** — assemblage, checklist, remise à l'humain.

## Suites

- Lot correctifs : avatars 401, repli `onerror`, arborescence complète.
- Phase 2 : substitution de la coquille Electron par Tauri derrière
  `GitLabBarApi`.
- Éventuelle refonte visuelle, après Tauri.
