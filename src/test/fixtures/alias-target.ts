// Minimal fixture for asserting that the '@' -> 'src' alias resolves
// identically under both Vitest (bundler-time alias) and TypeScript
// (tsconfig `paths`). Do not import from application code here.
export const ALIAS_HARNESS_MARKER = 'alias-resolved';
