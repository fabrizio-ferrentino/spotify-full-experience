// Fails if any file under test/fixtures/ contains credentials or personal data (public repo).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findSensitivePatterns } from '../../src/shared/fixtureSafety';

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

describe('fixtures safety', () => {
  const files = listFiles(fixturesDir);

  it('finds the fixtures folder', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [path.relative(fixturesDir, file), file]))('%s has no sensitive data', (_name, file) => {
    expect(findSensitivePatterns(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
