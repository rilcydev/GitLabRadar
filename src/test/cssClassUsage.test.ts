import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractClassReferences, extractDeclaredClasses, extractStylesImportPath, findFilesWithSuffix, readCss } from './cssTokens';

const RENDERER_DIR = path.resolve(__dirname, '../renderer');

/**
 * Guards `styles.someName` references against the CSS Module they're
 * imported from -- the class-name counterpart to cssTokenUsage.test.ts's
 * var(--…) guard.
 *
 * Why this needs its own guard, separate from `tsc`: Vitest (and Vite)
 * resolve a `*.module.css` import to a Proxy that fabricates a scoped
 * name for *any* property access, including ones with no matching rule in
 * the CSS -- confirmed directly (see the "fabricates a name for a class
 * that was never declared" test below). `src/css.d.ts`'s
 * `declare module '*.module.css'` types the default export as a plain
 * index signature (`{ readonly [className: string]: string }`), so
 * `styles.anyTypoAtAll` type-checks too. Neither the test runner nor `tsc`
 * can therefore ever catch a typo'd or deleted class -- a `styles.foo`
 * reference to a rule that doesn't exist in the CSS silently "works" at
 * every layer except the one that actually renders pixels: a real
 * browser, which applies the fabricated/scoped class name to the DOM node
 * and then has no matching rule to apply. For most classes that's an
 * invisible styling regression; for `MenubarApp.module.css`'s
 * `.tabContentActive` specifically (the only rule that overrides
 * `.tabContent { display: none }`), it means every pane stays hidden --
 * an empty menubar body -- while every other test and `tsc` stay green.
 */
describe('CSS Modules class-name usage guard', () => {
  it('sanity: extractDeclaredClasses finds simple, compound, and comma-separated selectors', () => {
    const css = `
      .example { color: red; }
      .foo.bar:hover, .baz .qux { color: blue; }
      .poReleaseDescription.expanded { color: green; }
    `;
    const declared = extractDeclaredClasses(css);
    expect(declared).toEqual(new Set(['example', 'foo', 'bar', 'baz', 'qux', 'poReleaseDescription', 'expanded']));
  });

  it('sanity: extractDeclaredClasses does not mistake a decimal value (e.g. .5em) for a class', () => {
    const declared = extractDeclaredClasses('.real { margin: .5em; padding: 0.5em; }');
    expect(declared).toEqual(new Set(['real']));
  });

  it('sanity: extractClassReferences finds every styles.someName member access, duplicates included', () => {
    const source = `
      const a = styles.foo;
      const b = cond ? \`\${styles.bar} \${styles.baz}\` : styles.bar;
    `;
    expect(extractClassReferences(source)).toEqual(['foo', 'bar', 'baz', 'bar']);
  });

  it('sanity: extractStylesImportPath resolves a same-directory relative import', () => {
    expect(extractStylesImportPath(`import styles from './Widget.module.css';`)).toBe('./Widget.module.css');
  });

  it('sanity: extractStylesImportPath resolves an import pointing at a sibling component\'s stylesheet', () => {
    // The exact shape POReleaseRow.tsx and UntagProjectRow.tsx use --
    // importing a shared/parent component's CSS Module rather than one of
    // their own. The guard below must resolve THIS path, not assume
    // "same basename as the .tsx file".
    expect(extractStylesImportPath(`import styles from './POView.module.css';`)).toBe('./POView.module.css');
  });

  it('sanity: extractStylesImportPath returns null when the file has no styles import', () => {
    expect(extractStylesImportPath(`import { useState } from 'react';`)).toBeNull();
  });

  it('fixture proof: flags a styles.someName reference to a class not declared in its CSS Module', () => {
    const css = '.knownClass { color: red; }';
    const source = `import styles from './x.module.css';\nconst el = <div className={styles.doesNotExist} />;`;

    const declared = extractDeclaredClasses(css);
    const referenced = extractClassReferences(source);
    const undeclaredRefs = referenced.filter((ref) => !declared.has(ref));

    expect(undeclaredRefs).toEqual(['doesNotExist']);
  });

  it('fixture proof: does not flag styles.someName references that ARE declared in its CSS Module', () => {
    const css = '.knownClass { color: red; } .otherClass.active { color: blue; }';
    const source = `
      import styles from './x.module.css';
      const el = <div className={\`\${styles.knownClass} \${styles.otherClass} \${styles.active}\`} />;
    `;

    const declared = extractDeclaredClasses(css);
    const referenced = extractClassReferences(source);
    const undeclaredRefs = referenced.filter((ref) => !declared.has(ref));

    expect(undeclaredRefs).toEqual([]);
  });

  it("DOM cross-check: Vitest's CSS Modules proxy fabricates a name for a class that was never declared, which is exactly why static usage must be checked separately", async () => {
    // Real module, real (nonexistent) property -- proves the blind spot
    // this guard exists to close, the same way format.test.ts's DOM
    // cross-check proves a property rather than asserting it from
    // documentation.
    const styles = (await import('../renderer/features/releases/POView.module.css')).default as Record<
      string,
      string
    >;
    expect(styles.thisClassWasNeverDeclaredAnywhere).toEqual(expect.stringContaining('thisClassWasNeverDeclaredAnywhere'));
  });

  it('every styles.someName reference in a real component resolves to a class declared in its imported CSS Module', () => {
    // Scoped to *.tsx under src/renderer/, excluding *.test.tsx: test
    // files assert against jsdom, not a real renderer, so a typo there
    // can't ship a blank window the way one in a component can -- same
    // "actual future consumers" scoping cssTokenUsage.test.ts uses for
    // tokens.css.
    const componentFiles = findFilesWithSuffix(RENDERER_DIR, '.tsx').filter((f) => !f.endsWith('.test.tsx'));
    const undefinedByFile: Record<string, string[]> = {};

    for (const file of componentFiles) {
      const source = readFileSync(file, 'utf-8');
      const importPath = extractStylesImportPath(source);
      if (importPath === null) continue; // No CSS Module import -- nothing to check.

      const cssPath = path.resolve(path.dirname(file), importPath);
      const declared = extractDeclaredClasses(readCss(cssPath));
      const referenced = extractClassReferences(source);
      const undeclaredRefs = [...new Set(referenced.filter((ref) => !declared.has(ref)))];

      if (undeclaredRefs.length > 0) {
        undefinedByFile[path.relative(RENDERER_DIR, file)] = undeclaredRefs;
      }
    }

    expect(undefinedByFile).toEqual({});
  });
});
