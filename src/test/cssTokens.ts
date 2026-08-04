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
