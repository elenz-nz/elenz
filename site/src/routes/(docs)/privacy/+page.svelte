<script lang="ts">
	// What the site collects. Keep it true to the code: Cloudflare Web Analytics and Umami (app.html) with Umami's events
	// (#lib/site/track.js), the heartbeat from Now and the dashboards (#lib/site/beat.js, worker/index.js), the browser storage keys
	// (elenz-theme, elenz-view, elenz-prices, elenz-gen-lower, elenz-awake, elenz-dashboard, elenz-landscape, umami.disabled from ?exclude-me in app.html, and the tracker's per-tab sessionStorage), fonts bundled
	// with the site, the email setup (Cloudflare Email Routing to Gmail, replies through Brevo). Change the date when
	// any of that changes.
	import Preview from '#lib/site/Preview.svelte';
	const DESC = 'What Elenz collects: no cookies, no ads, no trackers; a count of visits, and your email only if you write to us.';
</script>

<svelte:head>
	<title>Privacy · ELENZ</title>
	<meta name="description" content={DESC} />
	<Preview title="Privacy · ELENZ" description={DESC} path="/privacy" />
</svelte:head>

<main class="mt-page" aria-labelledby="mt-h">
	<header class="mt-head">
		<p class="mt-kicker">Elenz</p>
		<h1 id="mt-h">Privacy</h1>
		<p class="mt-lede">We don’t ask who you are. Elenz uses no cookies, shows no ads and has no trackers. We count visits, and we have your email address only if you write to us.</p>
		<p class="mt-meta">Updated 23 November 2026</p>
	</header>

	<div class="mt-body">
		<h2 id="visits">Counting visits</h2>
		<p>Elenz counts visits with two services, Cloudflare Web Analytics and Umami. They record which pages are viewed, the site a visitor came from, their country, and the kind of browser and device; Umami also records how long a page stays open. Neither uses cookies or follows anyone from site to site. Umami uses your IP address only to work out your country, and doesn’t store it. We see only totals, never individual visitors. Umami also counts a few clicks, such as opening a wall-screen link, changing a dashboard’s layout, or the Support Elenz and Report a problem links. If your browser is set to send Do Not Track, Umami doesn’t count your visit.</p>
		<p id="screens">The Now page, the dashboard and the power landscape are often left open on a screen, which visit counters can’t see. While one is open, it tells our host, Cloudflare, every 5 minutes that it is still open: which of the three pages it is, whether it’s on screen or hidden, whether it came from a wall-screen link, and how many minutes it has been open. Each opened page gets a random number, forgotten when it closes, so we can tell how long a screen stays open but not whose it is; Cloudflare adds your country. Nothing is kept in your browser, and nothing is sent if your browser sends Do Not Track or you’ve opted out (below).</p>
		<p id="opt-out">To leave your browser out of Umami’s counts and the screen count, open <a href="/?exclude-me" data-sveltekit-reload>elenz.co.nz/?exclude-me</a>. Your browser then keeps a note, <code>umami.disabled</code>, that both of them check; to be counted again, open <a href="/?include-me" data-sveltekit-reload>elenz.co.nz/?include-me</a>. Cloudflare Web Analytics still counts the visit, as part of its totals.</p>

		<h2 id="browser">What stays in your browser</h2>
		<p>So the site opens the way you left it, your browser remembers your light or dark choice, your last region, range, interval and chart settings on the tracker, whether you asked a page to keep the screen on, the layout you chose for the dashboard, the view you chose for the power landscape, and whether you asked not to be counted. These are kept in your browser’s own storage, never sent anywhere, and you can remove them by clearing this site’s data in your browser.</p>

		<h2 id="hosting">Hosting</h2>
		<p>The site runs on Cloudflare. Like any web host, Cloudflare handles your IP address to deliver pages and protect the site from attacks. We don’t store visitors’ IP addresses. Everything the pages need, including their fonts, comes from elenz.co.nz itself; the only other requests are the two visit counters, Cloudflare’s and Umami’s, and the maps below.</p>
		<p id="maps">The map on the Plants page, and the Map view on a plant’s page (opened from its Location tab), draw their map tiles, style and satellite imagery from LINZ Basemaps, run by Toitū Te Whenua Land Information New Zealand (LINZ). Your browser asks LINZ’s servers for them when the map opens, so LINZ sees your IP address and the part of the country you are looking at, as any web server would. LINZ has its own privacy policy. The aerial pictures on a plant’s page are our own copies and make no request to LINZ.</p>

		<h2 id="email">If you email us</h2>
		<p>Messages to hello@elenz.co.nz are kept in our email account so we can answer them. Your address isn’t shared with anyone or added to any mailing list. Replies are sent through Brevo, an email service, which records whether a reply was opened. Ask, and we’ll delete your messages.</p>

		<h2 id="elsewhere">Other sites</h2>
		<p>Links out of Elenz, such as Buy Me a Coffee, GitHub and the Electricity Authority, go to sites with their own privacy policies. If you support Elenz, the payment is handled entirely by Buy Me a Coffee, and we see only what it shows creators, such as any name and message you choose to leave.</p>

		<h2 id="questions">Questions</h2>
		<p>To ask what we hold about you, or to have it removed, email <a href="mailto:hello@elenz.co.nz">hello@elenz.co.nz</a>. New Zealand’s Privacy Act 2020 applies.</p>
	</div>
</main>
