import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractDeclaredTokens, extractVarReferences, findFilesWithSuffix, readCss } from './cssTokens';

const TOKENS_CSS_PATH = path.resolve(__dirname, '../renderer/styles/tokens.css');
const RENDERER_DIR = path.resolve(__dirname, '../renderer');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/css');

describe('CSS custom-property usage guard', () => {
  const declaredTokens = extractDeclaredTokens(readCss(TOKENS_CSS_PATH));

  it('sanity: the extractor actually finds tokens.css declarations', () => {
    // Guards against the regex silently matching nothing (e.g. broken by a
    // future edit), which would make every assertion below pass vacuously.
    expect(declaredTokens.size).toBeGreaterThan(30);
    expect(declaredTokens.has('--bg-card-menubar')).toBe(true);
    expect(declaredTokens.has('--bg-card-preferences')).toBe(true);
  });

  it('fixture proof: flags a var() reference to a token that is not defined in tokens.css', () => {
    const refs = extractVarReferences(readCss(path.join(FIXTURES_DIR, 'invalid-token-usage.module.css')));
    expect(refs).toContain('--does-not-exist');

    const undefinedRefs = refs.filter((ref) => !declaredTokens.has(ref));
    expect(undefinedRefs).toEqual(['--does-not-exist']);
  });

  it('fixture proof: does not flag var() references to tokens that ARE defined in tokens.css', () => {
    const refs = extractVarReferences(readCss(path.join(FIXTURES_DIR, 'valid-token-usage.module.css')));
    expect(refs.length).toBeGreaterThan(0);

    const undefinedRefs = refs.filter((ref) => !declaredTokens.has(ref));
    expect(undefinedRefs).toEqual([]);
  });

  it('every var(--…) reference in a real CSS Module resolves to a token defined in tokens.css', () => {
    // Scoped to *.module.css under src/renderer/, i.e. the actual future
    // consumers of tokens.css per the Task 6 interface ("Every CSS Module
    // in Tasks 8-18 uses var(--…)"). Deliberately excludes the pre-existing,
    // unrelated src/renderer/styles/global.css and preferences.css, which
    // predate this migration and define their own separate --color-*/
    // --spacing-*/--font-* token vocabulary that was never meant to live in
    // tokens.css. As of Task 6, no CSS Modules exist yet, so this list is
    // empty and the assertion passes vacuously — the three tests above are
    // what prove the guard actually works; this one becomes load-bearing
    // starting with the first CSS Module written in Task 8.
    const moduleFiles = findFilesWithSuffix(RENDERER_DIR, '.module.css');
    const undefinedByFile: Record<string, string[]> = {};

    for (const file of moduleFiles) {
      const undefinedRefs = [
        ...new Set(extractVarReferences(readCss(file)).filter((ref) => !declaredTokens.has(ref))),
      ];
      if (undefinedRefs.length > 0) {
        undefinedByFile[path.relative(RENDERER_DIR, file)] = undefinedRefs;
      }
    }

    expect(undefinedByFile).toEqual({});
  });
});
