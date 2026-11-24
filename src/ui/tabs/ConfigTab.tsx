import { useState } from 'preact/hooks';
import { useWh } from '../store';
import { Check, DaysToggle, Field, Num, Select, Text, Time } from '../components/inputs';
import { nf, t } from '../../i18n';
import { PROCESSES, TIME_KEYS, type Days, type TimeKey, type Warehouse } from '../../model/types';
import { MON_SAT, uid } from '../../model/defaults';
import { SECOND_KEYS } from '../../engine/simulate';
import { DAY, fmtHM, hm } from '../../model/time';

const PER: Record<TimeKey, string> = {
  unloadBox: 'per.box', unloadUld: 'per.uld', unloadLoose: 'per.pkg', openBox: 'per.box', emptyUld: 'per.uld', sort: 'per.pkg',
  sortPtl: 'per.pkg', induct: 'per.pkg', relabel: 'per.pkg', swap: 'per.basket', reverify: 'per.pkg', container: 'per.container', branchSort: 'per.pkg', load: 'per.unit', handover: 'per.route',
};

export function ConfigTab() {
  return (
    <div class="cfg">
      <GeneralCard />
      <ProfileCard />
      <ProcessesCard />
      <InboundCard />
      <ShiftsCard />
      <GroupsCard />
      <RoutesCard />
      <CapacityCard />
      <TimesCard />
    </div>
  );
}

function GeneralCard() {
  const { update } = useWh();
  return (
    <div class="card">
      <h2>{t('cfg.general')}</h2>
      <div class="frow">
        <Field label={t('cfg.name')}><Text path="name" /></Field>
        <Field label={t('cfg.country')}><Text path="country" /></Field>
      </div>
      <div class="frow">
        <Field label={t('cfg.notes')}><Text path="notes" /></Field>
      </div>
      <div class="frow">
        <Field label={t('cfg.volumePct')} hint={t('cfg.volumeHint')}><Num path="volumePct" min={1} step={5} /></Field>
        <Field label={t('cfg.seed')} w={160}><Num path="seed" min={1} step={1} /></Field>
        <div class="fend"><button class="btn sm" onClick={() => update(w => (w.seed = 1 + Math.floor(Math.random() * 99999)))}>{t('cfg.newSeed')}</button></div>
      </div>
    </div>
  );
}

function ProfileFields({ base }: { base: string }) {
  return (
    <div class="frow">
      <Field label={t('cfg.weight')}><Num path={`${base}.weightKg`} min={0.01} /></Field>
      <Field label={t('cfg.length')}><Num path={`${base}.lengthCm`} min={1} /></Field>
      <Field label={t('cfg.width')}><Num path={`${base}.widthCm`} min={1} /></Field>
      <Field label={t('cfg.height')}><Num path={`${base}.heightCm`} min={1} /></Field>
      <Field label={t('cfg.variation')}><Num path={`${base}.variationPct`} min={0} max={90} /></Field>
    </div>
  );
}

function ProfileCard() {
  const { w } = useWh();
  const p = w.packageProfile;
  return (
    <div class="card">
      <h2>{t('cfg.profile')}</h2>
      <div class="sub">{t('cfg.profileSub')}</div>
      <ProfileFields base="packageProfile" />
      <div class="hint">{t('cfg.volumeL', { l: nf(p.lengthCm * p.widthCm * p.heightCm / 1000, 1) })}</div>
    </div>
  );
}

/* ------------------------- llegadas ------------------------- */
function InboundCard() {
  const { w, update } = useWh();
  const [gen, setGen] = useState({ trucks: 2, from: '07:00', to: '16:00', pkgs: 3500, days: [...MON_SAT] as Days, boxes: 70, uld: 20, loose: 10 });
  const generate = () => {
    if (!confirm(t('cfg.genConfirm'))) return;
    const a = hm(gen.from) ?? 420, b = hm(gen.to) ?? 960, n = Math.max(1, Math.round(gen.trucks));
    update(o => {
      o.inbound = [...Array(n)].map((_, i) => ({
        id: uid('i'), name: `${t('cfg.truckName')} ${i + 1}`, days: [...gen.days] as Days,
        arrival: fmtHM(n === 1 ? a : a + (b - a) * i / (n - 1)), packages: Math.round(gen.pkgs / n),
        mix: { boxes: gen.boxes, uld: gen.uld, loose: gen.loose }, pkgsPerBox: 60, pkgsPerUld: 150, volumeVarPct: 10, timeVarMin: 30,
      }));
    });
  };
  return (
    <div class="card wide">
      <h2>{t('cfg.inbound')}</h2>
      <div class="sub">{t('cfg.inboundSub')}</div>
      <div class="tblwrap">
        <table class="inb">
          <thead><tr>
            <th>{t('cfg.truckName')}</th><th>{t('cfg.days')}</th><th>{t('cfg.time')}</th><th>{t('cfg.packages')}</th>
            <th>{t('cfg.mixBoxes')}</th><th>{t('cfg.mixUld')}</th><th>{t('cfg.mixLoose')}</th><th>{t('cfg.perBox')}</th><th>{t('cfg.perUld')}</th>
            <th>{t('cfg.volVar')}</th><th>{t('cfg.timeVar')}</th><th></th>
          </tr></thead>
          <tbody>
            {w.inbound.map((tr, i) => (
              <tr key={tr.id}>
                <td><Text path={`inbound.${i}.name`} width={110} /></td>
                <td><DaysToggle path={`inbound.${i}.days`} /></td>
                <td><Time path={`inbound.${i}.arrival`} /></td>
                <td><Num path={`inbound.${i}.packages`} min={0} step={1} width={80} /></td>
                <td><Num path={`inbound.${i}.mix.boxes`} min={0} max={100} width={58} /></td>
                <td><Num path={`inbound.${i}.mix.uld`} min={0} max={100} width={58} /></td>
                <td><Num path={`inbound.${i}.mix.loose`} min={0} max={100} width={58} /></td>
                <td><Num path={`inbound.${i}.pkgsPerBox`} min={1} step={1} width={58} /></td>
                <td><Num path={`inbound.${i}.pkgsPerUld`} min={1} step={1} width={64} /></td>
                <td><Num path={`inbound.${i}.volumeVarPct`} min={0} width={54} /></td>
                <td><Num path={`inbound.${i}.timeVarMin`} min={0} width={54} /></td>
                <td><button class="x" title={t('remove')} onClick={() => { if (confirm(t('cfg.confirmDel', { name: tr.name }))) update(o => o.inbound.splice(i, 1)); }}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button class="btn sm" style={{ marginTop: '8px' }} onClick={() => update(o => {
        const last = o.inbound[o.inbound.length - 1];
        o.inbound.push(last ? { ...structuredClone(last), id: uid('i'), name: `${t('cfg.truckName')} ${o.inbound.length + 1}` }
          : { id: uid('i'), name: `${t('cfg.truckName')} 1`, days: [...MON_SAT] as Days, arrival: '08:00', packages: 1000, mix: { boxes: 100, uld: 0, loose: 0 }, pkgsPerBox: 60, pkgsPerUld: 150, volumeVarPct: 10, timeVarMin: 30 });
      })}>{t('cfg.addTruck')}</button>

      <div class="split">
        <div class="gen">
          <h3>{t('cfg.generator')}</h3>
          <div class="sub">{t('cfg.genSub')}</div>
          <div class="frow">
            <label class="fld"><span>{t('cfg.genTrucks')}</span><input type="number" min={1} value={gen.trucks} onChange={e => setGen({ ...gen, trucks: +e.currentTarget.value })} /></label>
            <label class="fld"><span>{t('cfg.genFrom')}</span><input type="time" value={gen.from} onChange={e => setGen({ ...gen, from: e.currentTarget.value })} /></label>
            <label class="fld"><span>{t('cfg.genTo')}</span><input type="time" value={gen.to} onChange={e => setGen({ ...gen, to: e.currentTarget.value })} /></label>
            <label class="fld"><span>{t('cfg.genPkgs')}</span><input type="number" min={0} value={gen.pkgs} onChange={e => setGen({ ...gen, pkgs: +e.currentTarget.value })} /></label>
          </div>
          <div class="frow">
            <label class="fld"><span>{t('cfg.mixBoxes')}</span><input type="number" min={0} max={100} value={gen.boxes} onChange={e => setGen({ ...gen, boxes: +e.currentTarget.value })} /></label>
            <label class="fld"><span>{t('cfg.mixUld')}</span><input type="number" min={0} max={100} value={gen.uld} onChange={e => setGen({ ...gen, uld: +e.currentTarget.value })} /></label>
            <label class="fld"><span>{t('cfg.mixLoose')}</span><input type="number" min={0} max={100} value={gen.loose} onChange={e => setGen({ ...gen, loose: +e.currentTarget.value })} /></label>
          </div>
          <div class="frow" style={{ alignItems: 'center' }}>
            <span class="days">{gen.days.map((on, i) => <button type="button" class={on ? 'on' : ''} onClick={() => { const d = [...gen.days] as Days; d[i] = !d[i]; setGen({ ...gen, days: d }); }}>{t('dl' + i)}</button>)}</span>
            <button class="btn pri sm" onClick={generate}>{t('cfg.genApply')}</button>
          </div>
        </div>
        <WeekCalendar w={w} />
      </div>
    </div>
  );
}

function WeekCalendar({ w }: { w: Warehouse }) {
  const H = 260, scale = (w.volumePct ?? 100) / 100;
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const blocks: { d: number; top: number; label: string; pk: number }[] = [];
  w.inbound.forEach(tr => tr.days.forEach((on, d) => {
    if (!on) return;
    const m = hm(tr.arrival) ?? 0;
    totals[d] += tr.packages * scale;
    blocks.push({ d, top: (m / DAY) * H, label: `${tr.arrival} · ${tr.name}`, pk: Math.round(tr.packages * scale) });
  }));
  return (
    <div class="cal">
      <h3>{t('cfg.calendar')}</h3>
      <div class="calgrid">
        <div class="calhrs" style={{ height: H + 'px' }}>{[0, 6, 12, 18, 24].map(h => <span style={{ top: (h / 24) * H + 'px' }}>{String(h).padStart(2, '0')}</span>)}</div>
        {totals.map((tot, d) => (
          <div class="calcol">
            <div class="calhd">{t('d' + d)}</div>
            <div class="calbody" style={{ height: H + 'px' }}>
              {blocks.filter(b => b.d === d).map(b => <div class="calblk" style={{ top: b.top + 'px' }} title={b.label}>{nf(b.pk)}</div>)}
            </div>
            <div class="calft">{tot ? t('cfg.calTotal', { n: nf(tot) }) : '—'}</div>
          </div>
        ))}
      </div>
      <div class="hint">{t('cfg.weekTotal', { n: nf(totals.reduce((a, b) => a + b, 0)) })}</div>
    </div>
  );
}

/* ------------------------- turnos ------------------------- */
function ShiftsCard() {
  const { w, update } = useWh();
  return (
    <div class="card wide">
      <h2>{t('cfg.shifts')}</h2>
      <div class="sub">{t('cfg.shiftsSub')}</div>
      <div class="shifts">
        {w.shifts.map((s, i) => (
          <div class="shift" key={s.id}>
            <div class="frow">
              <Field label={t('cfg.shiftName')}><Text path={`shifts.${i}.name`} /></Field>
              <Field label={t('cfg.start')} w={110}><Time path={`shifts.${i}.start`} /></Field>
              <Field label={t('cfg.end')} w={110}><Time path={`shifts.${i}.end`} /></Field>
              <button class="x" title={t('remove')} onClick={() => { if (confirm(t('cfg.confirmDel', { name: s.name }))) update(o => o.shifts.splice(i, 1)); }}>×</button>
            </div>
            <div class="frow" style={{ alignItems: 'center' }}>
              <DaysToggle path={`shifts.${i}.days`} />
              <span class="hint">{t('cfg.shiftPeople', { n: PROCESSES.reduce((a, p) => a + (s.staff[p] || 0), 0) })}</span>
            </div>
            <div class="frow">
              <Field label={t('cfg.productivity')}><Num path={`shifts.${i}.productivityPct`} min={10} max={200} /></Field>
              <Field label={t('cfg.cost')}><Num path={`shifts.${i}.costPerHour`} min={0} /></Field>
            </div>
            <div class="frow" style={{ alignItems: 'flex-end' }}>
              <Check path={`shifts.${i}.night`} label={t('cfg.night')} />
              <Field label={t('cfg.otHours')} hint={s.night ? t('cfg.otHint') : undefined}><Num path={`shifts.${i}.overtimeHours`} min={0} disabled={!s.night} /></Field>
            </div>
            <div class="brks">
              <span class="hint">{t('cfg.breaks')}:</span>
              {s.breaks.map((_, j) => (
                <span class="chip"><Time path={`shifts.${i}.breaks.${j}.start`} /><Num path={`shifts.${i}.breaks.${j}.minutes`} min={0} width={56} /><span class="hint">{t('cfg.breakMin')}</span>
                  <button class="x" onClick={() => update(o => o.shifts[i].breaks.splice(j, 1))}>×</button></span>
              ))}
              <button class="btn sm" onClick={() => update(o => o.shifts[i].breaks.push({ start: o.shifts[i].start, minutes: 30 }))}>{t('cfg.addBreak')}</button>
            </div>
            <div class="sub" style={{ margin: '10px 0 4px' }}>{t('cfg.staff')}</div>
            <div class="staffgrid">
              {PROCESSES.map(p => <Field label={t('p.' + p)}><Num path={`shifts.${i}.staff.${p}`} min={0} step={1} /></Field>)}
            </div>
          </div>
        ))}
      </div>
      <div class="frow" style={{ marginTop: '10px', alignItems: 'flex-end' }}>
        <button class="btn sm" onClick={() => update(o => {
          const last = o.shifts[o.shifts.length - 1];
          o.shifts.push(last ? { ...structuredClone(last), id: uid('t'), name: `${t('cfg.shiftName')} ${o.shifts.length + 1}`, night: false, overtimeHours: 0 }
            : { id: uid('t'), name: `${t('cfg.shiftName')} 1`, days: [...MON_SAT] as Days, start: '06:00', end: '14:00', breaks: [], productivityPct: 100, costPerHour: 5, night: false, overtimeHours: 0, staff: { unload: 1, decon: 1, sort: 2, hospital: 0, reverify: 1, branch: 1, load: 1 } });
        })}>{t('cfg.addShift')}</button>
        <Field label={t('cfg.otMult')} w={220}><Num path="costs.overtimeMultiplier" min={1} step={0.1} /></Field>
      </div>
    </div>
  );
}

/* ------------------------- grupos ------------------------- */
function GroupsCard() {
  const { w, update } = useWh();
  const sum = w.groups.reduce((a, g) => a + (+g.sharePct || 0), 0);
  return (
    <div class="card wide">
      <h2>{t('cfg.groups')}</h2>
      <div class="sub">{t('cfg.groupsSub', { sum: nf(sum, 1) })}</div>
      {w.groups.map((g, i) => (
        <div class="prov" key={g.id}>
          <div class="hd">
            <Field label={t('cfg.group')}><Text path={`groups.${i}.name`} /></Field>
            <Field label={t('cfg.share')}><Num path={`groups.${i}.sharePct`} min={0} max={100} /></Field>
            <Field label={t('cfg.dest')}><Select path={`groups.${i}.dest`} options={[['stageout', t('cfg.destStage')], ['branch', t('cfg.destBranch')]]} /></Field>
            <Check path={`groups.${i}.reverify`} label={t('cfg.reverify')} />
            <button class="x" title={t('remove')} onClick={() => { if (w.groups.length > 1 && confirm(t('cfg.confirmDelGroup', { name: g.name }))) update(o => o.groups.splice(i, 1)); }}>×</button>
          </div>
          <div class="svcs">
            <span class="hint">{t('cfg.services')}:</span>
            {g.services.map((_, j) => (
              <span class="chip"><Text path={`groups.${i}.services.${j}.name`} width={120} /><span class="hint">{t('cfg.svcWeight')}</span><Num path={`groups.${i}.services.${j}.weight`} min={0} width={52} />
                <button class="x" onClick={() => update(o => { if (o.groups[i].services.length > 1) o.groups[i].services.splice(j, 1); })}>×</button></span>
            ))}
            <button class="btn sm" onClick={() => update(o => o.groups[i].services.push({ id: uid('s'), name: `${t('cfg.services').split(' ')[0]} ${o.groups[i].services.length + 1}`, confirmed: false, weight: 1 }))}>{t('cfg.addService')}</button>
          </div>
          {g.dest !== 'branch' && (
            <div class="svcs">
              <span class="hint">{t('cfg.outTrucks')}:</span>
              {g.outbound.map((_, j) => (
                <span class="chip"><DaysToggle path={`groups.${i}.outbound.${j}.days`} /><span class="hint">{t('cfg.outArrives')}</span><Time path={`groups.${i}.outbound.${j}.arrival`} />
                  <button class="x" onClick={() => update(o => o.groups[i].outbound.splice(j, 1))}>×</button></span>
              ))}
              <button class="btn sm" onClick={() => update(o => o.groups[i].outbound.push({ id: uid('o'), days: [...MON_SAT] as Days, arrival: '16:00' }))}>{t('cfg.addOut')}</button>
            </div>
          )}
          <div class="svcs">
            <label class="chk"><input type="checkbox" checked={!!g.profile} onChange={e => { const on = e.currentTarget.checked; update(o => (o.groups[i].profile = on ? structuredClone(o.packageProfile) : null)); }} />{t('cfg.ownProfile')}</label>
          </div>
          {g.profile && <ProfileFields base={`groups.${i}.profile`} />}
        </div>
      ))}
      <button class="btn sm" onClick={() => update(o => o.groups.push({ id: uid('g'), name: `${t('cfg.group')} ${o.groups.length + 1}`, confirmed: false, sharePct: 0, reverify: true, dest: 'stageout',
        services: [{ id: uid('s'), name: 'Servicio 1', confirmed: false, weight: 1 }], outbound: [{ id: uid('o'), days: [...MON_SAT] as Days, arrival: '16:00' }], profile: null }))}>{t('cfg.addGroup')}</button>
    </div>
  );
}

function RoutesCard() {
  const { w, update } = useWh();
  return (
    <div class="card">
      <h2>{t('cfg.routes')}</h2>
      <div class="sub">{t('cfg.routesSub')}</div>
      <div class="frow"><Field label={t('cfg.routeCount')} w={180}><Num path="routes.count" min={1} max={60} step={1} /></Field></div>
      <div class="sub" style={{ margin: '4px 0' }}>{t('cfg.windows')}</div>
      {w.routes.windows.map((v, i) => (
        <div class="frow" style={{ alignItems: 'flex-end' }} key={v.id}>
          <Field label={t('cfg.windowName')}><Text path={`routes.windows.${i}.name`} /></Field>
          <Field label={t('cfg.routeFirst')} w={120}><Time path={`routes.windows.${i}.first`} /></Field>
          <Field label={t('cfg.routeEvery')} w={120}><Num path={`routes.windows.${i}.everyMin`} min={0} /></Field>
          <DaysToggle path={`routes.windows.${i}.days`} />
          <button class="x" title={t('remove')} onClick={() => { if (confirm(t('cfg.confirmDel', { name: v.name }))) update(o => o.routes.windows.splice(i, 1)); }}>×</button>
          <div class="hint" style={{ flexBasis: '100%' }}>{[...Array(w.routes.count)].map((_, r) => `R${r + 1} ${fmtHM((hm(v.first) ?? 0) + r * v.everyMin)}`).join(' · ')}</div>
        </div>
      ))}
      <button class="btn sm" onClick={() => update(o => o.routes.windows.push({ id: uid('v'), name: `${t('cfg.windowName')} ${o.routes.windows.length + 1}`, days: [...MON_SAT] as Days, first: '16:00', everyMin: 10 }))}>{t('cfg.addWindow')}</button>
    </div>
  );
}

function ProcessesCard() {
  const { w, update } = useWh();
  const pr = w.multiskill.priority;
  return (
    <div class="card wide">
      <h2>{t('cfg.processes')}</h2>
      <div class="sub">{t('cfg.processesSub')}</div>
      <div class="frow">
        <Field label={t('cfg.sortType')} w={260}><Select path="sorting.type" options={[['manual', t('cfg.stManual')], ['ptl', t('cfg.stPtl')], ['sorter', t('cfg.stSorter')]]} /></Field>
        <Field label={t('cfg.cptLead')} hint={t('cfg.cptHint')} w={420}><Num path="cptLeadMin" min={0} step={15} /></Field>
      </div>
      {w.sorting.type === 'sorter' && <>
        <div class="frow">
          <Field label={t('cfg.induction')}><Num path="sorting.sorter.inductionPoints" min={1} step={1} /></Field>
          <Field label={t('cfg.machine')}><Num path="sorting.sorter.machinePerHour" min={1} step={100} /></Field>
          <Field label={t('cfg.chutes')}><Num path="sorting.sorter.chutes" min={1} step={1} /></Field>
          <Field label={t('cfg.noRead')}><Num path="sorting.sorter.noReadPct" min={0} max={100} /></Field>
        </div>
        <div class="frow">
          <Field label={t('cfg.maxKg')}><Num path="sorting.sorter.maxKg" min={0.1} /></Field>
          <Field label={t('cfg.maxL')}><Num path="sorting.sorter.maxLengthCm" min={1} /></Field>
          <Field label={t('cfg.maxW')}><Num path="sorting.sorter.maxWidthCm" min={1} /></Field>
          <Field label={t('cfg.maxH')}><Num path="sorting.sorter.maxHeightCm" min={1} /></Field>
        </div>
        <div class="hint" style={{ marginBottom: '8px' }}>{t('cfg.sorterHint')}</div>
      </>}
      <div class="frow">
        <Field label={t('cfg.exceptionPct')} hint={t('cfg.hospitalHint')}><Num path="hospital.exceptionPct" min={0} max={100} /></Field>
        <Field label={t('cfg.relabelPct')}><Num path="hospital.relabelPct" min={0} max={100} /></Field>
        <Field label={t('cfg.changeMin')}><Num path="multiskill.changeMin" min={0} /></Field>
      </div>
      <div class="sub" style={{ margin: '6px 0 4px' }}>{t('cfg.priority')}</div>
      <div class="svcs">
        {pr.map((p, i) => (
          <span class="chip">{i + 1}. {t('p.' + p)}
            {i > 0 && <button class="x" title={t('cfg.up')} aria-label={t('cfg.up')} onClick={() => update(o => { const a = o.multiskill.priority; [a[i - 1], a[i]] = [a[i], a[i - 1]]; })}>↑</button>}
          </span>
        ))}
      </div>
    </div>
  );
}

function CapacityCard() {
  return (
    <div class="card">
      <h2>{t('cfg.capacity')}</h2>
      <div class="sub">{t('cfg.capacitySub')}</div>
      <div class="frow">
        <Field label={t('cfg.basketPkgs')}><Num path="capacity.basketPkgs" min={1} step={1} /></Field>
        <Field label={t('cfg.basketL')}><Num path="capacity.basketLiters" min={1} /></Field>
        <Field label={t('cfg.contPkgs')}><Num path="capacity.containerPkgs" min={1} step={1} /></Field>
        <Field label={t('cfg.contL')}><Num path="capacity.containerLiters" min={1} /></Field>
      </div>
      <div class="frow">
        <Field label={t('cfg.slots')}><Num path="capacity.stageOutSlots" min={1} step={1} /></Field>
        <Field label={t('cfg.truckM3')}><Num path="capacity.truckM3" min={0.1} /></Field>
        <Field label={t('cfg.truckKg')}><Num path="capacity.truckKg" min={1} /></Field>
        <Field label={t('cfg.loadWindow')}><Num path="outboundLoadWindowMin" min={0} /></Field>
      </div>
      <div class="frow">
        <Field label={t('cfg.stSort')}><Num path="capacity.stations.sort" min={1} step={1} /></Field>
        <Field label={t('cfg.stRv')}><Num path="capacity.stations.reverify" min={1} step={1} /></Field>
        <Field label={t('cfg.stBr')}><Num path="capacity.stations.branch" min={1} step={1} /></Field>
      </div>
    </div>
  );
}

function TimesCard() {
  const { w } = useWh();
  return (
    <div class="card wide">
      <h2>{t('cfg.times')}</h2>
      <div class="sub">{t('cfg.timesSub')}</div>
      <div class="tblwrap">
        <table>
          <thead><tr><th>{t('cfg.activity')}</th><th>{t('cfg.unit')}</th><th>{t('cfg.min')}</th><th>{t('cfg.mode')}</th><th>{t('cfg.max')}</th><th class="n">{t('cfg.perHour')}</th></tr></thead>
          <tbody>
            {TIME_KEYS.map(k => {
              const tt = w.times[k], mean = (tt.min + tt.mode + tt.max) / 3, sec = SECOND_KEYS.has(k);
              const ph = mean > 0 ? (sec ? 3600 : 60) / mean : 0;
              return (
                <tr>
                  <td>{t('t.' + k)}</td>
                  <td class="hint">{t(sec ? 'u.sec' : 'u.min')} {t(PER[k])}</td>
                  <td><Num path={`times.${k}.min`} min={0} width={80} /></td>
                  <td><Num path={`times.${k}.mode`} min={0} width={80} /></td>
                  <td><Num path={`times.${k}.max`} min={0} width={80} /></td>
                  <td class="n">{ph ? nf(ph) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
