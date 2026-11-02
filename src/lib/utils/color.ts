/**
 * Small, dependency-free colour helpers shared by the custom-theme wheel and
 * the comment-widget bridge. The site stores every theme token as a hex string,
 * so these functions intentionally accept/emit hex and convert only at the
 * edges (HSV controls and the iframe's rgb() configuration).
 */

export interface Rgb {
	r: number;
	g: number;
	b: number;
}

export interface Hsv {
	/** Hue in degrees, 0–360. */
	h: number;
	/** Saturation, 0–1. */
	s: number;
	/** Value/brightness, 0–1. */
	v: number;
}

const HEX_LONG = /^#[0-9a-f]{6}$/i;
const HEX_SHORT = /^#[0-9a-f]{3}$/i;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Expand a 3- or 6-digit hex string into canonical `#RRGGBB` form. */
export function normalizeHex(value: string): string | null {
	const input = value.trim();
	if (!input) return null;
	const withHash = input.startsWith('#') ? input : `#${input}`;
	if (HEX_LONG.test(withHash)) return withHash.toUpperCase();
	if (HEX_SHORT.test(withHash)) {
		const [r, g, b] = withHash.slice(1).split('');
		return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
	}
	return null;
}

export function hexToRgb(value: string): Rgb | null {
	const hex = normalizeHex(value);
	if (!hex) return null;
	return {
		r: parseInt(hex.slice(1, 3), 16),
		g: parseInt(hex.slice(3, 5), 16),
		b: parseInt(hex.slice(5, 7), 16)
	};
}

export function rgbToHex(rgb: Rgb): string {
	const channel = (value: number) =>
		Math.round(clamp(value, 0, 255))
			.toString(16)
			.padStart(2, '0');
	return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`.toUpperCase();
}

export function rgbToHsv(rgb: Rgb): Hsv {
	const r = clamp(rgb.r, 0, 255) / 255;
	const g = clamp(rgb.g, 0, 255) / 255;
	const b = clamp(rgb.b, 0, 255) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;

	let h = 0;
	if (delta !== 0) {
		if (max === r) h = ((g - b) / delta) % 6;
		else if (max === g) h = (b - r) / delta + 2;
		else h = (r - g) / delta + 4;
		h *= 60;
		if (h < 0) h += 360;
	}

	return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb(hsv: Hsv): Rgb {
	const h = ((hsv.h % 360) + 360) % 360;
	const s = clamp(hsv.s, 0, 1);
	const v = clamp(hsv.v, 0, 1);
	const c = v * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - c;

	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 60) [r, g, b] = [c, x, 0];
	else if (h < 120) [r, g, b] = [x, c, 0];
	else if (h < 180) [r, g, b] = [0, c, x];
	else if (h < 240) [r, g, b] = [0, x, c];
	else if (h < 300) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];

	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255)
	};
}

export function hexToHsv(value: string): Hsv | null {
	const rgb = hexToRgb(value);
	return rgb ? rgbToHsv(rgb) : null;
}

export function hsvToHex(hsv: Hsv): string {
	return rgbToHex(hsvToRgb(hsv));
}

export function rgbString(rgb: Rgb): string {
	return `rgb(${Math.round(clamp(rgb.r, 0, 255))}, ${Math.round(clamp(rgb.g, 0, 255))}, ${Math.round(clamp(rgb.b, 0, 255))})`;
}

/**
 * Convert a CSS colour token (hex or rgb/rgba) to concrete RGB channels.
 * The comment widget is cross-origin, so it cannot resolve `var(--c-*)`.
 */
export function cssColorToRgb(value: string): Rgb | null {
	const fromHex = hexToRgb(value);
	if (fromHex) return fromHex;

	const match = value.trim().match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
	if (!match) return null;
	return {
		r: clamp(Number(match[1]), 0, 255),
		g: clamp(Number(match[2]), 0, 255),
		b: clamp(Number(match[3]), 0, 255)
	};
}
