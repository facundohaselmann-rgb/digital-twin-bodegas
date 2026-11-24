/* Piezas básicas del motor: RNG reproducible, heap de eventos y cola O(1). */

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Muestra de una triangular (min, moda, max). */
export function triangular(u: number, a: number, c: number, b: number): number {
  if (b <= a) return a;
  const f = (c - a) / (b - a);
  return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

interface HeapItem { t: number; s: number; fn: () => void; sample: boolean }

/** Cola de prioridad por tiempo (y orden de inserción para empates). */
export class EventHeap {
  private h: HeapItem[] = [];
  private seq = 0;
  get size(): number { return this.h.length; }
  push(t: number, fn: () => void, sample = false): void {
    const h = this.h;
    h.push({ t, s: this.seq++, fn, sample });
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.lt(h[i], h[p])) { [h[i], h[p]] = [h[p], h[i]]; i = p; } else break;
    }
  }
  pop(): HeapItem | undefined {
    const h = this.h;
    if (!h.length) return undefined;
    const top = h[0], last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && this.lt(h[l], h[m])) m = l;
        if (r < h.length && this.lt(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return top;
  }
  private lt(a: HeapItem, b: HeapItem): boolean { return a.t < b.t || (a.t === b.t && a.s < b.s); }
}

/** Cola doble circular: push/shift/unshift en O(1) (evita el costo de Array.shift con colas largas). */
export class Deque<T> {
  private a: (T | undefined)[];
  private head = 0;
  private n = 0;
  constructor(cap = 16) { this.a = new Array(cap); }
  get length(): number { return this.n; }
  push(x: T): void {
    if (this.n === this.a.length) this.grow();
    this.a[(this.head + this.n) % this.a.length] = x;
    this.n++;
  }
  unshift(x: T): void {
    if (this.n === this.a.length) this.grow();
    this.head = (this.head - 1 + this.a.length) % this.a.length;
    this.a[this.head] = x;
    this.n++;
  }
  shift(): T | undefined {
    if (!this.n) return undefined;
    const x = this.a[this.head];
    this.a[this.head] = undefined;
    this.head = (this.head + 1) % this.a.length;
    this.n--;
    return x;
  }
  *[Symbol.iterator](): IterableIterator<T> {
    for (let i = 0; i < this.n; i++) yield this.a[(this.head + i) % this.a.length] as T;
  }
  private grow(): void {
    const b = new Array<T | undefined>(this.a.length * 2);
    for (let i = 0; i < this.n; i++) b[i] = this.a[(this.head + i) % this.a.length];
    this.a = b;
    this.head = 0;
  }
}

/** Percentil (0-100) de un arreglo YA ordenado, con interpolación lineal. */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (!n) return NaN;
  const r = (p / 100) * (n - 1);
  const lo = Math.floor(r), hi = Math.ceil(r);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (r - lo);
}
