import { defineConfig } from 'vite';
import { resolve } from 'path';

// @vitejs/plugin-react is ESM-only (package.json has "exports" but no
// "main"); eslint-plugin-import's default resolver can't follow it even
// though tsc/Vite/Vitest all resolve it fine. Same category of pre-existing
// resolver gap as the `@/*` alias (see src/test/renderWithApi.tsx), just
// triggered by a bare specifier lacking a "main" field instead of the
// alias. (Not flagged here -- only the dynamic `import()` call below is.)
type PluginReactModule = typeof import('@vitejs/plugin-react');

export default defineConfig(async () => {
  // This package.json has no "type": "module", so Vite's config loader
  // bundles this file as CommonJS and executes it with `require()`.
  // `@vitejs/plugin-react` publishes ESM only (no CJS entry), so a static
  // `import react from '@vitejs/plugin-react'` fails at build time --
  // esbuild externalizes the dependency, and the runtime `require()` of a
  // pure-ESM package then throws "resolved to an ESM file. ESM file cannot
  // be loaded by `require`." A dynamic `import()`, unlike `require()`, can
  // load an ESM module from a CommonJS-bundled file in Node, so it works
  // here without renaming this file to `.mts` or adding "type": "module"
  // to package.json (either of which would ripple into forge.config.ts and
  // the other Vite configs, which are out of scope for this task).
  // See the comment above `PluginReactModule` -- same ESM-only resolver gap.
  // eslint-disable-next-line import/no-unresolved
  const { default: react } = (await import('@vitejs/plugin-react')) as PluginReactModule;

  return {
    plugins: [react()],
    resolve: { alias: { '@': '/src' } },
    build: {
      rollupOptions: {
        input: {
          menubar: resolve(__dirname, 'src/renderer/windows/menubar/index.html'),
          preferences: resolve(__dirname, 'src/renderer/windows/preferences/index.html'),
        },
      },
    },
  };
});
