import { describe, it, expect } from 'vitest';
import { isNewerVersion, checkForUpdate } from './updateCheck';

describe('isNewerVersion', () => {
  it('is true when latest is a higher patch/minor/major', () => {
    expect(isNewerVersion('0.2.4', '0.2.3')).toBe(true);
    expect(isNewerVersion('0.3.0', '0.2.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
  });

  it('is false when equal or older', () => {
    expect(isNewerVersion('0.2.3', '0.2.3')).toBe(false);
    expect(isNewerVersion('0.2.2', '0.2.3')).toBe(false);
    expect(isNewerVersion('0.2.3', '0.10.0')).toBe(false);
  });

  it('compares numerically, not lexically (0.10 > 0.9)', () => {
    expect(isNewerVersion('0.10.0', '0.9.0')).toBe(true);
  });

  it('ignores a leading v on either side', () => {
    expect(isNewerVersion('v0.2.4', '0.2.3')).toBe(true);
    expect(isNewerVersion('0.2.4', 'v0.2.4')).toBe(false);
  });
});

describe('checkForUpdate', () => {
  const rel = (tag: string) => async () => ({ tag_name: tag, html_url: `https://gh/releases/${tag}` });

  it('returns update info when a newer version is published', async () => {
    const info = await checkForUpdate('0.2.3', rel('v0.2.4'));
    expect(info).toEqual({ version: '0.2.4', url: 'https://gh/releases/v0.2.4' });
  });

  it('returns null when already up to date', async () => {
    expect(await checkForUpdate('0.2.4', rel('v0.2.4'))).toBeNull();
  });

  it('returns null when the latest release is older', async () => {
    expect(await checkForUpdate('0.3.0', rel('v0.2.4'))).toBeNull();
  });

  it('never throws: returns null when the fetch fails', async () => {
    const boom = async () => {
      throw new Error('network down');
    };
    expect(await checkForUpdate('0.2.3', boom)).toBeNull();
  });

  it('returns null when the release has no tag', async () => {
    expect(await checkForUpdate('0.2.3', async () => ({}))).toBeNull();
  });
});
