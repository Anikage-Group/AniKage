import { persisted } from '$lib/stores/persisted';
import type { WatchStatus, WatchlistEntry } from '$lib/types';
import { get } from 'svelte/store';

/** Watchlist keyed by AniList id. */
export const watchlist = persisted<Record<number, WatchlistEntry>>('anikage:watchlist', {});

export type NewWatchlistEntry = Omit<WatchlistEntry, 'addedAt' | 'status'>;

export function addToWatchlist(entry: NewWatchlistEntry, status: WatchStatus = 'planned'): void {
	watchlist.update((w) => ({
		...w,
		[entry.id]: { ...entry, status, addedAt: w[entry.id]?.addedAt ?? Date.now() }
	}));
}

export function setWatchStatus(id: number, status: WatchStatus): void {
	watchlist.update((w) => (w[id] ? { ...w, [id]: { ...w[id], status } } : w));
}

/** Cache the resolved MAL id so later progress/delete calls do not remap it. */
export function setWatchlistMalId(id: number, malId: number | null): void {
	watchlist.update((w) =>
		w[id] && w[id].malId !== malId ? { ...w, [id]: { ...w[id], malId } } : w
	);
}

export function removeFromWatchlist(id: number): void {
	watchlist.update((w) => {
		delete w[id];
		return w;
	});
}

export function toggleWatchlist(entry: NewWatchlistEntry, status: WatchStatus = 'planned'): boolean {
	const w = get(watchlist);
	if (w[entry.id]) {
		removeFromWatchlist(entry.id);
		return false;
	}
	addToWatchlist(entry, status);
	return true;
}

export function isSaved(id: number, sub?: ReturnType<typeof get<Record<number, WatchlistEntry>>>): boolean {
	return !!id && !!get(watchlist)[id];
}
