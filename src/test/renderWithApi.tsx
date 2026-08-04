import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { GitLabBarApi } from '@/shared/api/contract';
// Value imports: eslint's import/no-unresolved can't follow the `@/*` alias
// for runtime imports (no TS-aware resolver configured -- see
// src/test/harness.test.ts and src/renderer/api/FakeApi.ts for the same
// pre-existing gap), even though tsc/Vite/Vitest all resolve it fine.
// Relative paths sidestep it.
import { ApiProvider } from '../renderer/api/ApiContext';
import { createFakeApi, type FakeApiOverrides, type FakeEmitter } from '../renderer/api/FakeApi';

export type RenderWithApiOptions = RenderOptions & {
  // Common path: helper builds the fake for you. A test that just wants a
  // stubbed method never has to touch `createFakeApi` itself.
  overrides?: FakeApiOverrides;
  // Escape hatch: caller supplies both halves of an already-built fake
  // together, so `api` and its matching `emit` can never come apart -- there
  // is no door here to receive an `api` without the event bus that backs it.
  fake?: { api: GitLabBarApi; emit: FakeEmitter };
};

// Renders `ui` wrapped in a fresh `ApiProvider` and always returns a real,
// non-optional `{ api, emit }` pair alongside the render result -- no `?.`
// or `!` ever needed at a call site.
//
// - Neither `overrides` nor `fake` given: builds a brand-new `createFakeApi()`
//   per call, so two renders never share state (config store or event bus).
// - `overrides` given: builds the fake with them (`createFakeApi(overrides)`).
// - `fake` given: uses the supplied `{ api, emit }` pair as-is -- for callers
//   that already built their own fake (e.g. to hold onto `emit` themselves
//   before render) and want `renderWithApi` to reuse it rather than build a
//   second, unrelated one.
// - Both given: throws. Passing an `overrides`-built request alongside an
//   already-built `fake` is a contradiction in the caller, not a case to
//   silently resolve one way or the other.
export function renderWithApi(
  ui: ReactElement,
  { overrides, fake, ...options }: RenderWithApiOptions = {}
) {
  if (overrides && fake) {
    throw new Error('renderWithApi: pass either `overrides` or `fake`, not both');
  }

  const { api, emit } = fake ?? createFakeApi(overrides);

  return {
    api,
    emit,
    ...render(<ApiProvider api={api}>{ui}</ApiProvider>, options),
  };
}
