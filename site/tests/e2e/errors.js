// Page errors the browser tests let pass: neither is a fault in the site.
// - "ResizeObserver loop": a browser notice that a resize took more than one frame to settle.
// - WebKit reports a load cut off by the next navigation (a test's page.goto, a refresh) as a page error: a data file
//   ("... due to access control checks"), a route's CSS that SvelteKit was preloading ("Unable to preload CSS for ...")
//   or its script ("Importing a module script failed"). Test report, 19 Nov 2026: the last two failed the ?exclude-me
//   test on WebKit on several pull requests, on files that were there. They're let pass on WebKit only, so Chromium and
//   Firefox still catch a missing file.
export const OK_ERRORS = /ResizeObserver loop/;
export const WEBKIT_CANCELLED = /ResizeObserver loop|access control checks|Unable to preload CSS|Importing a module script failed/;
