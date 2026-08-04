import { describe, expect, it } from 'vitest';
import { ALIAS_HARNESS_MARKER } from '@/test/fixtures/alias-target';

describe('test harness', () => {
  it('runs in a DOM environment', () => {
    const el = document.createElement('div');
    el.textContent = 'ok';
    document.body.appendChild(el);
    expect(document.body.textContent).toBe('ok');
  });

  it('resolves the @ alias to src/', () => {
    expect(ALIAS_HARNESS_MARKER).toBe('alias-resolved');
  });
});
