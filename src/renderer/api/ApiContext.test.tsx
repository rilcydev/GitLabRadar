import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiProvider, useApi } from './ApiContext';
import { createFakeApi } from './FakeApi';

function Probe() {
  const api = useApi();
  return <span>{typeof api.gitlab.refresh}</span>;
}

describe('ApiProvider', () => {
  it('supplies the api to descendants', () => {
    const { api } = createFakeApi();
    render(
      <ApiProvider api={api}>
        <Probe />
      </ApiProvider>
    );
    expect(screen.getByText('function')).toBeInTheDocument();
  });

  it('throws a clear error when used outside a provider', () => {
    expect(() => render(<Probe />)).toThrow(/useApi must be used within an ApiProvider/);
  });
});
