<script lang="ts">
	import Coffee from './Coffee.svelte';
</script>

<footer>
	<div class="f-text">
		<p>Data from www.emi.ea.govt.nz provided by the Electricity Authority (New Zealand), CC BY 4.0. Irradiance: Himawari satellite data (JMA/JAXA) via Open-Meteo, CC BY 4.0.</p>
		<p>Times are New Zealand time. Trading periods (TP) are the market's half-hour periods, numbered from midnight. Generation is dispatch (the market's 5-minute targets), not metered output.</p>
	</div>
	<div class="f-support">
		<span>Elenz is free and ad-free.</span>
		<Coffee />
	</div>
</footer>

<style>
	footer { display: flex !important; justify-content: space-between; align-items: flex-start; gap: 14px 30px; flex-wrap: wrap; }
	.f-text { display: grid; gap: 6px; flex: 1 1 480px; }
	.f-support { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
	.f-support span { font-size: 0.8rem; }
</style>
