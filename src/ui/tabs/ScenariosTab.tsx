import { KPI_KEYS, type KpiKey, type Summary } from '../../engine/kpis';
import { PROCESSES, type Project } from '../../model/types';
import { nf, pct, t } from '../../i18n';

export type KpiSummaries = Record<KpiKey, Summary>;
export interface Comparison { names: string[]; s: KpiSummaries[]; at: string; n: number }

/** Formato de cada KPI (y de su margen o diferencia). */
export function fmtKpi(k: KpiKey, v: number, signed = false): string {
  if (!Number.isFinite(v)) return '—';
  const sg = signed && v > 0 ? '+' : '';
  if (k === 'cptPct' || k === 'util') return sg + nf(v * 100, 1) + (signed ? ' pp' : ' %');
  if (k === 'costPerPkg') return sg + nf(v, 3);
  if (k.startsWith('time')) return sg + nf(v / 60, 1) + ' h';
  if (k === 'busyH' || k === 'otH') return sg + nf(v, 1) + ' h';
  if (k === 'travelKm') return sg + nf(v, 1) + ' km';
  return sg + nf(v);
}

const fmtCi = (k: KpiKey, v: number): string => (Number.isFinite(v) ? '± ' + (k === 'cptPct' || k === 'util' ? nf(v * 100, 1) + ' pp' : fmtKpi(k, v)) : '—');

export function KpiTable({ s }: { s: KpiSummaries }) {
  return (
    <div class="tblwrap"><table>
      <thead><tr><th>{t('res.kpi')}</th><th class="n">{t('res.mean')}</th><th class="n">{t('res.ci')}</th><th class="n">{t('res.min')}</th><th class="n">{t('res.max')}</th></tr></thead>
      <tbody>{KPI_KEYS.map(k => <tr><td>{t('k.' + k)}</td><td class="n"><b>{fmtKpi(k, s[k].mean)}</b></td><td class="n">{fmtCi(k, s[k].ci)}</td><td class="n">{fmtKpi(k, s[k].min)}</td><td class="n">{fmtKpi(k, s[k].max)}</td></tr>)}</tbody>
    </table></div>
  );
}

export function CompareTable({ cmp }: { cmp: Comparison }) {
  const base = cmp.s[0];
  return (
    <div class="tblwrap"><table>
      <thead><tr><th>{t('res.kpi')}</th>{cmp.names.map((n, i) => <th class="n">{n}{i > 0 ? <span class="hint"> (Δ)</span> : ''}</th>)}</tr></thead>
      <tbody>{KPI_KEYS.map(k => (
        <tr><td>{t('k.' + k)}</td>{cmp.s.map((s, i) => (
          <td class="n"><b>{fmtKpi(k, s[k].mean)}</b>{Number.isFinite(s[k].ci) && <span class="hint"> {fmtCi(k, s[k].ci)}</span>}
            {i > 0 && <div class="hint">{fmtKpi(k, s[k].mean - base[k].mean, true)}</div>}</td>
        ))}</tr>
      ))}</tbody>
    </table></div>
  );
}

interface Props {
  project: Project;
  onActivate: (id: string) => void; onDuplicate: () => void; onRename: (id: string, name: string) => void; onDelete: (id: string) => void;
  onCompare: () => void; cmp: Comparison | null; progress: number | null; stale: boolean;
}

export function ScenariosTab({ project, onActivate, onDuplicate, onRename, onDelete, onCompare, cmp, progress, stale }: Props) {
  const label = { manual: t('cfg.stManual'), ptl: t('cfg.stPtl'), sorter: t('cfg.stSorter') };
  return (
    <div>
      <div class="card mb">
        <h2>{t('sc.title')}</h2>
        <div class="sub">{t('sc.sub')}</div>
        <div class="tblwrap"><table>
          <thead><tr><th>{t('sc.name')}</th><th></th><th></th><th></th></tr></thead>
          <tbody>{project.scenarios.map(s => {
            const w = s.warehouse, active = s.id === project.activeScenario;
            const pkgs = w.inbound.reduce((a, i) => a + i.packages * i.days.filter(Boolean).length, 0) * w.volumePct / 100;
            const people = Math.max(0, ...w.shifts.map(x => PROCESSES.reduce((a, p) => a + x.staff[p], 0)));
            return (
              <tr key={s.id} class={active ? 'active' : ''}>
                <td><input type="text" value={s.name} aria-label={t('sc.name')} onChange={e => onRename(s.id, e.currentTarget.value)} /></td>
                <td class="hint">{t('sc.summary', { pkgs: nf(pkgs), sorting: label[w.sorting.type], people })}</td>
                <td>{active ? <span class="badge ok">✓ {t('sc.active')}</span> : <button class="btn sm" onClick={() => onActivate(s.id)}>{t('sc.edit')}</button>}</td>
                <td>{project.scenarios.length > 1 && <button class="x" title={t('remove')} onClick={() => { if (confirm(t('cfg.confirmDel', { name: s.name }))) onDelete(s.id); }}>×</button>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <div class="frow" style={{ marginTop: '10px' }}>
          <button class="btn" onClick={onDuplicate}>{t('sc.duplicate')}</button>
          <button class="btn pri" disabled={progress != null} onClick={onCompare}>{progress != null ? t('sc.comparing', { p: pct(progress) }) : t('sc.compare')}</button>
        </div>
      </div>
      {cmp && (
        <div class="card">
          <h2>{t('res.cmp')}</h2>
          <div class="sub">{t('res.cmpSub', { n: cmp.n })}</div>
          {stale && <div class="warn" style={{ marginBottom: '8px' }}>⚠ {t('res.cmpStale')}</div>}
          <CompareTable cmp={cmp} />
        </div>
      )}
    </div>
  );
}
