/**
 * Portal action — moves the node to `<body>`.
 *
 * Popovers are rendered inside page content that sits in a stacking context
 * (the root layout wraps `<main>` in `relative z-10`). A `fixed` popover
 * cannot escape that context, so it always painted *under* the sticky header,
 * the mobile nav and the toasts. Rendering it as a direct child of `<body>`
 * puts it back in the root stacking context, where its z-index counts.
 */
export function portal(node: HTMLElement) {
	if (typeof document === 'undefined') return {};
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
