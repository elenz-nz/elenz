// Small helpers shared by the article charts: scales, ticks, number formats, bar paths.

export const linear = (d0: number, d1: number, r0: number, r1: number) => {
	const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
	return (v: number) => r0 + (v - d0) * k;
};

// round ticks covering [lo, hi], about n of them
export function ticks(lo: number, hi: number, n = 5): number[] {
	const span = hi - lo || Math.abs(hi) || 1;
	const raw = span / n;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
	const out: number[] = [];
	for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
	return out;
}

// extend a [lo, hi] range out to round tick values
export function nice(lo: number, hi: number, n = 5): [number, number] {
	const t = ticks(lo, hi, n);
	const step = t.length > 1 ? t[1] - t[0] : 1;
	return [Math.min(lo, Math.floor(lo / step) * step), Math.max(hi, Math.ceil(hi / step) * step)];
}

export const num = (v: number, dp = 0) =>
	(v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-NZ', { minimumFractionDigits: dp, maximumFractionDigits: dp });

// compact axis labels: 1,500 → 1.5K
export const compact = (v: number) => {
	const a = Math.abs(v);
	if (a >= 1000) return (v < 0 ? '−' : '') + (a / 1000).toLocaleString('en-NZ', { maximumFractionDigits: 1 }) + 'K';
	return num(v);
};

// a bar from y0 (baseline side) to y1 (data end), x..x+w, with radius r on the data end only
export function barPath(x: number, w: number, y0: number, y1: number, r = 4, round = true): string {
	const up = y1 < y0;
	const h = Math.abs(y1 - y0);
	const rr = round ? Math.min(r, h, w / 2) : 0;
	if (h < 0.5) return '';
	if (up) {
		return `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`;
	}
	return `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 - rr}V${y0}Z`;
}

// a horizontal bar from x0 (baseline) to x1 (data end), rounded at the data end
export function hbarPath(y: number, h: number, x0: number, x1: number, r = 4): string {
	const right = x1 > x0;
	const w = Math.abs(x1 - x0);
	if (w < 0.5) return '';
	const rr = Math.min(r, w, h / 2);
	if (right) return `M${x0},${y}H${x1 - rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 - rr},${y + h}H${x0}Z`;
	return `M${x0},${y}H${x1 + rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 + rr},${y + h}H${x0}Z`;
}

export const color = (tok: string) => `var(${tok})`;
