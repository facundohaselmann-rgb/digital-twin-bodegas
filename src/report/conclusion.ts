/* Conclusión del resumen ejecutivo, armada con reglas fijas (sin IA) a partir de los resultados. */
import type { Kpis } from '../engine/kpis';
import type { SimResult } from '../engine/simulate';
import type { Comparison } from '../ui/tabs/ScenariosTab';
import { nf, pct, t } from '../i18n';

export const CPT_TARGET = 0.95;

export function conclusion(k: Kpis, r: SimResult, cmp: Comparison | null): string {
  const out: string[] = [];
  const u = pct(k.util);
  out.push(t(k.util < 0.5 ? 'con.idle' : k.util > 0.85 ? 'con.tight' : 'con.balanced', { u }));
  out.push(k.otH > 0.05 ? t('con.ot', { h: nf(k.otH, 1) }) : t('con.noOt'));
  if (k.unfinished > 0) out.push(t('con.unfinished', { n: nf(k.unfinished) }));
  const bad = r.groups.filter(g => g.cpt.n > 0 && g.cpt.pct < CPT_TARGET);
  if (!bad.length) out.push(t('con.cptOk', { pct: pct(k.cptPct) }));
  else if (bad.length === 1) out.push(t('con.cptOne', { g: bad[0].name, pct: nf(bad[0].cpt.pct * 100, 1) + ' %' }));
  else out.push(t('con.cptMany', { list: bad.map(g => `${g.name} (${nf(g.cpt.pct * 100, 1)} %)`).join(', ') }));
  if (cmp && cmp.s.length > 1) {
    const costs = cmp.s.map(s => s.costPerPkg.mean), best = costs.indexOf(Math.min(...costs));
    out.push(best === 0 ? t('con.baseBest', { base: cmp.names[0] })
      : t('con.best', { name: cmp.names[best], cost: nf(costs[best], 3), d: nf(((costs[best] - costs[0]) / costs[0]) * 100, 0) + ' %', base: cmp.names[0] }));
  }
  return out.join(' ');
}
