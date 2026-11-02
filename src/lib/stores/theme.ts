import { browser } from '$app/environment';
import { derived, get, writable } from 'svelte/store';

const PRESET_IDS = [
	'lantern',
	'lime',
	'midnight',
	'cyberpunk',
	'emerald',
	'amber',
	'crimson',
	'sakura',
	'nordic',
	'matcha',
	'solaris',
	'lavender',
	'coffee',
	'obsidian',
	'violet',
	'ruby',
	'rose',
	'mint',
	'peach',
	'sky'
] as const;

export type PresetThemeId = (typeof PRESET_IDS)[number];
/** `custom` lives outside the picker and is edited only from Settings. */
export type ThemeId = PresetThemeId | 'custom';

export interface ThemeDef {
	id: ThemeId;
	name: string;
	mode: 'dark' | 'light';
}

export interface ThemeColors {
	bg: string;
	surface: string;
	surface2: string;
	accent: string;
	accent2: string;
	ink: string;
	muted: string;
	line: string;
}

export type ThemeColorKey = keyof ThemeColors;

export const THEMES: ThemeDef[] = [
	{ id: 'lantern', name: 'Lantern Glow', mode: 'dark' },
	{ id: 'lime', name: 'Lime Green', mode: 'dark' },
	{ id: 'midnight', name: 'Midnight Purple', mode: 'dark' },
	{ id: 'cyberpunk', name: 'Cyberpunk Neon', mode: 'dark' },
	{ id: 'emerald', name: 'Emerald OLED', mode: 'dark' },
	{ id: 'amber', name: 'Sunset Amber', mode: 'dark' },
	{ id: 'crimson', name: 'Crimson Blood', mode: 'dark' },
	{ id: 'obsidian', name: 'Obsidian Ice', mode: 'dark' },
	{ id: 'violet', name: 'Violet Dusk', mode: 'dark' },
	{ id: 'ruby', name: 'Ruby Ember', mode: 'dark' },
	{ id: 'sakura', name: 'Sakura Bloom', mode: 'light' },
	{ id: 'nordic', name: 'Nordic Fog', mode: 'light' },
	{ id: 'matcha', name: 'Matcha Latte', mode: 'light' },
	{ id: 'solaris', name: 'Solaris Paper', mode: 'light' },
	{ id: 'lavender', name: 'Lavender Dream', mode: 'light' },
	{ id: 'coffee', name: 'Coffee Cream', mode: 'light' },
	{ id: 'rose', name: 'Rose Quartz', mode: 'light' },
	{ id: 'mint', name: 'Mint Cream', mode: 'light' },
	{ id: 'peach', name: 'Peach Blossom', mode: 'light' },
	{ id: 'sky', name: 'Sky Canvas', mode: 'light' }
];

export const CUSTOM_THEME_DEFAULT: ThemeColors = {
	bg: '#101014',
	surface: '#1a1a21',
	surface2: '#24242d',
	accent: '#ff6800',
	accent2: '#ffb639',
	ink: '#f5f5f5',
	muted: '#919191',
	line: '#3c3c3c'
};

export const CUSTOM_COLOR_FIELDS: { key: ThemeColorKey; label: string }[] = [
	{ key: 'bg', label: 'Background' },
	{ key: 'surface', label: 'Surface' },
	{ key: 'surface2', label: 'Elevated surface' },
	{ key: 'accent', label: 'Accent' },
	{ key: 'accent2', label: 'Secondary accent' },
	{ key: 'ink', label: 'Text' },
	{ key: 'muted', label: 'Muted text' },
	{ key: 'line', label: 'Border' }
];

const STORAGE_KEY = 'anikage:theme';
const CUSTOM_KEY = 'anikage:custom-theme';
const HEX = /^#[0-9a-f]{6}$/i;

function isPreset(id: unknown): id is PresetThemeId {
	return typeof id === 'string' && (PRESET_IDS as readonly string[]).includes(id);
}

function readTheme(): ThemeId {
	if (!browser) return 'lantern';
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const parsed = raw ? (JSON.parse(raw) as unknown) : 'lantern';
		return parsed === 'custom' || isPreset(parsed) ? parsed : 'lantern';
	} catch {
		return 'lantern';
	}
}

function readCustomTheme(): ThemeColors {
	if (!browser) return { ...CUSTOM_THEME_DEFAULT };
	try {
		const raw = localStorage.getItem(CUSTOM_KEY);
		const parsed = raw ? (JSON.parse(raw) as Partial<ThemeColors>) : {};
		const colors = { ...CUSTOM_THEME_DEFAULT };
		for (const key of Object.keys(colors) as ThemeColorKey[]) {
			if (typeof parsed[key] === 'string' && HEX.test(parsed[key]!)) colors[key] = parsed[key]!;
		}
		return colors;
	} catch {
		return { ...CUSTOM_THEME_DEFAULT };
	}
}

/** Light/dark is derived from the custom background so contrast stays sane. */
export function modeForColors(colors: ThemeColors): 'dark' | 'light' {
	const hex = colors.bg.replace('#', '');
	const r = parseInt(hex.slice(0, 2), 16) || 0;
	const g = parseInt(hex.slice(2, 4), 16) || 0;
	const b = parseInt(hex.slice(4, 6), 16) || 0;
	return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.58 ? 'light' : 'dark';
}

export const themeId = writable<ThemeId>(readTheme());
export const customTheme = writable<ThemeColors>(readCustomTheme());

export const currentTheme = derived([themeId, customTheme], ([$id, $custom]) => {
	if ($id === 'custom') return { id: 'custom', name: 'Custom', mode: modeForColors($custom) };
	return THEMES.find((t) => t.id === $id) ?? THEMES[0];
});
export const isLight = derived(currentTheme, (t) => t.mode === 'light');

export function setTheme(id: ThemeId): void {
	themeId.set(id);
}

export function updateCustomTheme(patch: Partial<ThemeColors>): void {
	customTheme.update((colors) => {
		const next = { ...colors };
		for (const key of Object.keys(patch) as ThemeColorKey[]) {
			const value = patch[key];
			if (typeof value === 'string' && HEX.test(value)) next[key] = value;
		}
		return next;
	});
}

export function resetCustomTheme(): void {
	customTheme.set({ ...CUSTOM_THEME_DEFAULT });
}

export function cycleTheme(): void {
	themeId.update((cur) => {
		const i = THEMES.findIndex((t) => t.id === cur);
		return THEMES[(i + 1) % THEMES.length].id;
	});
}

function clearCustomVars(root: HTMLElement): void {
	for (const key of Object.keys(CUSTOM_THEME_DEFAULT)) root.style.removeProperty(`--c-${key}`);
	root.style.removeProperty('color-scheme');
}

function applyTheme(id: ThemeId, custom: ThemeColors): void {
	const root = document.documentElement;
	if (id === 'custom') {
		root.setAttribute('data-theme', 'custom');
		for (const key of Object.keys(custom) as ThemeColorKey[]) {
			root.style.setProperty(`--c-${key}`, custom[key]);
		}
		const mode = modeForColors(custom);
		root.style.colorScheme = mode;
		root.classList.toggle('light', mode === 'light');
	} else {
		clearCustomVars(root);
		root.setAttribute('data-theme', id);
		root.classList.toggle('light', THEMES.find((t) => t.id === id)?.mode === 'light');
	}
}

// Sync <html data-theme>, custom properties and the light class.
if (browser) {
	themeId.subscribe((id) => {
		applyTheme(id, get(customTheme));
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(id));
		} catch {
			/* ignore */
		}
	});

	customTheme.subscribe((colors) => {
		try {
			localStorage.setItem(CUSTOM_KEY, JSON.stringify(colors));
		} catch {
			/* ignore */
		}
		if (get(themeId) === 'custom') applyTheme('custom', colors);
	});
}
