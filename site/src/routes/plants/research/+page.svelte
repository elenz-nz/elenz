<script lang="ts">
	// The plant research page (/plants/research): private, for the Elenz team (design decision, 17 Nov 2026). It replaces
	// the retired research workbook, built from the same plant files as the pages, so what the team reviews is what the
	// site will publish: every plant's state, filters for what still needs work, each plant's facts with their source,
	// grade and date checked (other sources' values beneath), the leads files, and the whole lot as an Excel workbook.
	// Data: src/lib/plants/research.json (ingest/plant_research.py). On elenz.co.nz the Worker serves it only with the
	// key (worker/index.js, research). Each plant also has the team's own notes, saved through the Worker in KV, not in
	// the repository (#lib/plants/notes.js, worker/notes.js). Every link opens in a new tab (newTabs), so the page's
	// filters and open plant stay put. docs/architecture.md, Plant pages (the research page).
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { replaceState } from '$app/navigation';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import { save } from '#lib/site/download.js';
	import { islandName, fuelOf } from '#lib/plants/registry.js';
	import { fmtMw } from '#lib/plants/history.js';
	import { slug } from '#lib/site/viewurl.js';
	import { DEFAULTS, NEEDS, LOC, STATUS, ROUNDS, LEAD_GROUPS, fuelsOf, fuelName, ownersOf, readSettings, writeSettings, filtered, needCounts, pick, progress, workbook, leadKey, leadCounts, leadTechs, pickLeads, type Settings } from '#lib/plants/research.js';
	import { xlsx, XLSX_TYPE } from '#lib/plants/xlsx.js';
	import { keyOf, loadNotes, saveNote, dateStamp, savedAt, PROBLEMS, MAX_NOTE, type Note, type NotesProblem } from '#lib/plants/notes.js';
	import { newTabs } from '#lib/site/newtabs.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const d = $derived(data.d as any);
	// the team's notes, joined in for the "Has team notes" filter and the table's mark
	let notes = $state<Record<string, Note>>({});
	const plants = $derived((d.plants as any[]).map((p) => ({ ...p, my_note: notes[p.slug]?.text ?? '' })));
	const sources = $derived(d.sources as Record<string, any>);
	const REPO = 'https://github.com/elenz-nz/elenz/blob/main/facilities';

	let s = $state<Settings>({ ...DEFAULTS });
	let ready = false;
	let busy = $state(false);

	const prog = $derived(progress(plants));
	const base = $derived(filtered(plants, s));
	const counts = $derived(needCounts(base));
	const rows = $derived(pick(plants, s));
	const fuels = $derived(fuelsOf(plants));
	const owners = $derived(ownersOf(plants));
	const narrowed = $derived(!!(s.fuel || s.island || s.owner || s.status || s.need || s.text.trim()));
	const leadsOf = $derived(Object.fromEntries((d.photo_leads as any[]).map((r) => [r.id, r])));
	const pct = (a: number, b: number) => (b ? (100 * a) / b : 0);
	const mw = (v: number | null) => (v == null ? '–' : fmtMw(v));
	const osmUrl = (x: string) => `https://www.openstreetmap.org/${x}`;

	// ---------- station leads: the stations without a page (the research round after the first pass) ----------
	// Filters live on the page only (not in the address); each lead opens to every field and its own team notes,
	// kept with the plants' under lead-<id> (design decision, 23 Nov 2026).
	const leads = $derived(d.station_leads as any[]);
	let lf = $state({ group: 'todo', tech: '', text: '' });
	let leadOpen = $state('');
	const leadNums = $derived(leadCounts(leads));
	const leadRows = $derived(pickLeads(leads, lf));
	const techs = $derived(leadTechs(leads));
	const groupOf: Record<string, { name: string, what: string }> = Object.fromEntries(LEAD_GROUPS.map(([k, name, what]) => [k, { name, what }]));
	const plantName = $derived(Object.fromEntries(plants.map((p) => [p.slug, p.name])));
	const urls = (x: string) => (x.match(/https?:\/\/\S+/g) ?? []);
	const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
	const toggleLead = (id: string) => { leadOpen = leadOpen === id ? '' : id; };
	const leadNoted = (id: string) => !!notes[leadKey(id)]?.text || dirty(leadKey(id));

	// ---------- the team's notes ----------
	// notesState: loading, ready, or why they can't be read. drafts: what's typed and not yet saved, by plant.
	let notesState = $state<'loading' | 'ready' | NotesProblem>('loading');
	let drafts = $state<Record<string, string>>({});
	let saving = $state<Record<string, boolean>>({});
	let noteErr = $state<Record<string, string>>({});
	let clash = $state<Record<string, Note | null | undefined>>({});   // another device saved since: what it saved
	let key = '';
	const textOf = (slug: string) => drafts[slug] ?? notes[slug]?.text ?? '';
	const dirty = (slug: string) => slug in drafts && drafts[slug].replace(/\s+$/, '') !== (notes[slug]?.text ?? '');
	const unsaved = $derived(Object.keys(drafts).filter(dirty));

	async function readNotes() {
		notesState = 'loading';
		const r = await loadNotes(key);
		if (r.ok) { notes = r.notes; notesState = 'ready'; } else notesState = r.problem;
	}
	async function saveFor(slug: string, base?: number | null | 'any') {
		if (notesState !== 'ready' || saving[slug] || !dirty(slug)) return;
		saving[slug] = true;
		noteErr[slug] = '';
		const r = await saveNote(key, slug, drafts[slug], base ?? notes[slug]?.at ?? null);
		saving[slug] = false;
		if (r.ok) {
			const { [slug]: _, ...rest } = notes;
			notes = r.note.text ? { ...notes, [slug]: r.note } : rest;
			if ((drafts[slug] ?? '').replace(/\s+$/, '') === r.note.text) delete drafts[slug];
			delete clash[slug];
		} else if ('conflict' in r) clash[slug] = r.conflict;
		else noteErr[slug] = r.error;
	}
	// another device saved first: take theirs (dropping what was typed here), or save this one over it
	function useTheirs(slug: string) {
		const theirs = clash[slug];
		const { [slug]: _, ...rest } = notes;
		notes = theirs ? { ...notes, [slug]: theirs } : rest;
		delete drafts[slug];
		delete clash[slug];
	}
	const keepMine = (slug: string) => saveFor(slug, 'any');
	function stamp(slug: string, area: HTMLTextAreaElement | null) {
		const text = textOf(slug), add = (text && !text.endsWith('\n') ? '\n' : '') + dateStamp();
		drafts[slug] = text + add;
		requestAnimationFrame(() => { if (area) { area.focus(); area.setSelectionRange(area.value.length, area.value.length); } });
	}
	const areas: Record<string, HTMLTextAreaElement | null> = {};
	function keys(e: KeyboardEvent, slug: string) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveFor(slug); }
	}
	beforeNavigate((nav) => { if (unsaved.length && nav.type !== 'leave' && !confirm('Leave with notes not saved?')) nav.cancel(); });

	onMount(() => {
		s = readSettings(location.search, plants);
		ready = true;
		key = keyOf(location.search);
		readNotes();
		// closing the tab with a note not yet saved: the browser asks first
		const warn = (e: BeforeUnloadEvent) => { if (unsaved.length) { e.preventDefault(); e.returnValue = ''; } };
		addEventListener('beforeunload', warn);
		return () => removeEventListener('beforeunload', warn);
	});
	// keep the address in step with the settings, keeping its key (replace, so Back leaves the page)
	$effect(() => {
		const qs = writeSettings(s, location.search);
		if (!ready || qs === location.search || (!qs && !location.search)) return;
		const url = location.pathname + qs + location.hash;
		Promise.resolve().then(() => replaceState(url, {})).catch(() => history.replaceState(history.state, '', url));
	});

	const natural = (by: string) => ['name', 'fuel', 'island', 'owner'].includes(by);
	function sortBy(by: string) {
		if (s.by === by) s.asc = !s.asc;
		else { s.by = by; s.asc = natural(by); }
	}
	const ariaSort = (by: string) => (s.by === by ? (s.asc ? 'ascending' : 'descending') : 'none');
	const mark = (by: string) => (s.by === by ? (s.asc ? '↑' : '↓') : '');
	const reset = () => { s = { ...DEFAULTS, open: s.open }; };
	const toggle = (k: string) => { s.open = s.open === k ? '' : k; };
	const differs = (e: any, a: any) => a.value.trim().toLowerCase() !== e.value.trim().toLowerCase();

	// the workbook is built just after the button has shown "Preparing", so the click answers at once
	function download() {
		busy = true;
		setTimeout(() => {
			try {
				const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
				save(new Blob([xlsx(workbook(d, notes))], { type: XLSX_TYPE }), `elenz-plant-research-${day}.xlsx`);
			} finally {
				busy = false;
			}
		}, 30);
	}
</script>

<svelte:head>
	<title>Plant research · ELENZ</title>
	<meta name="robots" content="noindex" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

{#snippet srcs(ids: string[])}{#each ids as id, i (id)}{i ? '; ' : ''}{#if sources[id]?.url}<a href={sources[id].url}>{sources[id].title || id}</a>{:else}{sources[id]?.title || id}{/if}{#if sources[id]?.kind === 'research'}<span class="tag">research only</span>{/if}{/each}{/snippet}

{#snippet teamNotes(slug: string)}
	<div class="mine">
		<h3><label for="note-{slug}">Team notes</label> <span class="quiet">private: kept by the Worker, not in the repository; Ctrl+Enter or leaving the box saves</span></h3>
		{#if notesState === 'ready'}
			<textarea id="note-{slug}" bind:this={areas[slug]} rows="4" maxlength={MAX_NOTE} spellcheck="true"
				placeholder="Anything to remember: questions, leads, research updates…"
				value={textOf(slug)} oninput={(e) => (drafts[slug] = e.currentTarget.value)}
				onblur={() => saveFor(slug)} onkeydown={(e) => keys(e, slug)}></textarea>
			<div class="note-bar">
				<button type="button" class="btn" onclick={() => saveFor(slug)} disabled={!dirty(slug) || saving[slug]}>{saving[slug] ? 'Saving…' : 'Save'}</button>
				<button type="button" class="btn quietbtn" onmousedown={(e) => e.preventDefault()} onclick={() => stamp(slug, areas[slug])}>Add today’s date</button>
				<span class="quiet" role="status">{#if noteErr[slug]}<span class="err">{noteErr[slug]}</span>{:else if dirty(slug)}Not saved yet{:else if notes[slug]}{savedAt(notes[slug].at)}{/if}</span>
			</div>
			{#if clash[slug] !== undefined}
				<div class="clash" role="alert">
					<p>{clash[slug] ? `Another device saved this note (${savedAt(clash[slug]!.at)}) since this page read it:` : 'Another device emptied this note since this page read it.'}</p>
					{#if clash[slug]}<blockquote>{clash[slug]!.text}</blockquote>{/if}
					<p><button type="button" class="btn" onclick={() => useTheirs(slug)}>Use that one</button> <button type="button" class="btn" onclick={() => keepMine(slug)}>Save mine over it</button></p>
				</div>
			{/if}
		{:else if notesState === 'loading'}
			<p class="quiet">Reading the notes…</p>
		{:else}
			<p class="quiet">{PROBLEMS[notesState]} {#if notesState === 'error'}<button type="button" class="btn" onclick={readNotes}>Try again</button>{/if}</p>
		{/if}
	</div>
{/snippet}

<div class="wrap" use:newTabs>
	<Masthead />

	<main class="res">
		<div class="head">
			<h1>Plant research</h1>
			<p class="sub">Private, for the Elenz team. Built from the plant files in the repository, so it shows exactly what the plant pages will publish: a fact appears on its page once it has a date checked, a grade A or B and public sources. <a href="{REPO}/PLANTS.md">How to check a plant</a></p>
		</div>

		<ol class="panel rounds" aria-label="Research rounds">
			{#each ROUNDS as [name, what, state] (name)}
				<li class={state}><span class="r-state">{state === 'done' ? 'Done' : state === 'now' ? 'Now' : 'Next'}</span> <strong>{name}</strong> <span class="quiet">{what}</span></li>
			{/each}
		</ol>

		<div class="cards">
			{#each [['Pages reviewed', prog.reviewed, prog.plants], ['Facts checked', prog.checked, prog.facts], ['Locations checked', prog.located, prog.plants], ['With a photo', prog.photos, prog.plants]] as [k, a, b] (k)}
				<div class="panel card">
					<span class="k">{k}</span>
					<span class="v num">{a} <small>of {b}</small></span>
					<span class="bar"><span style="width:{pct(+a, +b)}%"></span></span>
				</div>
			{/each}
			<div class="panel card">
				<span class="k">Stations to research</span>
				<span class="v num">{leadNums.todo} <small>of {leads.length} leads</small></span>
				<span class="v small"><a href="#leads-h">Station leads</a></span>
			</div>
			<div class="panel card">
				<span class="k">Still to do</span>
				<span class="v small">{prog.todo} with something to check</span>
				<span class="v small">{prog.disagree} where sources disagree</span>
			</div>
		</div>

		<div class="panel ctl">
			<div class="row">
				<label class="lab">Fuel
					<select bind:value={s.fuel}><option value="">All fuels</option>{#each fuels as f (f.k)}<option value={f.k}>{f.name}</option>{/each}</select>
				</label>
				<div class="seg" role="group" aria-label="Island">
					{#each [['', 'Both islands'], ['NI', 'North'], ['SI', 'South']] as [k, name] (k)}
						<button type="button" aria-pressed={s.island === k} onclick={() => (s.island = k)}>{name}</button>
					{/each}
				</div>
				<label class="lab">Owner
					<select bind:value={s.owner}><option value="">All owners</option>{#each owners as o (o)}<option value={slug(o)}>{o}</option>{/each}</select>
				</label>
				<label class="lab">Status
					<select bind:value={s.status}><option value="">Any</option>{#each Object.entries(STATUS) as [k, name] (k)}<option value={k}>{name}</option>{/each}</select>
				</label>
			</div>
			<div class="row">
				<label class="lab need">Needs
					<select bind:value={s.need}><option value="">Show all</option>{#each NEEDS as [k, name] (k)}<option value={k}>{name} ({counts[k]})</option>{/each}</select>
				</label>
				<label class="lab find">Find
					<input type="search" placeholder="Plant name" bind:value={s.text} maxlength="40" autocomplete="off" />
				</label>
				{#if narrowed}<button type="button" class="btn" onclick={reset}>Clear</button>{/if}
				<button type="button" class="btn dl" onclick={download} disabled={busy}>{busy ? 'Preparing…' : 'Download workbook (.xlsx)'}</button>
			</div>
		</div>

		<section class="panel tbl" aria-labelledby="tbl-h">
			<div class="p-head">
				<h2 id="tbl-h">{rows.length} of {plants.length} plants</h2>
				<span class="quiet">Tap a plant for its facts and sources.</span>
			</div>
			<div class="scroll">
				<table>
					<thead>
						<tr>
							{#each [['name', 'Plant', ''], ['fuel', 'Fuel', 'w'], ['island', 'Island', 'w'], ['owner', 'Owner', 'w'], ['mw', 'MW', 'n'], ['facts', 'Checked', 'n'], ['todo', 'To check', 'n']] as [k, name, cls] (k)}
								<th scope="col" class={cls} aria-sort={ariaSort(k)}><button type="button" onclick={() => sortBy(k)} data-sort={mark(k)}>{name}</button></th>
							{/each}
							<th scope="col" class="w">Location</th>
							<th scope="col" class="w">Photo</th>
							<th scope="col" class="w">Disagree</th>
							<th scope="col" class="w" aria-sort={ariaSort('reviewed')}><button type="button" onclick={() => sortBy('reviewed')} data-sort={mark('reviewed')}>Reviewed</button></th>
						</tr>
					</thead>
					<tbody>
						{#each rows as p (p.slug)}
							<tr class:on={p.slug === s.open} class:shut={p.status === 'closed'}>
								<td class="c-name"><span class="sw" style="--c:var({fuelOf(p.fuel).tok})" title={fuelName(p.fuel)}></span><button type="button" class="open" aria-expanded={p.slug === s.open} onclick={() => toggle(p.slug)}>{p.name}</button>{#if p.my_note || dirty(p.slug)}<span class="has-note" title={dirty(p.slug) ? 'Team notes not saved yet' : 'Has team notes'} class:unsaved={dirty(p.slug)}>✎</span>{/if}</td>
								<td class="w">{fuelName(p.fuel)}</td>
								<td class="w">{p.island ? islandName(p.island).replace(' Island', '') : '–'}</td>
								<td class="w">{p.owner}</td>
								<td class="n">{mw(p.mw)}</td>
								<td class="n" class:all={p.facts && p.checked === p.facts}>{p.checked}/{p.facts}</td>
								<td class="n" class:zero={!p.to_check.length}>{p.to_check.length}</td>
								<td class="w loc {p.loc}">{LOC[p.loc as keyof typeof LOC]}</td>
								<td class="w">{p.images.length ? 'Yes' : p.photo_leads.length ? `${p.photo_leads.length} lead${p.photo_leads.length > 1 ? 's' : ''}` : '–'}</td>
								<td class="w">{p.disagree.join(', ') || '–'}</td>
								<td class="w num">{p.reviewed || '–'}</td>
							</tr>
							{#if p.slug === s.open}
								<tr class="more"><td colspan="11">
									<div class="detail">
										<p class="links">
											<a href="/plants/{p.slug}">Plant page</a>
											<a href="{REPO}/plants/{p.slug}.toml">Plant file</a>
											{#if p.wikidata}<a href="https://www.wikidata.org/wiki/{p.wikidata}">Wikidata {p.wikidata}</a>{/if}
											{#each p.osm as x (x)}<a href={osmUrl(x)}>OpenStreetMap {x}</a>{/each}
											{#if p.plant}<a href="/tracker?fuel={p.fuel}&plant={slug(p.plant)}">Tracker</a>{/if}
										</p>
										<p class="quiet">{STATUS[p.status as keyof typeof STATUS]}{p.scheme && p.scheme !== p.name ? ` · ${p.scheme} scheme` : ''}{p.register.length ? ` · register ${p.register.join(', ')}` : ''} · {p.reviewed ? `reviewed ${p.reviewed}` : 'not reviewed yet'}</p>
										{#if p.to_check.length}
											<div><h3>To check</h3><ul>{#each p.to_check as t, i (i)}<li>{t}</li>{/each}</ul></div>
										{/if}
										{@render teamNotes(p.slug)}
										{#if p.notes.length}
											<div><h3>Research notes <span class="quiet">(from the plant file)</span></h3><ul>{#each p.notes as t, i (i)}<li>{t}</li>{/each}</ul></div>
										{/if}
										<div class="facts">
											<h3>Facts</h3>
											<table>
												<thead><tr><th>Fact</th><th>Value</th><th>Source</th><th>Grade</th><th>Checked</th></tr></thead>
												<tbody>
													{#each p.entries as e, i (i)}
														<tr class:pub={e.published}>
															<td class="fk">{e.label}</td>
															<td>{e.value || '(empty)'}{#if e.note}<span class="note">{e.note}</span>{/if}</td>
															<td>{@render srcs(e.source)}</td>
															<td class="g g{e.grade}">{e.grade}</td>
															<td class="num">{e.checked || '–'}</td>
														</tr>
														{#each e.alt as a, j (j)}
															<tr class="alt" class:diff={differs(e, a)}>
																<td class="fk">↳ other source</td>
																<td>{a.value}{#if differs(e, a)}<span class="tag">differs</span>{/if}{#if a.note}<span class="note">{a.note}</span>{/if}</td>
																<td>{@render srcs(a.source)}</td>
																<td class="g g{a.grade}">{a.grade}</td>
																<td></td>
															</tr>
														{/each}
													{/each}
												</tbody>
											</table>
										</div>
										{#if p.images.length || p.photo_leads.length}
											<div>
												<h3>Photos</h3>
												<ul>
													{#each p.images as im (im.file)}<li>In use: <a href={im.source_url}>{im.title}</a>, {im.author}, {im.licence} (checked {im.checked})</li>{/each}
													{#each p.photo_leads as id (id)}<li>Lead {id}: {#if leadsOf[id]}<a href={leadsOf[id].url}>{leadsOf[id].subject}, {leadsOf[id].collection}</a> · {leadsOf[id].rights_lead}{:else}not in plant_photo_leads.csv{/if}</li>{/each}
												</ul>
											</div>
										{/if}
									</div>
								</td></tr>
							{/if}
						{:else}
							<tr><td colspan="11" class="none">No plant matches. <button type="button" class="btn" onclick={reset}>Clear the filters</button></td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="panel leads-now" aria-labelledby="leads-h">
			<div class="p-head flush">
				<h2 id="leads-h">Station leads: stations without a page</h2>
				<span class="quiet">From <a href="{REPO}/station_leads.csv">station_leads.csv</a>. Tap a station for its details and team notes. A station that passes gets a plant file (<a href="{REPO}/PLANTS.md">PLANTS.md</a>, Stations without a page); one already on a page is marked there with <code>on_page</code>.</span>
			</div>
			<div class="row">
				<div class="seg wrapseg" role="group" aria-label="Lead group">
					{#each LEAD_GROUPS as [k, name] (k)}
						<button type="button" aria-pressed={lf.group === k} onclick={() => (lf.group = k)}>{name} <span class="num">{leadNums[k]}</span></button>
					{/each}
				</div>
			</div>
			<div class="row">
				<label class="lab">Technology
					<select bind:value={lf.tech}><option value="">All</option>{#each techs as x (x)}<option value={x}>{x}</option>{/each}</select>
				</label>
				<label class="lab find">Search leads
					<input type="search" placeholder="Name, ID, owner, region" bind:value={lf.text} maxlength="40" autocomplete="off" />
				</label>
				{#if groupOf[lf.group]?.what}<span class="quiet">{groupOf[lf.group].what}.</span>{/if}
			</div>
			<div class="scroll">
				<table>
					<thead><tr><th>ID</th><th>Station</th><th class="w">Technology</th><th class="w">Region</th><th class="w">Status</th><th class="n">MW</th><th class="w">Owner</th><th class="w">In Elenz</th><th class="w">Group</th></tr></thead>
					<tbody>
						{#each leadRows as r (r.id)}
							<tr class:on={r.id === leadOpen}>
								<td class="num">{r.id}</td>
								<td class="c-name"><button type="button" class="open" aria-expanded={r.id === leadOpen} onclick={() => toggleLead(r.id)}>{r.name}</button>{#if leadNoted(r.id)}<span class="has-note" title={dirty(leadKey(r.id)) ? 'Team notes not saved yet' : 'Has team notes'} class:unsaved={dirty(leadKey(r.id))}>✎</span>{/if}</td>
								<td class="w">{r.technology ?? ''}</td><td class="w">{r.region ?? ''}</td><td class="w">{r.status ?? ''}</td>
								<td class="n">{r.mw ?? ''}</td><td class="w">{r.owner ?? ''}</td><td class="w">{r.shown_in_elenz ?? ''}</td>
								<td class="w">{groupOf[r.group]?.name ?? r.group}</td>
							</tr>
							{#if r.id === leadOpen}
								<tr class="more"><td colspan="9">
									<div class="detail">
										<p class="links">
											{#if r.on_page}<a href="/plants/{r.on_page}">On the {plantName[r.on_page] ?? r.on_page} page</a>{/if}
											{#if r.wikidata}<a href="https://www.wikidata.org/wiki/{r.wikidata}">Wikidata {r.wikidata}</a>{/if}
											{#if r.osm}{#each r.osm.split(/\s+/) as x (x)}<a href={osmUrl(x)}>OpenStreetMap {x}</a>{/each}{/if}
											{#if r.lat && r.lon}<a href="https://www.openstreetmap.org/?mlat={r.lat}&mlon={r.lon}#map=15/{r.lat}/{r.lon}">Map ({r.lat}, {r.lon})</a>{/if}
										</p>
										<p class="quiet">{groupOf[r.group]?.name ?? r.group}{r.scheme ? ` · ${r.scheme} scheme` : ''}{r.mw ? ` · ${r.mw} MW` : ''}{r.mw_basis ? ` (${r.mw_basis})` : ''}{r.grid_exit_point ? ` · grid exit point ${r.grid_exit_point}` : ''}{r.location_source ? ` · location from ${r.location_source}` : ''}</p>
										{#if r.to_check}<div><h3>To check</h3><p class="lead-text">{r.to_check}</p></div>{/if}
										{@render teamNotes(leadKey(r.id))}
										{#if r.notes}<div><h3>Notes <span class="quiet">(from the leads file)</span></h3><p class="lead-text">{r.notes}</p></div>{/if}
										{#if r.sources && urls(r.sources).length}<div><h3>Sources</h3><ul>{#each urls(r.sources) as u (u)}<li><a href={u}>{host(u)}</a></li>{/each}</ul></div>{/if}
									</div>
								</td></tr>
							{/if}
						{:else}
							<tr><td colspan="9" class="none">No station lead matches.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<details class="panel leads">
			<summary><h2>Photo leads ({d.photo_leads.length})</h2></summary>
			<p class="quiet">Photos worth checking, not yet cleared for use (<code>facilities/plant_photo_leads.csv</code>). Read the licence on the file’s own page before adding a row to <code>plant_images.csv</code>.</p>
			<div class="scroll">
				<table>
					<thead><tr><th>ID</th><th>Plants</th><th>Subject</th><th>Collection</th><th>Rights</th><th>What it shows</th></tr></thead>
					<tbody>
						{#each d.photo_leads as r (r.id)}
							<tr><td class="num">{r.id}</td><td>{r.slugs}</td><td><a href={r.url}>{r.subject}</a></td><td>{r.collection}</td><td>{r.rights_lead}</td><td>{r.description}</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	</main>

	<SiteFooter />
</div>

<style>
	.res { display: grid; gap: 16px; }
	.head { display: grid; gap: 8px; padding-top: 6px; }
	h1 { font-size: clamp(1.8rem, 4vw, 2.5rem); letter-spacing: -0.01em; line-height: 1.1; }
	h2 { font-size: 1.02rem; margin: 0; display: inline; }
	h3 { font-size: 0.84rem; color: var(--ink-2); margin: 0 0 4px; }
	.sub { margin: 0; color: var(--ink-2); font-size: 1rem; line-height: 1.55; max-width: 72ch; }
	.sub a, .panel a { color: var(--accent); }
	.num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
	.quiet { color: var(--muted); font-size: 0.84rem; line-height: 1.45; margin: 0; }
	.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px 16px; min-width: 0; display: grid; gap: 10px; align-content: start; }
	.sw { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--c); flex: none; margin-right: 8px; }
	.tag { font-size: 0.68rem; border: 1px solid var(--line); color: var(--muted); border-radius: 4px; padding: 0 5px; margin-left: 6px; white-space: nowrap; }
	.note { display: block; color: var(--muted); font-size: 0.78rem; line-height: 1.4; }
	code { font-family: var(--font-data); font-size: 0.85em; }

	.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
	.card { gap: 4px; }
	.card .k { font-size: 0.8rem; color: var(--muted); }
	.card .v { font-size: 1.35rem; font-weight: 500; }
	.card .v small { font-size: 0.8rem; color: var(--muted); font-weight: 400; }
	.card .v.small { font-family: var(--font-ui); font-size: 0.86rem; font-weight: 400; color: var(--ink-2); }
	.bar { height: 6px; border-radius: 3px; background: var(--grid); overflow: hidden; margin-top: 4px; }
	.bar span { display: block; height: 100%; background: var(--accent); }

	.ctl { padding: 12px 14px; }
	.row { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; }
	.seg { display: inline-flex; gap: 2px; border-radius: 4px; padding: 2px; background: var(--grid); }
	.seg button { font: inherit; font-size: 0.8rem; font-weight: 500; border: 1px solid transparent; background: transparent; color: var(--ink); padding: 2px 10px; min-height: 30px; border-radius: 3px; cursor: pointer; }
	.seg button[aria-pressed='true'] { background: var(--surface); border-color: var(--line); }
	.lab { display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; color: var(--ink-2); }
	.lab select, .lab input[type='search'] { font: inherit; font-size: 0.86rem; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 4px; padding: 4px 8px; min-height: 32px; max-width: 100%; }
	.find input { width: 180px; }
	.btn { font: inherit; cursor: pointer; border: 1px solid var(--line); background: var(--surface); color: var(--accent); border-radius: 4px; font-size: 0.8rem; font-weight: 600; padding: 3px 10px; min-height: 32px; }
	.btn:disabled { color: var(--muted); cursor: progress; }
	.dl { margin-left: auto; }

	.tbl { padding: 14px 0 6px; }
	.p-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: 0 16px; }
	.scroll { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
	th { text-align: left; color: var(--muted); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
	th button { all: unset; cursor: pointer; }
	th button:hover { color: var(--ink); }
	th button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	th button[data-sort]:not([data-sort=''])::after { content: ' ' attr(data-sort); color: var(--accent); }
	td { padding: 7px 10px; border-bottom: 1px solid var(--grid); vertical-align: top; }
	th:first-child, td:first-child { padding-left: 16px; }
	th:last-child, td:last-child { padding-right: 16px; }
	.n { text-align: right; font-family: var(--font-data); font-variant-numeric: tabular-nums; white-space: nowrap; }
	th.n { font-family: var(--font-ui); }
	td.w { color: var(--ink-2); }
	.c-name { white-space: nowrap; }
	.open { all: unset; cursor: pointer; font-weight: 600; color: var(--ink); white-space: normal; }
	.open:hover { color: var(--accent); text-decoration: underline; }
	.open:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	tr.on td { background: var(--accent-soft); }
	tr.shut td { color: var(--muted); }
	td.all { color: var(--live-ink); font-weight: 600; }
	td.zero { color: var(--muted); }
	.loc.checked { color: var(--live-ink); }
	.loc.grid, .loc.none { color: var(--warn-ink); }
	.none { color: var(--muted); padding: 14px 16px; }

	tr.more > td { background: var(--bg); padding: 12px 16px 16px; }
	.detail { display: grid; gap: 12px; max-width: 100ch; white-space: normal; }
	.detail ul { margin: 0; padding-left: 1.2rem; display: grid; gap: 3px; font-size: 0.86rem; line-height: 1.45; }
	.links { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 0.86rem; }
	.facts table { font-size: 0.82rem; background: var(--surface); border: 1px solid var(--line); border-radius: 3px; }
	.facts td, .facts th { padding: 6px 8px; }
	.facts .fk { color: var(--ink-2); white-space: nowrap; }
	.facts tr.pub td:first-child { box-shadow: inset 3px 0 var(--live-ink); }
	.facts tr.alt td { color: var(--ink-2); background: var(--bg); }
	.facts tr.alt.diff td { background: var(--warn-bg); color: var(--warn-ink); }
	.g { font-family: var(--font-data); font-weight: 600; text-align: center; }
	.gC { color: var(--muted); }

	.has-note { margin-left: 6px; color: var(--accent); font-size: 0.82rem; }
	.has-note.unsaved { color: var(--warn-ink); }
	.mine { display: grid; gap: 6px; }
	.mine h3 { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; }
	.mine textarea { font: inherit; font-size: 0.88rem; line-height: 1.5; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; width: 100%; box-sizing: border-box; resize: vertical; min-height: 92px; }
	.mine textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
	.note-bar { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
	.quietbtn { color: var(--ink-2); font-weight: 500; }
	.err { color: var(--warn-ink); }
	.clash { background: var(--warn-bg); color: var(--warn-ink); border-radius: 4px; padding: 8px 10px; font-size: 0.84rem; display: grid; gap: 6px; }
	.clash p { margin: 0; }
	.clash blockquote { margin: 0; padding: 6px 8px; background: var(--surface); color: var(--ink); border-radius: 3px; white-space: pre-wrap; max-height: 12em; overflow: auto; }
	.rounds { list-style: none; margin: 0; padding: 10px 16px; gap: 6px; }
	.rounds li { font-size: 0.9rem; line-height: 1.45; display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; }
	.r-state { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 3px; padding: 1px 6px; background: var(--grid); color: var(--ink-2); }
	.rounds .now .r-state { background: var(--accent); color: var(--surface); }
	.rounds .done { color: var(--muted); }
	.leads-now { padding: 14px 0 6px; }
	.leads-now > .row { padding: 0 16px; }
	.p-head.flush { display: grid; gap: 4px; }
	.wrapseg { flex-wrap: wrap; }
	.wrapseg .num { color: var(--muted); font-weight: 400; margin-left: 2px; }
	.lead-text { margin: 0; font-size: 0.86rem; line-height: 1.5; white-space: pre-line; }
	.leads summary { cursor: pointer; list-style-position: inside; }
	.leads table { min-width: 760px; }

	/* phones: plant, MW, checked and to check; tap a plant for the rest */
	@media (max-width: 700px) {
		.w { display: none; }
		.dl { margin-left: 0; }
		.find { flex: 1 1 100%; }
		.find input { flex: 1; width: auto; min-width: 0; }
		/* the opened plant fits the screen: each fact a small card, grade and date checked on its first line */
		.detail { max-width: calc(100vw - 40px); overflow-wrap: anywhere; }
		.facts thead { display: none; }
		.facts table, .facts tbody { display: block; border: none; background: none; }
		.facts tr { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 2px 10px; padding: 8px 10px; margin-bottom: 6px; border: 1px solid var(--line); border-radius: 3px; background: var(--surface); }
		.facts tr td { display: block; padding: 0; border: none; background: none; }
		.facts tr td.fk { grid-column: 1; grid-row: 1; white-space: normal; font-weight: 600; }
		.facts tr td.g { grid-column: 2; grid-row: 1; }
		.facts tr td:last-child { grid-column: 3; grid-row: 1; }
		.facts tr td:nth-child(2), .facts tr td:nth-child(3) { grid-column: 1 / -1; }
		.facts tr.pub { box-shadow: inset 3px 0 var(--live-ink); }
		.facts tr.pub td:first-child { box-shadow: none; }
		.facts tr.alt { background: var(--bg); margin-left: 14px; }
		.facts tr.alt.diff { background: var(--warn-bg); }
	}
</style>
