import { browser } from '$app/environment';
import { persisted } from '$lib/stores/persisted';
import type { Lang } from '$lib/types';

export interface Settings {
	/** Autoplay next episode when player signals end. */
	autoNext: boolean;
	/** Auto-on when an episode ends: advance to the next episode. */
	autoNextOnEnd: boolean;
	/** Auto-click Skip Intro when the window becomes available. */
	autoSkipIntro: boolean;
	/** Auto-click Skip Outro when the window becomes available. */
	autoSkipOutro: boolean;
	/** Preferred audio track when selecting a stream. */
	preferredAudio: 'sub' | 'dub';
	/** Default episode list display mode on the watch page. */
	episodeView: 'tiles' | 'titles' | 'detailed';
	/** Default view mode for search results. */
	searchView: 'grid' | 'row';
	/** Default view mode for watchlist. */
	watchlistView: 'grid' | 'row';
	/** Schedule page filter. */
	scheduleWatchlistOnly: boolean;
	/** AniList OAuth sync. */
	anilistToken: string;
	anilistHandle: string;
	anilistUserId: number | null;
	/** Profile picture of the signed-in AniList user. */
	anilistAvatar: string;
	/** MyAnimeList OAuth session (the official API). */
	malToken: string;
	malHandle: string;
	malUserId: number | null;
	malAvatar: string;
	/** Reduced ambient glow / heavier motion effects. */
	reduceMotion: boolean;
	/** Compact card density. */
	compactCards: boolean;
	/** Hide adult (18+) titles across the app. */
	hideAdult: boolean;
	/** Site display language for titles. */
	lang: Lang;
}

export const defaultSettings: Settings = {
	autoNext: true,
	autoNextOnEnd: true,
	autoSkipIntro: false,
	autoSkipOutro: false,
	preferredAudio: 'sub',
	episodeView: 'detailed',
	searchView: 'grid',
	watchlistView: 'grid',
	scheduleWatchlistOnly: false,
	anilistToken: '',
	anilistHandle: '',
	anilistUserId: null,
	anilistAvatar: '',
	malToken: '',
	malHandle: '',
	malUserId: null,
	malAvatar: '',
	reduceMotion: false,
	compactCards: false,
	hideAdult: false,
	lang: 'en'
};

export const settings = persisted<Settings>('anikage:settings', defaultSettings);

// Older stored settings predate newer keys (e.g. miniplayer); fill gaps with
// defaults without clobbering any choice the user already made.
if (browser) settings.update((saved) => ({ ...defaultSettings, ...saved }));

export function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
	settings.update((s) => ({ ...s, [key]: value }));
}

export function resetSettings(): void {
	settings.set({ ...defaultSettings });
}
