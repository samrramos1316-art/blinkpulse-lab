import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const rel = (f: string) => relative(ROOT, f).replaceAll('\\', '/');
const sourceFiles = listFiles(SRC).filter((f) => /\.(css|ts|tsx)$/.test(f));
const nonTestFiles = sourceFiles.filter((f) => !/\.test\.tsx?$/.test(f));
const STRINGS_FILE = 'src/ui/strings.ts';

function offendingLines(pattern: RegExp, files: string[]): string[] {
  return files.flatMap((f) =>
    readFileSync(f, 'utf8')
      .split(/\r?\n/)
      .filter((line) => pattern.test(line))
      .map((line) => `${rel(f)}: ${line.trim()}`),
  );
}

describe('design rules (SPEC_AMENDMENT_02 Part 5)', () => {
  it('no raw hex colours outside tokens.css', () => {
    const files = nonTestFiles.filter((f) => !f.endsWith('tokens.css'));
    expect(offendingLines(/#[0-9a-fA-F]{3,8}\b/, files)).toEqual([]);
  });

  it('no external URLs in source (fonts, icons, styles, scripts must be self-hosted)', () => {
    // Reference links in comments are fine; only code that could load a resource counts.
    const isComment = (entry: string) => /^[^:]+: (\*|\/\/|\/\*)/.test(entry);
    expect(offendingLines(/\bhttps?:\/\//, nonTestFiles).filter((e) => !isComment(e))).toEqual([]);
  });
});

describe('indicator wording (SPEC_AMENDMENT_01 Patch C1)', () => {
  it('fatigue/drowsiness words appear only in src/ui/strings.ts', () => {
    const files = nonTestFiles.filter((f) => rel(f) !== STRINGS_FILE);
    expect(offendingLines(/fatigue|drows/i, files)).toEqual([]);
  });

  it('always-banned phrases appear nowhere in src, including strings.ts', () => {
    const banned =
      /fatigue detected|drowsiness detected|you are (tired|drowsy)|\bstress|\bemotion|\battention\b|\bcognitive\b|\bautonomic\b/i;
    expect(offendingLines(banned, nonTestFiles)).toEqual([]);
  });

  it('"diagnose" appears only in strings.ts, where it is used as a denial', () => {
    const files = nonTestFiles.filter((f) => rel(f) !== STRINGS_FILE);
    expect(offendingLines(/\bdiagnos/i, files)).toEqual([]);
  });
});
