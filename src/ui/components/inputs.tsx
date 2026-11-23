import type { ComponentChildren } from 'preact';
import { getPath, setPath, useWh } from '../store';
import { t } from '../../i18n';
import type { Days } from '../../model/types';

export function Field({ label, children, hint, w }: { label: string; children: ComponentChildren; hint?: string; w?: number }) {
  return (
    <label class="fld" style={w ? { maxWidth: w + 'px' } : undefined}>
      <span>{label}</span>
      {children}
      {hint && <small class="hint">{hint}</small>}
    </label>
  );
}

export function Num({ path, min, max, step, width, disabled }: { path: string; min?: number; max?: number; step?: number | 'any'; width?: number; disabled?: boolean }) {
  const { w, update } = useWh();
  const v = getPath(w, path) as number;
  return (
    <input type="number" value={v ?? 0} min={min} max={max} step={step ?? 'any'} disabled={disabled}
      style={width ? { width: width + 'px' } : undefined}
      onChange={e => { const raw = e.currentTarget.value; const x = raw === '' ? 0 : +raw; update(o => setPath(o, path, isFinite(x) ? x : 0)); }} />
  );
}

export function Text({ path, width, placeholder }: { path: string; width?: number; placeholder?: string }) {
  const { w, update } = useWh();
  return (
    <input type="text" value={(getPath(w, path) as string) ?? ''} placeholder={placeholder}
      style={width ? { width: width + 'px' } : undefined}
      onChange={e => { const v = e.currentTarget.value; update(o => setPath(o, path, v)); }} />
  );
}

export function Time({ path }: { path: string }) {
  const { w, update } = useWh();
  return (
    <input type="time" value={(getPath(w, path) as string) ?? ''}
      onChange={e => { const v = e.currentTarget.value; if (v) update(o => setPath(o, path, v)); }} />
  );
}

export function Check({ path, label }: { path: string; label: string }) {
  const { w, update } = useWh();
  return (
    <label class="chk">
      <input type="checkbox" checked={!!getPath(w, path)} onChange={e => { const v = e.currentTarget.checked; update(o => setPath(o, path, v)); }} />
      {label}
    </label>
  );
}

export function Select({ path, options }: { path: string; options: [string, string][] }) {
  const { w, update } = useWh();
  return (
    <select value={getPath(w, path) as string} onChange={e => { const v = e.currentTarget.value; update(o => setPath(o, path, v)); }}>
      {options.map(([v, l]) => <option value={v}>{l}</option>)}
    </select>
  );
}

/** Siete botones L-M-X-J-V-S-D. */
export function DaysToggle({ path }: { path: string }) {
  const { w, update } = useWh();
  const d = (getPath(w, path) as Days) ?? [false, false, false, false, false, false, false];
  return (
    <span class="days" role="group" aria-label={t('cfg.days')}>
      {d.map((on, i) => (
        <button type="button" class={on ? 'on' : ''} title={t('d' + i)} aria-pressed={on}
          onClick={() => update(o => { const a = [...((getPath(o, path) as Days) ?? d)] as Days; a[i] = !a[i]; setPath(o, path, a); })}>
          {t('dl' + i)}
        </button>
      ))}
    </span>
  );
}
