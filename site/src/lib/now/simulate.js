// Preview links only: /now?sim=high shows the price explainer as it would look at a price that may not come along
// during testing (test report NOW-08). It changes the prices in this visitor's copy of tracker.json, and
// the page says so. The live site never loads this file (see load() in the /now page).
//   sim=up     prices up: highlighted            sim=high   an extreme: the card opens by itself
//   sim=split  the islands split: highlighted    sim=apart  a smaller gap at low prices: said, not highlighted
//   sim=jump   a short jump that has passed      sim=low    a new low
export const SIMS = ['up', 'high', 'split', 'apart', 'jump', 'low'];

export function simulate(D, kind) {
  const E = D.explain, hay = D.NI.price, ben = D.SI.price, J = D.N - 1, n = 24;   // the last two hours of 5-minute prices
  const set = (h, b, from, to) => {
    for (let j = from; j <= to; j++) { hay[j] = h; ben[j] = b; }
  };
  // a plain week at $60 first, so what's really happening doesn't carry over the 30-minute hold or the "for 21 hours"
  set(60, 57, 0, J);
  if (E?.typ) {
    E.typ.med = E.typ.med.map(() => 60); E.typ.p25 = E.typ.p25.map(() => 45); E.typ.p75 = E.typ.p75.map(() => 80);
    E.level = 50;
  }
  if (kind === 'up') set(260, 244, J - n, J);
  if (kind === 'high') set(1240, 1190, J - n, J);
  if (kind === 'split') set(150, 60, J - n, J);
  if (kind === 'apart') set(70, 45, J - n, J);
  if (kind === 'jump') set(420, 395, J - 8, J - 6);
  if (kind === 'low') set(1.5, 1.2, J - n, J);
  return D;
}
