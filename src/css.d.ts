// Ambient module declarations for CSS imports (Vite handles the actual
// loading/transform; these exist only so `tsc --noEmit` accepts them).
//
// Deliberately NOT combined into global.d.ts: TypeScript's wildcard ambient
// module matching (`declare module '*.foo'`) only works when the declaring
// file is a plain global script, not an ES module. global.d.ts has a
// top-level `import type` (for `Window.gitlabradar`), which makes it a
// module and silently breaks wildcard matching -- `import styles from
// './x.module.css'` then fails to resolve even though this exact block
// exists elsewhere in the program. Proven empirically: adding a no-op
// `export {}` to an otherwise-working `declare module '*.module.css'` file
// is enough to reproduce the break. Keeping this file import/export-free
// keeps it a global script, where wildcard matching does work.

// Side-effect imports (e.g. `import '../../styles/tokens.css'` in a
// window's main.tsx) have no exported members -- Vite just injects the
// stylesheet. Checked before the more specific `*.module.css` pattern
// below so it only matches plain, non-module stylesheets.
declare module '*.css';

// CSS Modules: Vite rewrites class names and gives back a map of
// original-name -> scoped-name at runtime. First real consumer is
// PreferencesApp.module.css (Task 7); src/test/cssTokenUsage.test.ts
// statically scans these files for undeclared var(--…) tokens.
declare module '*.module.css' {
  const classes: { readonly [className: string]: string };
  export default classes;
}
