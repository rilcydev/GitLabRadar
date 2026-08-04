import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs in a DOM environment', () => {
    const el = document.createElement('div');
    el.textContent = 'ok';
    document.body.appendChild(el);
    expect(document.body.textContent).toBe('ok');
  });
});
