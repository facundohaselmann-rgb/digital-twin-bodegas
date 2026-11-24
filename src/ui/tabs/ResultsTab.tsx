import type { CptStat, SimResult } from '../../engine/simulate';
import { COST_CATEGORIES, PROCESSES, type Warehouse } from '../../model/types';
import { computeCost } from '../../engine/kpis';
import { CompareTable, KpiTable, fmtKpi, type Comparison, type KpiSummaries } from './ScenariosTab';
import { fmtDur, fmtHM } from '../../model/time';
import { dayName, getLang, nf, pct, t } from '../../i18n';
import { LineChart } from '../components/LineChart';
import { download } from '../../storage/project';

const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)'];
const dt = (x: number | null) => (x == null ? '—' : `${dayName(Math.floor(x / 1440))} ${fmtHM(x)}`);
const hrs = (m: number) => nf(m / 60, 1);
const hours = (x: number) => (isFinite(x) ? `${nf(x / 60, 1)} h` : '—');

function UBar({ u }: { u: number }) {
  return <div class="ubar"><div class="t"><i class={u > 0.85 ? 'hi' : ''} style={{ width: `${Math.min(100, u * 100)}%` }} /></div><span>{pct(u)}</span></div>;
}
const CptCells = ({ c }: { c: CptStat }) => (
  <><td class="n">{nf(c.n)}</td><td class="n"><b>{pct(c.pct)}</b></td><td class={'n ' + (c.late ? 'ko' : '')}>{nf(c.late)}</td><td class="n">{c.noCpt ? nf(c.noCpt) : '—'}</td><td class="n">{fmtDur(c.delayMean)}</td><td class="n">{fmtDur(c.delayP90)}</td></>
);

export function ResultsTab({ w, r, rep, cmp }: { w: Warehouse; r: SimResult; rep: { s: KpiSummaries | null; progress: number | null }; cmp: Comparison | null }) {
  const cost = computeCost(r, w);
  const usd = (v: number) => nf(v, 0);
  const T = r.time;
  const paid = r.shifts.reduce((a, s) => a + s.paidMin, 0), busy = r.shifts.reduce((a, s) => a + s.busyMin, 0);
  const ot = r.shifts.reduce((a, s) => a + s.otMin, 0);
  const changes = r.shifts.reduce((a, s) => a + s.changes, 0), changeMin = r.shifts.reduce((a, s) => a + s.changeMin, 0);
  const dispatchedWeek = r.days.reduce((a, d) => a + d.rc0, 0);
  const totalScans = r.groups.reduce((a, g) => a + g.scans, 0);
  return (
    <div>
      <div class="cfgbar">
        <button class="btn" onClick={() => exportCSV(w, r)}>{t('res.export')}</button>
        <button class="btn" onClick={() => window.print()}>{t('res.pdf')}</button>
        <span class="note">{t('res.note', { seed: r.seed, pkgs: nf(r.totals.pkgs), kg: nf(r.totals.kg), m3: nf(r.totals.m3, 1) })}</span>
      </div>
      <h1 class="print-only">{w.name} — {t('tab.results')}</h1>
      <div class="cards">
        <div class="stat"><div class="l">{t('res.kpiCost')}</div><div class="v">{nf(cost.perPkg, 3)} <small>USD</small></div><div class="d">{rep.s ? `± ${fmtKpi('costPerPkg', rep.s.costPerPkg.ci)} · ` : ''}{t('res.kpiCostSub', { total: usd(cost.total), inbound: nf(r.totals.inbound) })}</div></div>
        <div class="stat"><div class="l">{t('res.kpiPkgs')}</div><div class="v">{nf(r.totals.pkgs)}</div><div class="d">{t('res.kpiPkgsSub', { boxes: nf(r.totals.boxes), ulds: nf(r.totals.ulds), loose: nf(r.totals.loose) })}</div></div>
        <div class="stat"><div class="l">{t('res.kpiDispatched')}</div><div class="v">{nf(dispatchedWeek)}</div><div class="d">{t('res.kpiCarried', { n: nf(r.totals.pkgs - dispatchedWeek - r.hospital.destroyed) })}</div></div>
        <div class="stat"><div class="l">{t('res.kpiCpt')}</div><div class={'v ' + (r.cpt.pct < 0.95 ? 'ko' : '')}>{pct(r.cpt.pct)}</div><div class="d">{t('res.kpiCptSub', { late: nf(r.cpt.late + r.cpt.noCpt), delay: fmtDur(r.cpt.delayMean) })}</div></div>
        <div class="stat wide2"><div class="l">{t('res.kpiTime')}</div>
          <div class="quad"><div><small>{t('res.mean')}</small><b>{hours(T.mean)}</b></div><div><small>P90</small><b>{hours(T.p90)}</b></div><div><small>P95</small><b>{hours(T.p95)}</b></div><div><small>P98</small><b>{hours(T.p98)}</b></div></div></div>
        <div class="stat"><div class="l">{t('res.kpiHours')}</div><div class="v">{hrs(busy)} h</div><div class="d">{t('res.kpiHoursSub', { paid: hrs(paid), util: pct(paid ? busy / paid : 0) })}</div></div>
        <div class="stat"><div class="l">{t('res.kpiOT')}</div><div class="v">{hrs(ot)} h</div><div class="d">×{nf(w.costs.overtimeMultiplier, 1)}</div></div>
        <div class="stat"><div class="l">{t('res.kpiChanges')}</div><div class="v">{nf(changes)}</div><div class="d">{t('res.kpiChangesSub', { h: hrs(changeMin) })}</div></div>
        <div class="stat"><div class="l">{t('res.kpiHospital')}</div><div class="v">{nf(r.hospital.in)}</div><div class="d">{t('res.kpiHospitalSub', { r: nf(r.hospital.relabeled), d: nf(r.hospital.destroyed) })}</div></div>
        <div class="stat"><div class="l">{t('res.kpiScans')}</div><div class="v">{nf(r.totals.pkgs ? totalScans / r.totals.pkgs : 0, 2)}</div></div>
      </div>

      <div class="grid2">
        <div class="card"><h2>{t('res.replicas')}</h2><div class="sub">{t('res.replicasSub', { n: w.replicas })}</div>
          {rep.s ? <KpiTable s={rep.s} /> : <div class="hint">{t('res.replicasRunning', { p: pct(rep.progress ?? 0) })}</div>}</div>
        <div class="card"><h2>{t('res.cost')}</h2><div class="sub">{t('res.costSub')}</div>
          <div class="tblwrap"><table>
            <thead><tr><th></th><th class="n">{t('res.usd')}</th><th class="n">{t('res.perPkg')}</th><th class="n">{t('res.share')}</th></tr></thead>
            <tbody>
              {([['res.cLabor', cost.labor], ['res.cOT', cost.overtime], ['res.cSupplies', cost.supplies]] as const).map(([l, v]) => <tr><td>{t(l)}</td><td class="n">{usd(v)}</td><td class="n">{nf(v / r.totals.inbound, 3)}</td><td class="n">{pct(v / cost.total)}</td></tr>)}
              <tr><td class="hint">↳ {t('res.cIdle')}</td><td class="n hint">{usd(cost.idle)}</td><td class="n hint">{nf(cost.idle / r.totals.inbound, 3)}</td><td class="n hint">{pct(cost.idle / cost.total)}</td></tr>
              <tr><td><b>{t('res.cFixed')}</b></td><td class="n"><b>{usd(cost.fixedTotal)}</b></td><td class="n">{nf(cost.fixedTotal / r.totals.inbound, 3)}</td><td class="n">{pct(cost.fixedTotal / cost.total)}</td></tr>
              {COST_CATEGORIES.filter(c => cost.fixed[c] > 0).map(c => <tr><td class="hint">↳ {t('cc.' + c)}</td><td class="n">{usd(cost.fixed[c])}</td><td class="n">{nf(cost.fixed[c] / r.totals.inbound, 3)}</td><td class="n">{pct(cost.fixed[c] / cost.total)}</td></tr>)}
              <tr><td><b>{t('total')}</b></td><td class="n"><b>{usd(cost.total)}</b></td><td class="n"><b>{nf(cost.perPkg, 3)}</b></td><td class="n">100%</td></tr>
            </tbody>
          </table></div>
          <h3 style={{ marginTop: '12px' }}>{t('res.cByProcess')}</h3>
          <div class="tblwrap"><table><tbody>{PROCESSES.filter(p => cost.byProcess[p] > 0).map(p => <tr><td>{t('p.' + p)}</td><td class="n">{usd(cost.byProcess[p])}</td><td class="n">{nf(cost.byProcess[p] / r.totals.inbound, 3)}</td></tr>)}</tbody></table></div>
        </div>
      </div>

      <div class="card mb"><h2>{t('res.disc')}</h2>
        <div class="cards" style={{ marginBottom: 0 }}>
          <div class="stat"><div class="l">{t('res.dCustoms')}</div><div class="v">{nf(r.discrepancies.customs)}</div></div>
          <div class="stat"><div class="l">{t('res.dMissort')}</div><div class="v">{nf(r.discrepancies.missortFixed)}</div>{r.discrepancies.missortUndetected > 0 && <div class="d ko">{nf(r.discrepancies.missortUndetected)} {t('res.dUndetected').toLowerCase()}</div>}</div>
          <div class="stat"><div class="l">{t('res.dPostman')}</div><div class="v">{nf(r.discrepancies.postman)}</div><div class="d">{nf(r.discrepancies.postmanFound)} {t('res.dFound')}</div></div>
          <div class="stat"><div class="l">{t('res.dLosses')}</div><div class={'v ' + (r.discrepancies.losses ? 'ko' : '')}>{nf(r.discrepancies.losses)}</div></div>
        </div>
      </div>

      {cmp && <div class="card mb"><h2>{t('res.cmp')}</h2><div class="sub">{t('res.cmpSub', { n: cmp.n })}</div><CompareTable cmp={cmp} /></div>}

      <div class="card mb"><h2>{t('res.cpt')}</h2><div class="sub">{t('res.cptSub', { lead: fmtDur(w.cptLeadMin) })}</div>
        <div class="tblwrap"><table>
          <thead><tr><th>{t('res.group')}</th><th class="n">{t('res.pkgs')}</th><th class="n">{t('res.onTime')}</th><th class="n">{t('res.lateN')}</th><th class="n">{t('res.noCpt')}</th><th class="n">{t('res.delayMean')}</th><th class="n">{t('res.delayP90')}</th></tr></thead>
          <tbody>
            {r.groups.map(g => <tr><td>{g.name} <span class="hint">({g.dest === 'branch' ? 'Branch' : 'Stage out'})</span></td><CptCells c={g.cpt} /></tr>)}
            <tr><td><b>{t('total')}</b></td><CptCells c={r.cpt} /></tr>
          </tbody>
        </table></div>
      </div>

      <div class="grid2">
        <div class="card"><h2>{t('res.chBusy')}</h2><div class="sub">{t('res.chBusySub')}</div>
          <LineChart step label={t('res.chBusy')} series={PROCESSES.map((p, i) => ({ name: t('p.' + p), color: SERIES[i], pts: r.samples.map(s => [s.t, s.busy[p]] as [number, number]) }))} /></div>
        <div class="card"><h2>{t('res.chWip')}</h2><div class="sub">{t('res.chWipSub')}</div>
          <LineChart label={t('res.chWip')} series={([['unload', 'res.wUnload'], ['sort', 'res.wSort'], ['baskets', 'res.wBaskets'], ['stage', 'res.wStage'], ['routes', 'res.wRoutes']] as const).map(([k, n], i) => ({ name: t(n), color: SERIES[i], pts: r.samples.map(s => [s.t, k === 'unload' ? s.wip.unload + s.wip.decon : s.wip[k]] as [number, number]) }))} /></div>
      </div>
      <div class="grid2">
        <div class="card"><h2>{t('res.chThr')}</h2><div class="sub">{t('res.chThrSub')}</div>
          <LineChart label={t('res.chThr')} series={[
            { name: t('res.sortedH'), color: SERIES[0], pts: r.hourly.sorted.map((v, h) => [h * 60 + 30, v] as [number, number]) },
            { name: t('res.rc0H'), color: SERIES[1], pts: r.hourly.sorted.map((_, h) => [h * 60 + 30, r.hourly.rc0[h] ?? 0] as [number, number]) }]} /></div>
        <div class="card"><h2>{t('res.days')}</h2><div class="sub">{t('res.daysSub')}</div>
          <div class="tblwrap"><table>
            <thead><tr><th>{t('res.day')}</th><th class="n">{t('res.arrived')}</th><th class="n">{t('res.rc0')}</th><th class="n">{t('res.finished')}</th><th class="n">{t('res.paidH')}</th><th class="n">{t('res.busyH')}</th><th class="n">{t('res.otH')}</th><th class="n">{t('res.lastAct')}</th></tr></thead>
            <tbody>{r.days.map(d => <tr><td>{t('d' + d.day)}</td><td class="n">{nf(d.arrived)}</td><td class="n">{nf(d.rc0)}</td><td class="n">{nf(d.finished)}</td><td class="n">{hrs(d.paidMin)}</td><td class="n">{hrs(d.busyMin)}</td><td class="n">{d.otMin ? hrs(d.otMin) : '—'}</td><td class="n">{d.lastActivity == null ? '—' : dt(d.lastActivity)}</td></tr>)}</tbody>
          </table></div></div>
      </div>

      <div class="card mb"><h2>{t('res.shifts')}</h2><div class="sub">{t('res.shiftsSub')}</div>
        <div class="tblwrap"><table>
          <thead><tr><th>{t('res.shift')}</th><th class="n">{t('res.workers')}</th><th class="n">{t('res.paidH')}</th><th class="n">{t('res.busyH')}</th><th>{t('res.util')}</th><th class="n">{t('res.otH')}</th><th class="n">{t('res.changes')}</th><th class="n">{t('res.changeH')}</th></tr></thead>
          <tbody>{r.shifts.map(s => <tr><td>{s.name}{s.night ? ' 🌙' : ''}</td><td class="n">{s.workers}</td><td class="n">{hrs(s.paidMin)}</td><td class="n">{hrs(s.busyMin)}</td><td><UBar u={s.util} /></td><td class="n">{s.otMin ? hrs(s.otMin) : '—'}</td><td class="n">{nf(s.changes)}</td><td class="n">{hrs(s.changeMin)}</td></tr>)}</tbody>
        </table></div>
        <h3 style={{ marginTop: '14px' }}>{t('res.processes')}</h3>
        <div class="sub">{t('res.processesSub')}</div>
        <div class="tblwrap"><table>
          <thead><tr><th>{t('res.process')}</th><th class="n">{t('res.jobs')}</th><th class="n">{t('res.busyH')}</th><th class="n">{t('res.wait')}</th><th class="n">{t('res.maxQ')}</th></tr></thead>
          <tbody>{r.processes.map(p => <tr><td>{t('p.' + p.key)}</td><td class="n">{nf(p.jobs)}</td><td class="n">{hrs(p.busyMin)}</td><td class="n">{fmtDur(p.waitAvg)}</td><td class="n">{nf(p.maxQueuePkgs)}</td></tr>)}</tbody>
        </table></div>
      </div>

      {r.sorter && (
        <div class="card mb"><h2>{t('res.sorter')}</h2>
          <div class="cards" style={{ marginBottom: 0 }}>
            <div class="stat"><div class="l">{t('res.inducted')}</div><div class="v">{nf(r.sorter.inducted)}</div></div>
            <div class="stat"><div class="l">{t('res.peak')}</div><div class="v">{nf(r.sorter.peakPerHour)}</div><div class="d">{pct(r.sorter.peakPerHour / w.sorting.sorter.machinePerHour)} · {nf(w.sorting.sorter.machinePerHour)} paq/h</div></div>
            <div class="stat"><div class="l">{t('res.nonConv')}</div><div class="v">{nf(r.sorter.nonConveyable)}</div></div>
            <div class="stat"><div class="l">{t('res.sharedChute')}</div><div class="v">{nf(r.sorter.sharedChute)}</div></div>
            <div class="stat"><div class="l">{t('res.noRead')}</div><div class="v">{nf(r.sorter.noRead)}</div></div>
          </div>
        </div>
      )}

      <div class="card mb"><h2>{t('res.backlog')}</h2><div class="sub">{t('res.backlogSub')}</div>
        <div class="tblwrap"><table>
          <thead><tr><th>{t('res.shift')}</th><th>{t('res.close')}</th><th class="n">{t('res.wUnload')}</th><th class="n">{t('res.wDecon')}</th><th class="n">{t('res.wSort')}</th><th class="n">{t('res.wHospital')}</th><th class="n">{t('res.wBaskets')}</th><th class="n">{t('res.wRv')}</th><th class="n">{t('res.wBr')}</th><th class="n">{t('res.wStage')}</th><th class="n">{t('total')}</th></tr></thead>
          <tbody>{r.backlog.filter(b => b.day < 7).map(b => <tr><td>{b.shift}</td><td>{dt(b.time)}</td><td class="n">{nf(b.wip.unload)}</td><td class="n">{nf(b.wip.decon)}</td><td class="n">{nf(b.wip.sort)}</td><td class="n">{nf(b.wip.hospital)}</td><td class="n">{nf(b.wip.baskets)}</td><td class="n">{nf(b.wip.reverify)}</td><td class="n">{nf(b.wip.branch)}</td><td class="n">{nf(b.wip.stage)}</td><td class="n"><b>{nf(b.total)}</b></td></tr>)}</tbody>
        </table></div>
      </div>

      <div class="grid2">
        <div class="card"><h2>{t('res.inbound')}</h2>
          <div class="tblwrap"><table>
            <thead><tr><th>{t('res.truck')}</th><th>{t('res.arrival')}</th><th class="n">{t('res.pkgs')}</th><th class="n">{t('plan.boxes')}</th><th class="n">{t('plan.ulds')}</th><th class="n">{t('plan.loose')}</th><th>{t('res.unloadEnd')}</th><th>{t('res.sortEnd')}</th></tr></thead>
            <tbody>{r.inbound.map(i => <tr><td>{i.name}</td><td>{dt(i.arrival)}</td><td class="n">{nf(i.pkgs)}</td><td class="n">{i.boxes}</td><td class="n">{i.ulds}</td><td class="n">{nf(i.loose)}</td><td>{dt(i.unloadEnd)}</td><td>{dt(i.sortEnd)}</td></tr>)}</tbody>
          </table></div></div>
        <div class="card"><h2>{t('res.outbound')}</h2><div class="sub">{t('res.outboundSub')}</div>
          <div class="tblwrap"><table>
            <thead><tr><th>{t('res.group')}</th><th>{t('res.arrival')}</th><th>{t('res.departure')}</th><th class="n">{t('res.units')}</th><th class="n">{t('res.pkgs')}</th><th class="n">{t('res.m3')}</th><th class="n">{t('res.kg')}</th><th class="n">{t('res.left')}</th><th class="n">{t('res.late')}</th></tr></thead>
            <tbody>{r.outbound.map(o => <tr><td>{o.group}</td><td>{dt(o.arrival)}</td><td>{dt(o.departure)}</td><td class="n">{o.units}</td><td class="n">{nf(o.pkgs)}</td><td class="n">{nf(o.m3, 1)} ({pct(o.m3 / w.capacity.truckM3)})</td><td class="n">{nf(o.kg)} ({pct(o.kg / w.capacity.truckKg)})</td><td class={'n ' + (o.leftPkgs ? 'ko' : '')}>{o.leftPkgs ? nf(o.leftPkgs) : '—'}</td><td class={'n ' + (o.late > 0.5 ? 'ko' : '')}>{o.late > 0.5 ? fmtDur(o.late) : '—'}</td></tr>)}</tbody>
          </table></div></div>
      </div>

      <div class="grid2">
        <div class="card"><h2>{t('res.groups')}</h2>
          <div class="tblwrap"><table>
            <thead><tr><th>{t('res.group')}</th><th>{t('res.flow')}</th><th class="n">{t('res.pkgs')}</th><th class="n">{t('res.baskets')}</th><th class="n">{t('res.containers')}</th><th class="n">{t('res.spp')}</th><th class="n">{t('res.mean')}</th><th class="n">P90</th><th class="n">P95</th><th class="n">P98</th></tr></thead>
            <tbody>{r.groups.map(g => <tr><td>{g.name}</td><td>{g.reverify ? t('res.reverifyFlow') : t('res.directFlow')} → {g.dest === 'branch' ? 'Branch' : 'Stage out'}</td><td class="n">{nf(g.pkgs)}</td><td class="n">{nf(g.baskets)}</td><td class="n">{g.containers || '—'}</td><td class="n">{nf(g.spp, 1)}</td><td class="n">{hours(g.time.mean)}</td><td class="n">{hours(g.time.p90)}</td><td class="n">{hours(g.time.p95)}</td><td class="n">{hours(g.time.p98)}</td></tr>)}</tbody>
          </table></div></div>
        <div class="card"><h2>{t('res.events')}</h2>
          <div class="tblwrap"><table>
            <thead><tr><th>{t('res.event')}</th><th class="n">{t('res.count')}</th></tr></thead>
            <tbody>{Object.entries(r.events).map(([k, v]) => <tr><td>{k}</td><td class="n">{nf(v)}</td></tr>)}</tbody>
          </table></div></div>
      </div>
    </div>
  );
}

function exportCSV(w: Warehouse, r: SimResult): void {
  // los números se escriben con el separador decimal del idioma para que Excel los lea bien (p. ej. 18,5 en español)
  const q = (v: unknown) => `"${String(typeof v === 'number' ? (isFinite(v) ? v.toLocaleString(getLang(), { useGrouping: false, maximumFractionDigits: 2 }) : '') : v ?? '').replace(/"/g, '""')}"`;
  const rows: string[] = [];
  const line = (...a: unknown[]) => rows.push(a.map(q).join(';'));
  const h = (m: number) => m / 60;
  line(t('cfg.name'), w.name); line(t('cfg.seed'), r.seed); rows.push('');
  line(t('res.kpiTime'), t('res.mean') + ' (h)', 'P90 (h)', 'P95 (h)', 'P98 (h)');
  line('', h(r.time.mean), h(r.time.p90), h(r.time.p95), h(r.time.p98));
  rows.push('');
  line(t('res.cpt'), t('res.pkgs'), t('res.onTime') + ' %', t('res.lateN'), t('res.noCpt'), t('res.delayMean') + ' (min)', t('res.delayP90') + ' (min)');
  [...r.groups.map(g => [g.name, g.cpt] as const), [t('total'), r.cpt] as const].forEach(([n, c]) => line(n, c.n, c.pct * 100, c.late, c.noCpt, c.delayMean, c.delayP90));
  rows.push('');
  line(t('res.day'), t('res.arrived'), t('res.rc0'), t('res.finished'), t('res.paidH'), t('res.busyH'), t('res.otH'));
  r.days.forEach(d => line(t('d' + d.day), d.arrived, d.rc0, d.finished, h(d.paidMin), h(d.busyMin), h(d.otMin)));
  rows.push('');
  line(t('res.shift'), t('res.workers'), t('res.paidH'), t('res.busyH'), t('res.util') + ' %', t('res.otH'), t('res.changes'), t('res.changeH'));
  r.shifts.forEach(s => line(s.name, s.workers, h(s.paidMin), h(s.busyMin), s.util * 100, h(s.otMin), s.changes, h(s.changeMin)));
  rows.push('');
  line(t('res.process'), t('res.jobs'), t('res.busyH'), t('res.wait') + ' (min)', t('res.maxQ'));
  r.processes.forEach(p => line(t('p.' + p.key), p.jobs, h(p.busyMin), p.waitAvg, p.maxQueuePkgs));
  rows.push('');
  line(t('res.kpiHospital'), r.hospital.in, r.hospital.relabeled, r.hospital.destroyed);
  rows.push('');
  line(t('res.group'), t('res.arrival'), t('res.departure'), t('res.units'), t('res.pkgs'), 'm3', 'kg', t('res.left'), t('res.late') + ' (min)');
  r.outbound.forEach(o => line(o.group, dt(o.arrival), dt(o.departure), o.units, o.pkgs, o.m3, o.kg, o.leftPkgs, o.late));
  rows.push('');
  line(t('res.group'), t('res.pkgs'), t('res.baskets'), t('res.containers'), t('res.spp'), t('res.mean') + ' (h)', 'P90 (h)', 'P95 (h)', 'P98 (h)');
  r.groups.forEach(g => line(g.name, g.pkgs, g.baskets, g.containers, g.spp, h(g.time.mean), h(g.time.p90), h(g.time.p95), h(g.time.p98)));
  rows.push('');
  line(t('res.chWip'), ...PROCESSES.map(p => t('p.' + p)), t('res.wUnload'), t('res.wSort'), t('res.wHospital'), t('res.wBaskets'), t('res.wRv'), t('res.wBr'), t('res.wStage'), t('res.wRoutes'));
  r.samples.forEach(s => line(dt(s.t), ...PROCESSES.map(p => s.busy[p]), s.wip.unload + s.wip.decon, s.wip.sort, s.wip.hospital, s.wip.baskets, s.wip.reverify, s.wip.branch, s.wip.stage, s.wip.routes));
  download(`${w.name.replace(/[\\/:*?"<>|]+/g, '_')}_resultados.csv`, '﻿' + rows.join('\n'), 'text/csv');
}
