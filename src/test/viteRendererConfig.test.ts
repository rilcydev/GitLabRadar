// @vitest-environment node
//
// Importing vite.renderer.config.mts pulls in the real `vite` package, which
// uses esbuild internally. esbuild's Node entry point asserts that
// `new TextEncoder().encode('') instanceof Uint8Array`, which jsdom's
// TextEncoder polyfill (the default environment for this project's other
// tests, set in vitest.config.mts) fails, breaking with an unrelated
// "your JavaScript environment is broken" error. Forcing plain `node` for
// just this file avoids the collision.
import { describe, expect, it } from 'vitest';
import viteRendererConfig from '../../vite.renderer.config.mjs';

describe('vite.renderer.config.mts', () => {
  it('sets base to a relative path so the two BrowserWindow.loadFile() entries resolve their assets from their own directory, not from filesystem root', async () => {
    // The config is exported as an async function (it dynamically imports
    // @vitejs/plugin-react -- see the comment at the top of the config file),
    // so it has to be invoked and awaited to get the resolved config object.
    const resolved = await (viteRendererConfig as () => Promise<{ base?: string }>)();
    expect(resolved.base).toBe('./');
  });
});
