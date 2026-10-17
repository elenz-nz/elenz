// Keeps --tb-h on the page root equal to the control bar's height, so things that stick below the bar (the
// Generation tab's summary panel) clear it as it wraps or changes size. Use on the bar: <nav use:barHeight>.
export function barHeight(node) {
  const set = () => document.documentElement.style.setProperty('--tb-h', `${Math.ceil(node.getBoundingClientRect().height)}px`);
  const ro = new ResizeObserver(set);
  ro.observe(node);
  set();
  return { destroy() { ro.disconnect(); document.documentElement.style.removeProperty('--tb-h'); } };
}
