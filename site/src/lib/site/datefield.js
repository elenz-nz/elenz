// A date box that moves the view once the date is settled. Browsers fire `change` on a date input at every step of
// typing or arrow-keying: entering a year digit by digit gives 0002, 0020, 0201, 2015, and holding the up arrow on
// the year steps through every year between, so each one loaded and drew in turn. A date picked with the mouse
// applies at once; one being typed waits until the keys stop for a moment, Enter is pressed or the box loses focus,
// and a year before the data starts (part way through typing it) is never applied. The tracker's date boxes are now
// <date-pick> (#lib/site/datepick.js), which changes only when a day is picked; the typing rules still serve the time box.
const FIRST_YEAR = 1997;
const SETTLE = 700;   // ms after the last key

const validDate = v => { const m = /^(\d{4})-\d{2}-\d{2}$/.exec(v); return !!m && +m[1] >= FIRST_YEAR && +m[1] <= new Date().getFullYear() + 1; };
const validTime = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Call apply(value) with each settled 'YYYY-MM-DD' value of the date input el. Returns a function that detaches. */
export const onDateSettled = (el, apply) => onSettled(el, apply, validDate);
/** The same for a time input ('HH:MM'): typing the hour then the minutes applies once, not at each digit. */
export const onTimeSettled = (el, apply) => onSettled(el, apply, validTime);

function onSettled(el, apply, valid) {
  let timer = null, lastKey = 0, done = el.value;
  const go = () => {
    clearTimeout(timer); timer = null;
    const v = el.value;
    if (v === done || !valid(v)) return;
    done = v; apply(v);
  };
  // <date-pick> (#lib/site/datepick.js) only changes when a day is picked, so it applies at once
  const picker = el.localName === 'date-pick';
  const onChange = () => {
    clearTimeout(timer);
    if (!picker && Date.now() - lastKey < 1000) timer = setTimeout(go, SETTLE); else go();
  };
  const onKey = e => { if (e.key === 'Enter') go(); else lastKey = Date.now(); };
  el.addEventListener('change', onChange);
  el.addEventListener('keydown', onKey);
  el.addEventListener('blur', go);
  const onFocus = () => { done = el.value; };   // the view may have moved since (arrows, Latest)
  el.addEventListener('focus', onFocus);
  return {
    /** The view moved for another reason: its new date isn't a pending choice. */
    set(v) { done = v; },
    destroy() { clearTimeout(timer); el.removeEventListener('change', onChange); el.removeEventListener('keydown', onKey); el.removeEventListener('blur', go); el.removeEventListener('focus', onFocus); },
  };
}

/** The same as a Svelte action: <input type="date" use:dateSettled={pick} />. */
export function dateSettled(node, apply) {
  let fn = apply;
  const h = onDateSettled(node, v => fn(v));
  return { update(a) { fn = a; }, destroy: h.destroy };
}

/** A time input's: <input type="time" use:timeSettled={pick} />. */
export function timeSettled(node, apply) {
  let fn = apply;
  const h = onTimeSettled(node, v => fn(v));
  return { update(a) { fn = a; }, destroy: h.destroy };
}
