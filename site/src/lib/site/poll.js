// When the pages look for new live data (/data/tracker.json).
//
// Each 5-minute interval reaches tracker.json about 1–2 minutes after it starts (sometimes much later, when the EMI
// API lags), so the next one is due about 6½ minutes after the start of the newest interval. Pages check every
// minute while on screen, but only fetch once data is due; after that, every minute until it arrives. Those repeat
// checks are cheap: the browser sends the version it has (ETag) and the Worker answers 304 Not Modified, no body.
//
// The wait is also capped at 5 minutes after the last fetch, by the viewer's own clock, so a device whose clock runs
// slow still gets each update.

const DUE_AFTER = 6.5 * 60_000; // after the newest interval's start
const MAX_WAIT = 5 * 60_000; // after the last fetch
export const CHECK_EVERY = 60_000;

/** Time (ms, viewer's clock) from which to fetch again, given the newest interval's start (`meta.end`). */
export const nextDue = (end, fetchedAt = Date.now()) => Math.min(end + DUE_AFTER, fetchedAt + MAX_WAIT);
