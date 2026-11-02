// <time-pick>: the time box beside the date when a chart is zoomed into hours (both tracker tabs). The browsers' own
// time pickers change at every step, so the chart redrew while scrolling through the hours (owner's report ZM-03,
// 1 Nov 2026). As with <date-pick>, nothing changes until the choice is made: an hour only marks itself, and picking
// the minutes closes the panel and sends `change`. It has `value` ('HH:MM', 24-hour) and `disabled`; shown in the site's
// own "7:30 pm". The panel hangs from document.body, outside the sticky bar. Tab moves through the
// buttons, Enter picks, Escape closes. Styles are the calendar's (.dp-*, in tracker.css).

const VALID = /^([01]\d|2[0-3]):([0-5]\d)$/;
const pad = n => String(n).padStart(2, '0');
const hourName = h => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
const clock = (h, m) => `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`;
const ICON = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let openOne = null;   // only one panel open at a time

// (on the server, while pages are prerendered, there's no HTMLElement: the class is defined but never registered)
class TimePick extends (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) {
  static observedAttributes = ['value', 'disabled', 'title'];
  constructor() { super(); this._v = ''; this._pop = null; this._h = 0; }
  connectedCallback() {
    // a property set before the element was defined sits on the instance: move it onto the accessor
    for (const k of ['value', 'disabled']) if (Object.hasOwn(this, k)) { const v = this[k]; delete this[k]; this[k] = v; }
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
    else this.value = v ?? '';
  }
  get value() { return this._v; }
  set value(v) { this._v = VALID.test(v || '') ? v : ''; this._sync(); }
  get disabled() { return !!this._off; }
  set disabled(v) { this._off = !!v; if (this._btn) this._btn.disabled = this._off; if (this._off) this.close(false); }
  focus(o) { this._btn?.focus(o); }

  _sync() {
    if (!this._btn) return;
    const m = VALID.exec(this._v), text = m ? clock(+m[1], +m[2]) : '';
    this.querySelector('.dp-txt').textContent = text;
    this._btn.disabled = !!this._off;
    const label = this.getAttribute('aria-label') || 'Time';
    this._btn.setAttribute('aria-label', text ? `${label}: ${text}. Choose a time` : `${label}. Choose a time`);
    if (this.title) this._btn.title = this.title;
  }
  open() {
    if (this._off || this._pop) return;
    if (openOne && openOne !== this) openOne.close(false);
    openOne = this;
    const m = VALID.exec(this._v);
    this._h = m ? +m[1] : 0;
    const pop = document.createElement('div');
    pop.className = 'dp-pop tp-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Choose a time');
    pop.addEventListener('click', e => this._click(e));
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); } });
    document.body.appendChild(pop);
    this._pop = pop;
    this._btn.setAttribute('aria-expanded', 'true');
    this._draw();
    this._place();
    pop.querySelector('.tp-h.sel')?.focus();
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
    const r = this._btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, gap = 8;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - gap && r.top - h - 6 > gap) top = r.top - h - 6;
    pop.style.left = `${Math.max(gap, Math.min(r.left, window.innerWidth - w - gap))}px`; pop.style.top = `${top}px`;
  }
  _draw() {
    const m = VALID.exec(this._v), mm = m ? +m[2] : -1;
    let hours = '', mins = '';
    for (let h = 0; h < 24; h++) hours += `<button type="button" class="tp-h${h === this._h ? ' sel' : ''}" data-h="${h}" aria-pressed="${h === this._h}">${hourName(h)}</button>`;
    for (let k = 0; k < 60; k += 5) mins += `<button type="button" class="tp-m${m && +m[1] === this._h && k === mm ? ' sel' : ''}" data-m="${k}" aria-label="${clock(this._h, k)}">:${pad(k)}</button>`;
    this._pop.innerHTML = `<div class="dp-cap">Hour</div><div class="tp-hours">${hours}</div><div class="dp-cap">Minutes</div><div class="tp-mins">${mins}</div>`;
  }
  _click(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.h != null) {   // an hour only marks itself: nothing changes until the minutes are picked
      this._h = +b.dataset.h;
      this._draw();
      this._pop.querySelector('.tp-h.sel')?.focus();
      return;
    }
    const v = `${pad(this._h)}:${pad(+b.dataset.m)}`, changed = v !== this._v;
    this._v = v; this._sync();
    this.close();
    if (changed) this.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('time-pick')) customElements.define('time-pick', TimePick);
