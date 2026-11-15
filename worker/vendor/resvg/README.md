# resvg-wasm

`index.mjs` and `index_bg.wasm` are [@resvg/resvg-wasm](https://www.npmjs.com/package/@resvg/resvg-wasm) 2.6.2, unchanged,
copied from its npm package. The Worker draws record preview images with it (`worker/og.js`). It lives here, not in
a `package.json`, because Cloudflare's build installs only the site's packages; wrangler bundles `index_bg.wasm` as a
compiled WebAssembly module (Workers can't compile WebAssembly at run time).

Licence: MPL-2.0 (https://github.com/thx/resvg-js, https://mozilla.org/MPL/2.0/). To update, copy the same two files
from a newer version and run the Worker tests.
