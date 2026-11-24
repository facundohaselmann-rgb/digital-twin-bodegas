import { describe, expect, it } from 'vitest';
import { jamaicaWarehouse, modelWarehouse } from '../src/model/defaults';
import { normalize } from '../src/model/normalize';
import { simulate } from '../src/engine/simulate';
import { kpis, summarize, KPI_KEYS } from '../src/engine/kpis';
import { conclusion } from '../src/report/conclusion';
import { setLang } from '../src/i18n';
import type { KpiSummaries } from '../src/ui/tabs/ScenariosTab';

const run = (w = jamaicaWarehouse()) => { normalize(w); const r = simulate(w, { log: false }); return { w, r, k: kpis(r, w) }; };
const sum = (v: Partial<Record<string, number>>): KpiSummaries => Object.fromEntries(KPI_KEYS.map(k => [k, summarize([v[k] ?? 0, v[k] ?? 0])])) as KpiSummaries;

describe('conclusión automática del reporte', () => {
  setLang('es');
  it('capacidad ociosa, sin horas extra y CPT cumplido', () => {
    const { r, k } = run();
    const c = conclusion(k, r, null);
    expect(c).toMatch(/sobra capacidad/);
    expect(c).toMatch(/No hacen falta horas extra/);
    expect(c).toMatch(/El CPT se cumple/);
  });
  it('nombra el único grupo que pierde el CPT (Sur en la bodega Modelo)', () => {
    const { r, k } = run(modelWarehouse());
    expect(conclusion(k, r, null)).toMatch(/El CPT se pierde en el grupo Sur \(70,1 %\)/);
  });
  it('dotación al límite y horas extra', () => {
    const { r, k } = run();
    expect(conclusion({ ...k, util: 0.9, otH: 12.5 }, r, null)).toMatch(/al límite.*12,5 horas extra/);
  });
  it('compara escenarios: el más barato y cuánto frente a la base', () => {
    const { r, k } = run();
    const cmp = { names: ['Base', '+20 %', 'Sorter'], s: [sum({ costPerPkg: 0.355 }), sum({ costPerPkg: 0.295 }), sum({ costPerPkg: 0.393 })], at: '', n: 2 };
    expect(conclusion(k, r, cmp)).toMatch(/El escenario \+20 % tiene el menor costo por paquete: 0,295 USD \(-17 % frente a Base\)/);
    cmp.s[1] = sum({ costPerPkg: 0.4 });
    expect(conclusion(k, r, cmp)).toMatch(/El escenario Base es el de menor costo/);
  });
});
