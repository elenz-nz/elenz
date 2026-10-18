<script lang="ts">
	// What the site collects. Keep it true to the code: Cloudflare Web Analytics (app.html), the browser storage keys
	// (elenz-theme, elenz-view, elenz-prices, elenz-gen-lower, and the tracker's per-tab sessionStorage), fonts bundled
	// with the site, the email setup (Cloudflare Email Routing to Gmail, replies through Brevo). Change the date when
	// any of that changes.
	import Preview from '#lib/site/Preview.svelte';
	const DESC = 'What Elenz collects: no cookies, no ads, no trackers; a count of visits, and your email only if you write in.';
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
		<p class="mt-lede">Elenz doesn’t ask who you are. It uses no cookies, shows no ads and has no trackers. It counts visits, and it has your email address only if you write in.</p>
		<p class="mt-meta">Updated 18 October 2026</p>
	</header>

	<div class="mt-body">
		<h2 id="visits">Counting visits</h2>
		<p>Elenz uses Cloudflare Web Analytics to count visits: which pages are viewed, the site a visitor came from, their country, and the kind of browser and device. It uses no cookies and doesn’t follow anyone from site to site. Elenz sees only totals, never individual visitors.</p>

		<h2 id="browser">What stays in your browser</h2>
		<p>So the site opens the way you left it, your browser remembers your light or dark choice, and your last region, range, interval and chart settings on the tracker. These are kept in your browser’s own storage, never sent anywhere, and you can remove them by clearing this site’s data in your browser.</p>

		<h2 id="hosting">Hosting</h2>
		<p>The site runs on Cloudflare. Like any web host, Cloudflare handles your IP address to deliver pages and protect the site from attacks. Elenz doesn’t store visitors’ IP addresses. Everything the pages need, including their fonts, comes from elenz.co.nz itself; the only other request is Cloudflare’s visit counter.</p>

		<h2 id="email">If you email Elenz</h2>
		<p>Messages to hello@elenz.co.nz are kept in Elenz’s email account so they can be answered. Your address isn’t shared with anyone or added to any mailing list. Replies are sent through Brevo, an email service, which records whether a reply was opened. Ask, and your messages will be deleted.</p>

		<h2 id="elsewhere">Other sites</h2>
		<p>Links out of Elenz, such as Buy Me a Coffee, GitHub and the Electricity Authority, go to sites with their own privacy policies. If you buy Elenz a coffee, the payment is handled entirely by Buy Me a Coffee, and Elenz sees only what it shows creators, such as any name and message you choose to leave.</p>

		<h2 id="questions">Questions</h2>
		<p>To ask what Elenz holds about you, or to have it removed, email <a href="mailto:hello@elenz.co.nz">hello@elenz.co.nz</a>. New Zealand’s Privacy Act 2020 applies.</p>
	</div>
</main>
