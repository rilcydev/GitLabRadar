import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { GitLabBarApi } from '@/shared/api/contract';
// Value imports: eslint's import/no-unresolved can't follow the `@/*` alias
// for runtime imports (no TS-aware resolver configured -- see
// src/test/harness.test.ts and src/renderer/api/FakeApi.ts for the same
// pre-existing gap), even though tsc/Vite/Vitest all resolve it fine.
// Relative paths sidestep it.
import { ApiProvider } from '../renderer/api/ApiContext';
import { createFakeApi, type FakeEmitter } from '../renderer/api/FakeApi';

// Renders `ui` wrapped in a fresh `ApiProvider`. When no `api` is supplied,
// a brand-new `createFakeApi()` backs the render -- a new instance per call,
// so two renders never share state -- and its paired `emit` is returned
// alongside it, letting the test drive pushed events (dataUpdated,
// refreshStatus, error, untagDataUpdated) without constructing the fake
// itself. When the caller supplies their own `api` (e.g. from their own
// `createFakeApi(overrides)` call, or a hand-built stub), there is no
// matching event bus to hand back, so `emit` comes back `undefined` rather
// than a fabricated one; callers that need both overrides and `emit`
// together already have `emit` from their own `createFakeApi(overrides)`
// call and can use that directly.
export function renderWithApi(
  ui: ReactElement,
  { api, ...options }: { api?: GitLabBarApi } & RenderOptions = {}
) {
  let resolvedApi = api;
  let emit: FakeEmitter | undefined;
  if (!resolvedApi) {
    const fake = createFakeApi();
    resolvedApi = fake.api;
    emit = fake.emit;
  }

  return {
    api: resolvedApi,
    emit,
    ...render(<ApiProvider api={resolvedApi}>{ui}</ApiProvider>, options),
  };
}
