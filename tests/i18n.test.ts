import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hasKey } from '../src/i18n';
import { PROCESSES, TIME_KEYS } from '../src/model/types';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
}

describe('i18n', () => {
  it('todas las claves literales usadas en la interfaz existen', () => {
    const missing: string[] = [];
    for (const f of files('src')) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'\s*[,)]/g)) if (!hasKey(m[1])) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
  it('las familias de claves dinámicas están completas', () => {
    const dyn = [
      ...PROCESSES.map(p => 'p.' + p), ...TIME_KEYS.map(k => 't.' + k),
      ...[0, 1, 2, 3, 4, 5, 6].flatMap(d => ['d' + d, 'dl' + d]),
      'tab.plan', 'tab.results', 'tab.config', 'phase.off', 'phase.work', 'phase.ot',
    ];
    expect(dyn.filter(k => !hasKey(k))).toEqual([]);
  });
});
