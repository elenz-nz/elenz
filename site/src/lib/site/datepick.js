// <date-pick>: the tracker's date box (both tabs). The browsers' own date pickers differ (Firefox's month and year
// lists redrew the chart at every step and broke the page when scrolled quickly; Edge's is another design), so the
// site draws its own (owner's report TRK-07, 28 Oct 2026; owner's call: our own calendar).
//
// It behaves like <input type="date"> where the tracker needs it to: `value`, `min`, `max` ('YYYY-MM-DD' or ''),
// `disabled`, and a `change` event when a day is picked. Moving between months or years never changes the value, so
// nothing redraws until a day is chosen; picking a day closes the calendar.
//
// The calendar hangs from document.body, fixed to the window, so the sticky control bar (which clips anything below
// it) doesn't cut it off. Keyboard: arrows move a day or a week, Page Up/Down a month (Shift: a year), Home/End the
// week's ends, Enter picks, Escape closes. The month name opens a year list, then a month list.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const ICON = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3.2" width="12" height="10.6" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 6.6h12M5.2 1.8v2.6M10.8 1.8v2.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
const ARROW = d => `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// days as whole numbers (UTC midnights / 1 day), so no time zone or clock change can shift a date
const toDay = s => { const m = ISO.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; };
const toIso = d => new Date(d * 864e5).toISOString().slice(0, 10);
const parts = d => { const x = new Date(d * 864e5); return { y: x.getUTCFullYear(), m: x.getUTCMonth(), dom: x.getUTCDate(), dow: x.getUTCDay() }; };
const first = (y, m) => Date.UTC(y, m, 1) / 864e5;
const today = () => toDay(new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date()));
/** The same day of the month k months on, kept within the month (31 Jan + 1 month = 28 or 29 Feb). */
function addMonths(d, k) {
  const p = parts(d), mm = p.m + k, y = p.y + Math.floor(mm / 12), m = ((mm % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(p.dom, last)) / 864e5;
}

let openOne = null;   // only one calendar open at a time

// (on the server, while pages are prerendered, there's no HTMLElement: the class is defined but never registered)
class DatePick extends (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) {
  static observedAttributes = ['value', 'min', 'max', 'disabled', 'title'];
  constructor() {
    super();
    this._v = ''; this._min = ''; this._max = ''; this._view = null; this._mode = 'days'; this._focus = null; this._pop = null;
  }
  connectedCallback() {
    // properties set before the element was defined sit on the instance: move them onto the accessors
    for (const k of ['value', 'min', 'max', 'disabled']) if (Object.hasOwn(this, k)) { const v = this[k]; delete this[k]; this[k] = v; }
    if (!this._btn) {
      this.innerHTML = `<button type="button" class="dp-btn" aria-haspopup="dialog" aria-expanded="false"><span class="dp-txt"></span>${ICON}</button>`;
      this._btn = this.querySelector('button');
      this._btn.addEventListener('click', () => (this._pop ? this.close() : this.open()));
      this._btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' && !this._pop) { e.preventDefault(); this.open(); } });
    }
    this._sync();
  }
  disconnectedCallback() { this.close(false); }
  attributeChangedCallback(name, _, v) {
    if (name === 'disabled') this.disabled = v != null;
    else if (name === 'title') { if (this._btn) this._btn.title = v || ''; }
    else this[name] = v ?? '';
  }
  get value() { return this._v; }
  set value(v) { this._v = toDay(v) != null ? v : ''; this._sync(); }
  get min() { return this._min; }
  set min(v) { this._min = toDay(v) != null ? v : ''; if (this._pop) this._draw(); }
  get max() { return this._max; }
  set max(v) { this._max = toDay(v) != null ? v : ''; if (this._pop) this._draw(); }
  get disabled() { return !!this._off; }
  set disabled(v) { this._off = !!v; if (this._btn) this._btn.disabled = this._off; if (this._off) this.close(false); }
  focus(o) { this._btn?.focus(o); }

  _sync() {
    if (!this._btn) return;
    const d = toDay(this._v), p = d != null ? parts(d) : null;
    this.querySelector('.dp-txt').textContent = p ? `${p.dom} ${MON[p.m]} ${p.y}` : '';
    this._btn.disabled = !!this._off;
    const label = this.getAttribute('aria-label') || document.getElementById(this.getAttribute('aria-labelledby') || '')?.textContent || 'Date';
    this._btn.setAttribute('aria-label', p ? `${label}: ${DAY_NAMES[p.dow]} ${p.dom} ${MONTH[p.m]} ${p.y}. Choose a date` : `${label}. Choose a date`);
    if (this.title) this._btn.title = this.title;
  }
  _bounds() { return [toDay(this._min) ?? -Infinity, toDay(this._max) ?? Infinity]; }
  _ok(d) { const [lo, hi] = this._bounds(); return d >= lo && d <= hi; }

  open() {
    if (this._off || this._pop) return;
    if (openOne && openOne !== this) openOne.close(false);
    openOne = this;
    const [lo, hi] = this._bounds();
    let d = toDay(this._v) ?? Math.min(hi, today());
    if (d < lo) d = lo;
    this._focus = d; this._view = first(parts(d).y, parts(d).m); this._mode = 'days';
    const pop = document.createElement('div');
    pop.className = 'dp-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Choose a date');
    pop.addEventListener('click', e => this._click(e));
    pop.addEventListener('keydown', e => this._key(e));
    document.body.appendChild(pop);
    this._pop = pop;
    this._btn.setAttribute('aria-expanded', 'true');
    this._draw(true);
    this._place();
    this._outside = e => { if (!pop.contains(e.target) && !this.contains(e.target)) this.close(false); };
    this._move = () => this._place();
    document.addEventListener('pointerdown', this._outside, true);
    window.addEventListener('scroll', this._move, { passive: true });
    window.addEventListener('resize', this._move);
  }
  close(refocus = true) {
    if (!this._pop) return;
    this._pop.remove(); this._pop = null;
    if (openOne === this) openOne = null;
    this._btn?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', this._outside, true);
    window.removeEventListener('scroll', this._move);
    window.removeEventListener('resize', this._move);
    if (refocus) this._btn?.focus();
  }
  _place() {
    const pop = this._pop;
    if (!pop) return;
    const r = this._btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, pad = 8;
    let left = Math.min(Math.max(pad, r.left), window.innerWidth - w - pad);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - pad && r.top - h - 6 > pad) top = r.top - h - 6;
    pop.style.left = `${Math.max(pad, left)}px`; pop.style.top = `${top}px`;
  }

  _draw(focus = false) {
    const pop = this._pop;
    if (!pop) return;
    const [lo, hi] = this._bounds(), v = toDay(this._v), now = today();
    const vp = parts(this._view);
    let body = '';
    if (this._mode === 'days') {
      const prevOk = first(vp.y, vp.m) > lo, nextOk = first(vp.y, vp.m + 1) <= hi;
      body += `<div class="dp-head"><button type="button" class="dp-nav" data-go="-1" aria-label="Previous month" ${prevOk ? '' : 'disabled'}>${ARROW('M10 3 5 8l5 5')}</button>`
        + `<button type="button" class="dp-title" data-mode="years" aria-label="${MONTH[vp.m]} ${vp.y}: choose a year and month">${MONTH[vp.m]} ${vp.y}<svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`
        + `<button type="button" class="dp-nav" data-go="1" aria-label="Next month" ${nextOk ? '' : 'disabled'}>${ARROW('m6 3 5 5-5 5')}</button></div>`;
      body += '<div class="dp-grid" role="grid">' + DOW.map(n => `<span class="dp-dow" aria-hidden="true">${n.slice(0, 2)}</span>`).join('');
      const start = this._view - ((parts(this._view).dow + 6) % 7);   // the Monday on or before the 1st
      for (let i = 0; i < 42; i++) {
        const d = start + i, p = parts(d), out = p.m !== vp.m, ok = d >= lo && d <= hi;
        if (i === 35 && out) break;   // a sixth row only when the month needs it
        const cls = ['dp-day', out ? 'out' : '', d === v ? 'sel' : '', d === now ? 'today' : ''].filter(Boolean).join(' ');
        body += `<button type="button" class="${cls}" data-d="${d}" tabindex="${d === this._focus ? 0 : -1}" aria-label="${DAY_NAMES[p.dow]} ${p.dom} ${MONTH[p.m]} ${p.y}"${d === v ? ' aria-pressed="true"' : ''}${ok ? '' : ' disabled'}>${p.dom}</button>`;
      }
      body += '</div>';
    } else if (this._mode === 'years') {
      const y0 = Number.isFinite(lo) ? parts(lo).y : 1997, y1 = Number.isFinite(hi) ? parts(hi).y : parts(now).y;
      body += `<div class="dp-head"><span class="dp-cap">Year</span><button type="button" class="dp-back" data-mode="days">Back</button></div><div class="dp-years">`;
      for (let y = y1; y >= y0; y--) body += `<button type="button" data-y="${y}" class="${y === vp.y ? 'sel' : ''}"${y === vp.y ? ' aria-pressed="true"' : ''}>${y}</button>`;
      body += '</div>';
    } else {
      body += `<div class="dp-head"><span class="dp-cap">${vp.y}</span><button type="button" class="dp-back" data-mode="years">Years</button></div><div class="dp-months">`;
      for (let m = 0; m < 12; m++) {
        const ok = first(vp.y, m + 1) > lo && first(vp.y, m) <= hi;
        body += `<button type="button" data-m="${m}" class="${m === vp.m ? 'sel' : ''}"${ok ? '' : ' disabled'}>${MON[m]}</button>`;
      }
      body += '</div>';
    }
    pop.innerHTML = body;
    pop.dataset.mode = this._mode;
    if (focus) {
      const f = this._mode === 'days' ? pop.querySelector(`[data-d="${this._focus}"]:not([disabled])`) || pop.querySelector('.dp-day:not([disabled])')
        : pop.querySelector('.sel:not([disabled])') || pop.querySelector('button:not([disabled])');
      f?.focus();
      if (this._mode === 'years') f?.scrollIntoView({ block: 'center' });
    }
  }
  _click(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const vp = parts(this._view);
    if (b.dataset.go) { this._view = first(vp.y, vp.m + +b.dataset.go); this._focus = Math.max(this._view, Math.min(this._focus, first(vp.y, vp.m + +b.dataset.go + 1) - 1)); this._draw(); this._pop.querySelector(`[data-go="${b.dataset.go}"]:not([disabled])`)?.focus(); }
    else if (b.dataset.mode) { this._mode = b.dataset.mode; this._draw(true); }
    else if (b.dataset.y) { this._view = first(+b.dataset.y, vp.m); this._mode = 'months'; this._draw(true); }
    else if (b.dataset.m) { this._view = first(vp.y, +b.dataset.m); this._focus = this._view; this._mode = 'days'; this._clampFocus(); this._draw(true); }
    else if (b.dataset.d) this._pick(+b.dataset.d);
  }
  _clampFocus() { const [lo, hi] = this._bounds(); this._focus = Math.max(lo, Math.min(hi, this._focus)); }
  _key(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (this._mode !== 'days') { this._mode = 'days'; this._draw(true); } else this.close(); return; }
    if (e.key === 'Tab') {   // keep focus inside the calendar
      const f = [...this._pop.querySelectorAll('button:not([disabled])')].filter(b => b.tabIndex !== -1);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if (this._mode !== 'days' || !e.target.classList.contains('dp-day')) return;
    const p = parts(this._focus);
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -((p.dow + 6) % 7), End: 6 - ((p.dow + 6) % 7) }[e.key];
    let d = null;
    if (step != null) d = this._focus + step;
    else if (e.key === 'PageUp' || e.key === 'PageDown') d = addMonths(this._focus, (e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1));
    else return;
    e.preventDefault();
    const [lo, hi] = this._bounds();
    this._focus = Math.max(lo, Math.min(hi, d));
    const fp = parts(this._focus);
    this._view = first(fp.y, fp.m);
    this._draw(true);
  }
  _pick(d) {
    if (!this._ok(d)) return;
    const iso = toIso(d), changed = iso !== this._v;
    this._v = iso; this._sync();
    this.close();
    if (changed) this.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('date-pick')) customElements.define('date-pick', DatePick);
