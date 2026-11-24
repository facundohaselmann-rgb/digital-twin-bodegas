/* Reporte PDF en A4 vertical: se elige qué secciones van, se edita la conclusión y se imprime con Chrome ("Guardar como PDF"). */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { getLang, nf, pct, t } from '../../i18n';
import { COST_CATEGORIES, PROCESSES, type PlanBackground, type Warehouse } from '../../model/types';
import type { SimResult } from '../../engine/simulate';
import { computeCost, type Kpis } from '../../engine/kpis';
import { buildPlan } from '../../plan/plan';
import { conclusion } from '../../report/conclusion';
import type { Comparison, KpiSummaries } from './ScenariosTab';
import logoWhite from '../../assets/mailamericas-logo-white.svg';
import logoBlack from '../../assets/mailamericas-logo.svg';

const SECS = ['cover', 'summary', 'scenarios', 'costs', 'cpt', 'plan', 'returns', 'assumptions'] as const;
type Sec = typeof SECS[number];

const Mark = ({ light }: { light?: boolean }) => (
  <svg class="mark" aria-hidden="true" viewBox="0 0 120 120"><rect x="34" y="6" width="80" height="80" rx="10" fill="none" stroke="#76bd1d" stroke-width="12" /><rect x="6" y="34" width="80" height="80" rx="10" fill={light ? '#ffffff' : '#272726'} /></svg>
);

function PlanSnap({ w, plan }: { w: Warehouse; plan: PlanBackground | null }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => { if (ref.current) buildPlan(ref.current, w, plan); }, [w, plan]);
  return <svg ref={ref} class="rplan" xmlns="http://www.w3.org/2000/svg" />;
}

export function ReportTab({ w, r, k, rep, cmp, plan, scenario }: { w: Warehouse; r: SimResult; k: Kpis; rep: KpiSummaries | null; cmp: Comparison | null; plan: PlanBackground | null; scenario: string }) {
  const [on, setOn] = useState<Record<Sec, boolean>>(() => { try { return { ...Object.fromEntries(SECS.map(s => [s, true])), ...JSON.parse(localStorage.getItem('dtw-report') || '{}') }; } catch { return Object.fromEntries(SECS.map(s => [s, true])) as Record<Sec, boolean>; } });
  const auto = conclusion(k, r, cmp);
  const [text, setText] = useState<string | null>(null); // null: se usa la automática, que se actualiza con cada corrida
  useEffect(() => { document.body.classList.add('rep-mode'); return () => document.body.classList.remove('rep-mode'); }, []);
  useEffect(() => { try { localStorage.setItem('dtw-report', JSON.stringify(on)); } catch { /* ignorar */ } }, [on]);
  const cost = computeCost(r, w), inb = r.totals.inbound;
  const date = new Date().toLocaleDateString(getLang());
  // sin comparación no hay página de escenarios (quedaría vacía); el aviso queda en el panel
  const shown = SECS.filter(s => on[s] && (s !== 'scenarios' || cmp));
  const tile = (l: string, v: string, d = '') => <div class="rtile"><span>{l}</span><b>{v}</b>{d && <small>{d}</small>}</div>;
  const page = (s: Sec, title: string, body: ComponentChildren) => (
    <section class="page" key={s}>
      <header class="rhead"><img src={logoBlack} alt="MailAmericas" /><span><Mark /> MAT · {w.name}</span></header>
      <div class="rbar" /><h2>{title}</h2>
      {body}
      <footer class="rfoot"><span>{t('rep.foot', { sc: scenario, date })}</span><span>{shown.indexOf(s) + 1} / {shown.length}</span></footer>
    </section>
  );

  const pages: Record<Sec, () => ComponentChildren> = {
    cover: () => (
      <section class="page cover" key="cover">
        <img class="clogo" src={logoWhite} alt="MailAmericas" />
        <div class="cbody">
          <div class="rbar" />
          <span class="ceyebrow"><Mark light /> MAT · {t('rep.kind')}</span>
          <h1>{w.name}</h1>
          <p>{t('rep.coverSub', { sc: scenario })}</p>
        </div>
        <div class="cmeta">
          <div><small>{t('rep.week')}</small><b>{t('rep.pkgs', { n: nf(r.totals.pkgs) })}</b></div>
          <div><small>{t('rep.runs')}</small><b>{nf(w.replicas)}</b></div>
          <div><small>{t('rep.date')}</small><b>{date}</b></div>
        </div>
        <p class="clema">«Wherever you want to go.»</p>
      </section>
    ),
    summary: () => page('summary', t('rep.summary'), <>
      <p class="rlead">{text ?? auto}</p>
      <div class="rtiles">
        {tile(t('k.costPerPkg'), nf(k.costPerPkg, 3) + ' USD', rep ? '± ' + nf(rep.costPerPkg.ci, 3) : t('kpi.oneRun'))}
        {tile(t('k.cptPct'), pct(k.cptPct))}
        {tile(t('kpi.time'), nf(k.timeMean / 60, 1) + ' h', 'P90 ' + nf(k.timeP90 / 60, 1) + ' h')}
        {tile(t('k.util'), nf(k.util * 100, 1) + ' %')}
        {tile(t('k.otH'), nf(k.otH, 1) + ' h')}
      </div>
    </>),
    scenarios: () => page('scenarios', t('rep.scenarios'), cmp ? <>
      <table class="rtbl"><thead><tr><th>{t('res.kpi')}</th>{cmp.names.map(n => <th class="n">{n}</th>)}</tr></thead>
        <tbody>{(['costPerPkg', 'cptPct', 'timeMean', 'util', 'otH'] as const).map(key => <tr><td>{key === 'timeMean' ? t('kpi.time') : t('k.' + key)}</td>{cmp.s.map(s => <td class="n">{
          key === 'costPerPkg' ? nf(s[key].mean, 3) + ' USD' : key === 'cptPct' || key === 'util' ? nf(s[key].mean * 100, 1) + ' %' : key === 'timeMean' ? nf(s[key].mean / 60, 1) + ' h' : nf(s[key].mean, 1) + ' h'}</td>)}</tr>)}</tbody></table>
      <div class="rbars">{cmp.s.map((s, i) => { const max = Math.max(...cmp.s.map(x => x.costPerPkg.mean)); return (
        <div class="rbr"><span>{cmp.names[i]}</span><i style={{ width: `${(s.costPerPkg.mean / max) * 100}%`, background: i === 0 ? '#272726' : s.costPerPkg.mean < cmp.s[0].costPerPkg.mean ? '#76bd1d' : '#ff521b' }} /><b>{nf(s.costPerPkg.mean, 3)}</b></div>); })}</div>
      <p class="rnote">{t('rep.cmpNote', { n: cmp.n })}</p>
    </> : null),
    costs: () => page('costs', t('rep.costs'), <>
      <table class="rtbl"><thead><tr><th></th><th class="n">USD</th><th class="n">{t('res.perPkg')}</th><th class="n">{t('res.share')}</th></tr></thead>
        <tbody>
          {([['res.cLabor', cost.labor], ['res.cOT', cost.overtime], ['res.cSupplies', cost.supplies]] as const).map(([l, v]) => <tr><td>{t(l)}</td><td class="n">{nf(v)}</td><td class="n">{nf(v / inb, 3)}</td><td class="n">{pct(v / cost.total)}</td></tr>)}
          <tr><td class="sub2">↳ {t('res.cIdle')}</td><td class="n">{nf(cost.idle)}</td><td class="n">{nf(cost.idle / inb, 3)}</td><td class="n">{pct(cost.idle / cost.total)}</td></tr>
          {COST_CATEGORIES.filter(c => cost.fixed[c] > 0).map(c => <tr><td>{t('cc.' + c)}</td><td class="n">{nf(cost.fixed[c])}</td><td class="n">{nf(cost.fixed[c] / inb, 3)}</td><td class="n">{pct(cost.fixed[c] / cost.total)}</td></tr>)}
          <tr class="tot"><td>{t('total')}</td><td class="n">{nf(cost.total)}</td><td class="n">{nf(cost.perPkg, 3)}</td><td class="n">100%</td></tr>
        </tbody></table>
      <h3>{t('res.cByProcess')}</h3>
      <table class="rtbl"><tbody>{PROCESSES.filter(p => cost.byProcess[p] > 0).map(p => <tr><td>{t('p.' + p)}</td><td class="n">{nf(cost.byProcess[p])} USD</td><td class="n">{nf(cost.byProcess[p] / inb, 3)}</td></tr>)}</tbody></table>
    </>),
    cpt: () => page('cpt', t('rep.cpt'), <>
      <table class="rtbl"><thead><tr><th>{t('res.group')}</th><th>{t('cfg.dest')}</th><th class="n">{t('res.pkgs')}</th><th class="n">{t('k.cptPct')}</th><th class="n">{t('zp.late')}</th><th class="n">P90</th></tr></thead>
        <tbody>{r.groups.map(g => <tr class={g.cpt.n && g.cpt.pct < 0.95 ? 'bad' : ''}><td>{g.name}</td><td>{g.dest === 'branch' ? 'Branch' : 'Stage out'}</td><td class="n">{nf(g.pkgs)}</td><td class="n">{pct(g.cpt.pct)}</td><td class="n">{nf(g.cpt.late + g.cpt.noCpt)}</td><td class="n">{nf(g.time.p90 / 60, 1)} h</td></tr>)}</tbody></table>
    </>),
    plan: () => page('plan', t('rep.plan'), <><PlanSnap w={w} plan={plan} /><p class="rnote">{t('rep.planNote', { km: nf(r.travel.km, 1), h: nf(r.travel.hours, 1) })}</p></>),
    returns: () => page('returns', t('rep.returns'), <div class="rtiles">
      {tile(t('res.rIn'), nf(r.returns.dv1 + r.returns.branch), t('res.rInSub', { dv1: nf(r.returns.dv1), br: nf(r.returns.branch) }))}
      {tile(t('res.rShelf'), nf(r.returns.shelfAvg), t('res.rShelfSub', { max: nf(r.returns.shelfMax) }))}
      {tile(t('res.rPicked'), nf(r.returns.picked), t('zp.expired') + ': ' + nf(r.returns.expired))}
      {tile(t('res.rRt1'), nf(r.returns.rt1), `${nf(r.returns.boxes)} ${t('rep.boxes')} · ${nf(r.returns.trips)} RT-2`)}
      {tile(t('res.rCost'), nf(cost.perReturn, 3) + ' USD')}
    </div>),
    assumptions: () => page('assumptions', t('rep.assumptions'), <ul class="rlist">
      <li>{t('rep.aVolume', { n: nf(r.totals.pkgs), trucks: nf(r.inbound.length) })}</li>
      {w.shifts.map(s => <li>{t('rep.aShift', { name: s.name, from: s.start, to: s.end, n: PROCESSES.reduce((a, p) => a + s.staff[p], 0), prod: s.productivityPct, usd: nf(s.costPerHour, 2) })}</li>)}
      <li>{t('rep.aSorting', { type: t(w.sorting.type === 'manual' ? 'cfg.stManual' : w.sorting.type === 'ptl' ? 'cfg.stPtl' : 'cfg.stSorter'), groups: w.groups.length })}</li>
      <li>{t('rep.aHospital', { e: nf(w.hospital.exceptionPct, 1), r: nf(w.hospital.relabelPct) })}</li>
      <li>{t('rep.aReturns', { p: nf(w.returns.postmanPct, 1), b: nf(w.returns.branchPct, 1), k: nf(w.returns.pickupPct), d: w.returns.holdDays })}</li>
      <li>{t('rep.aRuns', { n: w.replicas, seed: r.seed })}</li>
      <li>{t('rep.aCatalog')}</li>
    </ul>),
  };

  return (
    <div class="report-ui">
      <div class="card rep-ctl">
        <h2>{t('rep.include')}</h2>
        <div class="rchips">{SECS.map(s => <button class={'rchip' + (on[s] ? ' on' : '')} aria-pressed={on[s]} onClick={() => setOn({ ...on, [s]: !on[s] })}>{on[s] ? '✓ ' : ''}{t('rep.sec.' + s)}</button>)}</div>
        {on.scenarios && !cmp && <p class="hint">{t('rep.noCmp')}</p>}
        <label class="fld" style={{ marginTop: '14px' }}><span>{t('rep.conclusion')}</span>
          <textarea rows={8} value={text ?? auto} onInput={e => setText(e.currentTarget.value)} /></label>
        <div class="hint">{text == null ? t('rep.autoHint') : t('rep.editedHint')}</div>
        {text != null && <button class="btn sm" style={{ marginTop: '6px' }} onClick={() => setText(null)}>{t('rep.backAuto')}</button>}
        <div class="frow" style={{ marginTop: '14px' }}><button class="btn pri" disabled={!shown.length} onClick={() => window.print()}>{t('rep.print')}</button></div>
        <div class="hint">{t('rep.printHint')}</div>
      </div>
      <div class="report" aria-label={t('rep.preview')}>{shown.map(s => pages[s]())}</div>
    </div>
  );
}
