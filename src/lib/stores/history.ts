import { persisted } from '$lib/stores/persisted';
import type { ProgressEntry } from '$lib/types';
import { get } from 'svelte/store';

/** Continue-watching progress keyed by AniList id. */
export const progress = persisted<Record<number, ProgressEntry>>('anikage:progress', {});

/** Fully-watched episode keys `${animeId}:${ep}`. */
export const watched = persisted<Record<string, boolean>>('anikage:watched', {});

export function recordProgress(entry: Omit<ProgressEntry, 'updatedAt'>): void {
	progress.update((p) => ({ ...p, [entry.id]: { ...entry, updatedAt: Date.now() } }));
}

export function removeProgress(id: number): void {
	progress.update((p) => {
		if (!(id in p)) return p;
		// Return a NEW object: Svelte only notifies when the reference changes,
		// so mutating in place left every consumer showing the stale row.
		const next = { ...p };
		delete next[id];
		return next;
	});
}

export function markWatched(animeId: number, ep: number, total: number | null = null): void {
	watched.update((w) => {
		const key = `${animeId}:${ep}`;
		if (w[key]) return w;
		// New object so `$watched` subscribers actually re-render.
		return { ...w, [key]: true };
	});
	// Completed the last known episode → clear resume row so it leaves Continue Watching.
	const last = total != null && ep >= total;
	if (last) removeProgress(animeId);
}

export function markUnwatched(animeId: number, ep: number): void {
	watched.update((w) => {
		const key = `${animeId}:${ep}`;
		if (!(key in w)) return w;
		const next = { ...w };
		delete next[key];
		return next;
	});
}

export function isWatched(animeId: number, ep: number): boolean {
	return !!get(watched)[`${animeId}:${ep}`];
}

/** Ordered newest-first list for the Continue Watching row. */
export function continueList(list: Record<number, ProgressEntry> = get(progress)): ProgressEntry[] {
	return Object.values(list).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function watchedCount(animeId: number, list: Record<string, boolean> = get(watched)): number {
	let n = 0;
	for (const k of Object.keys(list)) if (k.startsWith(`${animeId}:`)) n++;
	return n;
}
