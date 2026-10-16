// Where things sit on the island map (viewBox coordinates of nzmap.js), shared by the Now page and its preview on
// the landing page.
import { PTS } from './nzmap.js';

// Each island's ring sits on its point furthest from the coast (so the ring stays on land, centred in the island),
// the South Island's nudged south-west to clear the HVDC line out of Benmore. Found with shapely against the outlines
// in nzmap.js (Oct 2026): rings of radius 40 keep ~45 px from the coast and the South Island's ~15 px from the line.
export const RING = { NI: { x: 318, y: 202 }, SI: { x: 84, y: 516 } };
export const RING_R = 40;

// HVDC route: Benmore, up the east of the South Island to the Cook Strait cable, then Haywards
const [bx, by] = PTS.ben, [hx, hy] = PTS.hay;
const c1 = [bx + 60, by - 40], c2 = [hx - 40, hy + 70];
export const HV = { ben: { x: bx, y: by }, hay: { x: hx, y: hy } };
export const HV_PATH = `M${bx},${by} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${hx},${hy}`;
export const HV_MID = { x: (bx + 3 * c1[0] + 3 * c2[0] + hx) / 8, y: (by + 3 * c1[1] + 3 * c2[1] + hy) / 8 };
