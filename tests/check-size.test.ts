import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

type Measured = { file: string; kind: 'code' | 'doc'; size: number };
const { LIMITS, ALLOWED, measure, problems } = createRequire(import.meta.url)('../tools/check-size.cjs') as {
  LIMITS: { code: number; doc: number };
  ALLOWED: Record<string, number>;
  measure: (root: string) => Measured[];
  problems: (files: Measured[], limits?: { code: number; doc: number }, allowed?: Record<string, number>) => string[];
};

const limits = { code: 10, doc: 100 };

describe('file size limits', () => {
  let tmp = '';
  afterEach(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); tmp = ''; });

  it('passes files within the limits', () => {
    expect(problems([{ file: 'src/a.ts', kind: 'code', size: 10 }, { file: 'docs/a.md', kind: 'doc', size: 100 }], limits, {})).toEqual([]);
  });

  it('fails a file over its limit', () => {
    const bad = problems([{ file: 'src/a.ts', kind: 'code', size: 11 }, { file: 'docs/a.md', kind: 'doc', size: 101 }], limits, {});
    expect(bad).toHaveLength(2);
    expect(bad[0]).toMatch(/^src\/a\.ts: 11 lines, over the limit of 10/);
    expect(bad[1]).toMatch(/^docs\/a\.md: 101 bytes, over the limit of 100/);
  });

  it('holds an allowlisted file at its ceiling', () => {
    const allowed = { 'src/big.ts': 50 };
    expect(problems([{ file: 'src/big.ts', kind: 'code', size: 50 }], limits, allowed)).toEqual([]);
    expect(problems([{ file: 'src/big.ts', kind: 'code', size: 40 }], limits, allowed)).toEqual([]);
    expect(problems([{ file: 'src/big.ts', kind: 'code', size: 51 }], limits, allowed)[0]).toMatch(/past its allowlisted 50/);
  });

  it('fails stale allowlist entries so the list only shrinks', () => {
    const allowed = { 'src/split.ts': 50, 'src/gone.ts': 50 };
    const bad = problems([{ file: 'src/split.ts', kind: 'code', size: 9 }], limits, allowed);
    expect(bad).toHaveLength(2);
    expect(bad[0]).toMatch(/^src\/split\.ts: now 9 lines, within the limit; remove it/);
    expect(bad[1]).toMatch(/^src\/gone\.ts: allowlisted but missing/);
  });

  it('measures code in lines and docs in bytes, skipping other files and ignored folders', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'size-check-'));
    const write = (rel: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.writeFileSync(path.join(tmp, rel), text);
    };
    write('src/a.ts', 'one\ntwo\nthree\n');
    write('tools/b.py', 'one\ntwo');
    write('tools/blender/previews/c.py', 'skipped\n');
    write('src/d.json', '{}\n');
    write('docs/e.md', 'héllo\n');
    write('AGENTS.md', 'rules\n');
    const found = measure(tmp).sort((a, b) => a.file.localeCompare(b.file));
    expect(found).toEqual([
      { file: 'AGENTS.md', kind: 'doc', size: 6 },
      { file: 'docs/e.md', kind: 'doc', size: 7 },
      { file: 'src/a.ts', kind: 'code', size: 3 },
      { file: 'tools/b.py', kind: 'code', size: 2 },
    ]);
  });

  it('keeps every allowlisted file over the limit it is excused from', () => {
    for (const [file, ceiling] of Object.entries(ALLOWED)) expect(ceiling, file).toBeGreaterThan(LIMITS[file.endsWith('.md') ? 'doc' : 'code']);
  });
});
