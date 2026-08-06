import { describe, it, expect } from 'vitest';
import { migrateUserData, type FsLike } from './migrateUserData';

// The app previously shipped as "GitLabBar", so its settings lived in
// `.../Application Support/GitLabBar`. After the rename to GitLabRadar the
// userData path becomes `.../GitLabRadar`; this migration must carry the old
// data across exactly once, without ever clobbering newer data.
const OLD = '/Users/x/Library/Application Support/GitLabBar';
const NEW = '/Users/x/Library/Application Support/GitLabRadar';

function fakeFs(existing: string[]) {
  const present = new Set(existing);
  const renames: Array<[string, string]> = [];
  const fs: FsLike = {
    existsSync: (p) => present.has(p),
    renameSync: (from, to) => {
      renames.push([from, to]);
      present.delete(from);
      present.add(to);
    },
  };
  return { fs, renames };
}

describe('migrateUserData', () => {
  it('renames the legacy dir when only the old one exists', () => {
    const { fs, renames } = fakeFs([OLD]);
    expect(migrateUserData(fs, OLD, NEW)).toBe(true);
    expect(renames).toEqual([[OLD, NEW]]);
  });

  it('never clobbers: does nothing when the new dir already exists', () => {
    const { fs, renames } = fakeFs([OLD, NEW]);
    expect(migrateUserData(fs, OLD, NEW)).toBe(false);
    expect(renames).toEqual([]);
  });

  it('is a no-op on a fresh install (no old dir)', () => {
    const { fs, renames } = fakeFs([]);
    expect(migrateUserData(fs, OLD, NEW)).toBe(false);
    expect(renames).toEqual([]);
  });

  it('is a no-op after the first launch (old gone, new present)', () => {
    const { fs, renames } = fakeFs([NEW]);
    expect(migrateUserData(fs, OLD, NEW)).toBe(false);
    expect(renames).toEqual([]);
  });
});
