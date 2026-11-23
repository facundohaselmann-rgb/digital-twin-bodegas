import { useRef, useState } from 'preact/hooks';
import { DAY, fmtHM } from '../../model/time';
import { nf, t } from '../../i18n';

export interface Series { name: string; color: string; pts: [number, number][] }

/** Gráfico de líneas sobre el eje semanal (minutos desde el lunes 00:00), con tooltip. */
export function LineChart({ series, step = false, label }: { series: Series[]; step?: boolean; label: string }) {
  const W = 680, H = 250, pl = 46, pr = 12, pt = 10, pb = 30;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null);
  const all = series.flatMap(s => s.pts);
  if (!all.length) return <div class="hint">—</div>;
  const x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(x0 + 60, ...all.map(p => p[0]));
  const ymaxRaw = Math.max(1, ...all.map(p => p[1]));
  const nice = (v: number) => { const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; };
  const ymax = nice(ymaxRaw * 1.05);
  const X = (x: number) => pl + ((x - x0) / (x1 - x0)) * (W - pl - pr), Y = (y: number) => pt + (1 - y / ymax) * (H - pt - pb);
  const xs = series[0].pts.map(p => p[0]);
  const paths = series.map(s => {
    let d = '';
    s.pts.forEach((p, i) => { const x = X(p[0]).toFixed(1), y = Y(p[1]).toFixed(1); d += !i ? `M${x},${y}` : step ? `H${x}V${y}` : `L${x},${y}`; });
    return d;
  });
  const days: number[] = [];
  for (let d = Math.ceil(x0 / DAY); d * DAY <= x1; d++) days.push(d);
  const onMove = (e: MouseEvent) => {
    const r = svgRef.current!.getBoundingClientRect(), sx = ((e.clientX - r.left) / r.width) * W;
    const xv = x0 + ((sx - pl) / (W - pl - pr)) * (x1 - x0);
    let bi = 0, bd = Infinity;
    xs.forEach((x, i) => { const d = Math.abs(x - xv); if (d < bd) { bd = d; bi = i; } });
    setHover({ i: bi, x: (X(xs[bi]) / W) * r.width });
  };
  return (
    <div class="chart">
      <div class="lgd">{series.map(s => <span><i style={{ background: s.color }} />{s.name}</span>)}</div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map(i => { const v = (ymax * i) / 4, y = Y(v); return <g><line class={i ? 'gl' : 'bl'} x1={pl} x2={W - pr} y1={y} y2={y} /><text class="ax" x={pl - 6} y={y + 3.5} text-anchor="end">{nf(v)}</text></g>; })}
        {days.map(d => <g><line class="gl" x1={X(d * DAY)} x2={X(d * DAY)} y1={pt} y2={H - pb} /><text class="ax" x={X(d * DAY + DAY / 2)} y={H - 10} text-anchor="middle">{X(d * DAY + DAY / 2) < W - pr ? t('d' + (d % 7)) : ''}</text></g>)}
        {paths.map((d, i) => <path d={d} fill="none" stroke={series[i].color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />)}
        {hover && <line class="xh" x1={X(xs[hover.i])} x2={X(xs[hover.i])} y1={pt} y2={H - pb} />}
        <rect x={pl} y={pt} width={W - pl - pr} height={H - pt - pb} fill="transparent" />
      </svg>
      {hover && (
        <div class="tip" style={{ opacity: 1, top: '34px', left: `${hover.x + 190 > (svgRef.current?.clientWidth ?? 600) ? hover.x - 200 : hover.x + 14}px` }}>
          <div style={{ fontWeight: 600, marginBottom: '3px' }}>{t('d' + (Math.floor(xs[hover.i] / DAY) % 7))} {fmtHM(xs[hover.i])}</div>
          {series.map(s => <div class="r"><span><i style={{ background: s.color }} />{s.name}</span><b>{nf(s.pts[hover.i]?.[1] ?? 0)}</b></div>)}
        </div>
      )}
    </div>
  );
}
