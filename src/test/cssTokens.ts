/**
 * Small CSS custom-property extractor used to guard against CSS Modules
 * (Tasks 8-18) referencing design tokens that don't exist in
 * src/renderer/styles/tokens.css — typos, deleted tokens, or reaching for
 * the wrong side of a window-specific split token.
 *
 * Deliberately dependency-free: no CSS parser, just enough regex to find
 * `--token: value;` declarations and `var(--token...)` references.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN_DECLARATION_RE = /[\s;{](--[a-zA-Z0-9-]+)\s*:/g;
const VAR_REFERENCE_RE = /var\(\s*(--[a-zA-Z0-9-]+)/g;

// Class-name tokens in these CSS Modules are camelCase in the source CSS
// itself (verified: no kebab-case class exists under src/renderer/**/*.module.css),
// i.e. Vite is not asked to do a kebab-case -> camelCase transform here --
// `.someName { ... }` in the CSS is read back as `styles.someName` in the
// component, unchanged. Requiring a letter/underscore right after the `.`
// (not a digit) is what keeps this from matching decimal values like
// `.5em` as a class.
const CLASS_DECLARATION_RE = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
// JS identifier chars only (no `-`): matches a `styles.foo` member
// access, not `styles['foo-bar']` (none of this codebase's CSS Modules
// use bracket access — see cssClassUsage.test.ts for why that matters).
const STYLES_REFERENCE_RE = /\bstyles\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
const STYLES_IMPORT_RE = /import\s+styles\s+from\s+['"](\.[^'"]+\.module\.css)['"]/;

/** Every custom property declared (e.g. `--bg-card-menubar: ...;`) in a CSS source string. */
export function extractDeclaredTokens(css: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of css.matchAll(TOKEN_DECLARATION_RE)) {
    tokens.add(match[1]);
  }
  return tokens;
}

/** Every `var(--token…)` reference in a CSS source string, in source order, duplicates included. */
export function extractVarReferences(css: string): string[] {
  return [...css.matchAll(VAR_REFERENCE_RE)].map((match) => match[1]);
}

/** Recursively list files under `dir` whose name ends with `suffix` (e.g. '.module.css'). */
export function findFilesWithSuffix(dir: string, suffix: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findFilesWithSuffix(full, suffix));
    } else if (entry.endsWith(suffix)) {
      results.push(full);
    }
  }
  return results;
}

export function readCss(path: string): string {
  return readFileSync(path, 'utf-8');
}

/**
 * Every class selector (e.g. `.tabContentActive` in `.tabContentActive {`
 * or `.foo.bar:hover,`) declared in a CSS Modules source string. Not a
 * real selector parser -- like the token regexes above, "just enough" to
 * find every `.name` token, which over-approximates (e.g. it would also
 * pick up a stray `.foo` inside a `content: "..."` string or a `url()`)
 * but never under-approximates, so it cannot hide a real dangling
 * reference behind a false "declared" result.
 */
export function extractDeclaredClasses(css: string): Set<string> {
  const classes = new Set<string>();
  for (const match of css.matchAll(CLASS_DECLARATION_RE)) {
    classes.add(match[1]);
  }
  return classes;
}

/** Every `styles.someName` member-access reference in a component source string, in source order, duplicates included. */
export function extractClassReferences(source: string): string[] {
  return [...source.matchAll(STYLES_REFERENCE_RE)].map((match) => match[1]);
}

/**
 * The relative path a `.tsx` file's `import styles from '...'` points at
 * (e.g. `'./POView.module.css'`), or `null` if the file has no such
 * import. Deliberately narrow: only matches a same-directory relative
 * specifier ending in `.module.css`, which is the only form any component
 * under src/renderer/ currently uses (no `@/*`-aliased or parent-directory
 * styles import exists) -- see cssClassUsage.test.ts for why the guard
 * resolves this per-file rather than assuming "same basename as the
 * component" (POReleaseRow.tsx and UntagProjectRow.tsx both import a
 * sibling component's stylesheet, not their own).
 */
export function extractStylesImportPath(source: string): string | null {
  const match = STYLES_IMPORT_RE.exec(source);
  return match ? match[1] : null;
}
