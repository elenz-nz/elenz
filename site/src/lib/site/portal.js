// use:portal moves an element to the end of <body> for as long as it exists. For fixed-position popovers and
// tooltips: an enlarged card (.card.popped, .chart.popped in tracker.css) is centred with a transform, and a transform
// makes position: fixed count from the card instead of the window, so the ⓘ notes opened halfway down the page and
// the heat maps' tooltips sat far below the pointer (owner's report, 1 Nov 2026).
export function portal(node) {
	document.body.appendChild(node);
	return { destroy() { node.remove(); } };
}
