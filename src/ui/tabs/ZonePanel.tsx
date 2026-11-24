/* Panel de una zona del plano: sus parámetros (editables) y lo que pasó en ella en la semana. */
import type { ComponentChildren } from 'preact';
import { useWh } from '../store';
import { Check, Field, Num, Select, Text, Time } from '../components/inputs';
import { nf, pct, t } from '../../i18n';
import type { ProcessKey, TimeKey, Warehouse, ZoneKind } from '../../model/types';
import { SECOND_KEYS, type SimResult } from '../../engine/simulate';
import type { Section } from './ConfigTab';

/** Sección de Configuración que tiene el resto de los campos de cada zona. */
const SECTION_OF: Record<ZoneKind, Section> = {
  inbound: 'inbound', decon: 'processes', sort: 'groups', hospital: 'processes', reverify: 'groups', group: 'groups', stage: 'groups', outDoor: 'groups',
  branch: 'groups', exit: 'groups', shelf: 'returns', returns: 'returns', rt2Door: 'returns',
};

export function ZonePanel({ zone, w, r, onClose, onGoConfig }: { zone: string; w: Warehouse; r: SimResult; onClose: () => void; onGoConfig: (s: Section) => void }) {
  const { w: pw } = useWh();
  const i = zone.indexOf(':'), kind = zone.slice(0, i) as ZoneKind, ref = zone.slice(i + 1);
  const gi = pw.groups.findIndex(g => g.id === ref), g = gi >= 0 ? pw.groups[gi] : null, gs = r.groups[w.groups.findIndex(x => x.id === ref)];
  const proc = (p: ProcessKey) => r.processes.find(x => x.key === p)!;
  const kv = (l: string, v: ComponentChildren) => <div class="kv"><span>{l}</span><b>{v}</b></div>;
  const time = (k: TimeKey) => <Field label={`${t('t.' + k)} (${t(SECOND_KEYS.has(k) ? 'u.sec' : 'u.min')}, ${t('zp.typical')})`}><Num path={`times.${k}.mode`} min={0} /></Field>;
  const staff = (p: ProcessKey) => <div class="frow">{pw.shifts.map((s, si) => <Field label={t('zp.staff', { shift: s.name })}><Num path={`shifts.${si}.staff.${p}`} min={0} step={1} /></Field>)}</div>;
  const procStats = (p: ProcessKey) => { const s = proc(p); return <>{kv(t('zp.jobs'), nf(s.jobs))}{kv(t('zp.busy'), nf(s.busyMin / 60, 1) + ' h')}{kv(t('zp.wait'), nf(s.waitAvg, 1) + ' min')}{kv(t('zp.maxQ'), nf(s.maxQueuePkgs))}</>; };
  const title = t('z.' + kind) + (g ? ' · ' + g.name : '');
  const ST = pw.sorting.type, R = r.returns;

  let fields: ComponentChildren = null, stats: ComponentChildren = null;
  switch (kind) {
    case 'inbound':
      fields = <>{staff('unload')}{time('unloadBox')}{time('unloadUld')}{time('unloadLoose')}</>;
      stats = <>{kv(t('zp.trucks'), nf(r.inbound.length))}{kv(t('zp.units'), `${nf(r.totals.boxes)} · ${nf(r.totals.ulds)} · ${nf(r.totals.loose)}`)}{procStats('unload')}</>;
      break;
    case 'decon':
      fields = <>{staff('decon')}{time('openBox')}{time('emptyUld')}</>;
      stats = procStats('decon');
      break;
    case 'sort':
      fields = <>
        <Field label={t('cfg.sortType')}><Select path="sorting.type" options={[['manual', t('cfg.stManual')], ['ptl', t('cfg.stPtl')], ['sorter', t('cfg.stSorter')]]} /></Field>
        {ST === 'sorter'
          ? <div class="frow"><Field label={t('cfg.induction')}><Num path="sorting.sorter.inductionPoints" min={1} step={1} /></Field><Field label={t('cfg.chutes')}><Num path="sorting.sorter.chutes" min={1} step={1} /></Field><Field label={t('cfg.machine')}><Num path="sorting.sorter.machinePerHour" min={1} step={100} /></Field></div>
          : <Field label={t('cfg.stSort')}><Num path="capacity.stations.sort" min={1} step={1} /></Field>}
        {time(ST === 'sorter' ? 'induct' : ST === 'ptl' ? 'sortPtl' : 'sort')}
        <Field label={t(ST === 'manual' ? 'cfg.missortManual' : ST === 'ptl' ? 'cfg.missortPtl' : 'cfg.missortSorter')}><Num path={`discrepancies.missortPct.${ST}`} min={0} max={100} /></Field>
        {staff('sort')}
      </>;
      stats = <>{kv(t('zp.scans'), nf(r.events['WI-3 + WI-4']))}{procStats('sort')}</>;
      break;
    case 'hospital':
      fields = <><div class="frow"><Field label={t('cfg.exceptionPct')}><Num path="hospital.exceptionPct" min={0} max={100} /></Field><Field label={t('cfg.relabelPct')}><Num path="hospital.relabelPct" min={0} max={100} /></Field></div>{time('relabel')}{staff('hospital')}</>;
      stats = <>{kv(t('zp.hosIn'), nf(r.hospital.in))}{kv(t('zp.hosOut'), `${nf(r.hospital.relabeled)} · ${nf(r.hospital.destroyed)}`)}{procStats('hospital')}</>;
      break;
    case 'reverify':
      fields = <><Field label={t('cfg.stRv')}><Num path="capacity.stations.reverify" min={1} step={1} /></Field>{time('reverify')}{time('container')}{staff('reverify')}</>;
      stats = <>{kv('AV-1', nf(r.events['AV-1']))}{procStats('reverify')}</>;
      break;
    case 'group':
      if (!g) break;
      fields = <>
        <Field label={t('cfg.group')}><Text path={`groups.${gi}.name`} /></Field>
        <div class="frow"><Field label={t('cfg.share')}><Num path={`groups.${gi}.sharePct`} min={0} max={100} /></Field>
          <Field label={t('cfg.dest')}><Select path={`groups.${gi}.dest`} options={[['stageout', t('cfg.destStage')], ['branch', t('cfg.destBranch')]]} /></Field></div>
        <Check path={`groups.${gi}.reverify`} label={t('cfg.reverify')} />
      </>;
      if (gs) stats = <>{kv(t('zp.pkgs'), nf(gs.pkgs))}{kv(t('zp.baskets'), nf(gs.baskets))}{kv(t('k.cptPct'), pct(gs.cpt.pct))}{kv('P90', nf(gs.time.p90 / 60, 1) + ' h')}</>;
      break;
    case 'stage': case 'outDoor':
      if (!g) break;
      fields = <>
        <div class="sub">{t('cfg.outTrucks')}</div>
        <div class="frow">{g.outbound.map((_, j) => <Field label={t('zp.truck', { n: j + 1 })} w={130}><Time path={`groups.${gi}.outbound.${j}.arrival`} /></Field>)}</div>
        <div class="frow"><Field label={t('cfg.loadWindow')}><Num path="outboundLoadWindowMin" min={0} /></Field><Field label={t('cfg.slots')}><Num path="capacity.stageOutSlots" min={1} step={1} /></Field></div>
        {staff('load')}
      </>;
      if (gs) stats = <>{kv(t('k.cptPct'), pct(gs.cpt.pct))}{kv(t('zp.late'), nf(gs.cpt.late + gs.cpt.noCpt))}{kv(t('zp.delayP90'), Number.isFinite(gs.cpt.delayP90) ? nf(gs.cpt.delayP90 / 60, 1) + ' h' : '—')}{kv(t('zp.stageMax'), nf(gs.stageMax))}</>;
      break;
    case 'branch':
      fields = <><div class="frow"><Field label={t('cfg.stBr')}><Num path="capacity.stations.branch" min={1} step={1} /></Field><Field label={t('cfg.routeCount')}><Num path="routes.count" min={1} max={60} step={1} /></Field></div>{time('branchSort')}{time('custAttend')}{staff('branch')}</>;
      stats = <>{kv('LM-1', nf(r.events['LM-1']))}{kv(t('res.rPicked'), nf(R.picked))}{procStats('branch')}</>;
      break;
    case 'exit':
      fields = <>{time('handover')}{time('dv1')}<div class="hint">{pw.routes.windows.map(v => `${v.name} ${v.first}`).join(' · ')}</div></>;
      stats = <>{kv('LM-12', nf(r.events['LM-12']))}{kv('DV-1', nf(r.events['DV-1']))}</>;
      break;
    case 'shelf':
      fields = <div class="frow"><Field label={t('cfg.retPickup')}><Num path="returns.pickupPct" min={0} max={99} step={5} /></Field><Field label={t('cfg.retHold')}><Num path="returns.holdDays" min={1} step={1} /></Field><Field label={t('cfg.retShelf')}><Num path="returns.shelfCapacity" min={0} step={10} /></Field></div>;
      stats = <>{kv(t('res.rShelf'), nf(R.shelfAvg))}{kv(t('zp.shelfMax'), nf(R.shelfMax))}{kv(t('res.rPicked'), nf(R.picked))}{kv(t('zp.expired'), nf(R.expired))}{kv(t('zp.stay'), nf(R.stayDays, 1) + ' d')}</>;
      break;
    case 'returns':
      fields = <><div class="frow"><Field label={t('cfg.retDestroy')}><Num path="returns.destroyPct" min={0} max={100} step={5} /></Field><Field label={t('cfg.retBox')}><Num path="returns.pkgsPerBox" min={1} step={1} /></Field></div>{time('rt1')}{time('rt2Load')}</>;
      stats = <>{kv(t('res.rRt1'), nf(R.rt1))}{kv(t('zp.destroyBack'), `${nf(R.destroy)} · ${nf(R.back)}`)}{kv(t('zp.boxesTrips'), `${nf(R.boxes)} · ${nf(R.trips)}`)}{procStats('returns')}</>;
      break;
    case 'rt2Door':
      fields = <div class="frow"><Field label={t('cfg.retDay')}><Select path="returns.rt2.day" options={[0, 1, 2, 3, 4, 5, 6].map(d => [String(d), t('d' + d)])} /></Field><Field label={t('cfg.retTime')} w={120}><Time path="returns.rt2.time" /></Field><Field label={t('cfg.retMaxBoxes')}><Num path="returns.rt2.maxBoxes" min={1} step={1} /></Field></div>;
      stats = <>{kv(t('res.rRt2'), nf(R.trips))}{kv(t('zp.nextRt2'), `${t('d' + pw.returns.rt2.day)} ${pw.returns.rt2.time}`)}</>;
      break;
  }

  return (
    <div class="card zpanel">
      <div class="zhead"><h2>{title}</h2><button class="btn sm" onClick={onClose} aria-label={t('zp.close')}>×</button></div>
      <div class="sub">{t('zp.sub')}</div>
      {fields}
      {stats && <><h3 style={{ marginTop: '12px' }}>{t('zp.week')}</h3><div class="zstats">{stats}</div></>}
      <button class="btn sm" style={{ marginTop: '12px' }} onClick={() => onGoConfig(SECTION_OF[kind])}>{t('zp.more', { sec: t('sec.' + SECTION_OF[kind]) })}</button>
    </div>
  );
}
