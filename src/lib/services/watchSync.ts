import { get } from 'svelte/store';
import type { WatchStatus, WatchlistEntry } from '$lib/types';
import { settings } from '$lib/stores/settings';
import { progress as progressStore } from '$lib/stores/history';
import {
	removeFromWatchlist,
	setWatchlistMalId,
	watchlist,
	type NewWatchlistEntry
} from '$lib/stores/watchlist';
import {
	addTombstone,
	clearTombstone,
	forgetRemoteId,
	rememberRemoteId
} from '$lib/stores/sync';
import { malIdFor } from '$lib/services/fallback';
import {
	deleteEntry,
	pushEntry,
	pushProgress
} from '$lib/services/anilistOAuth';
import {
	deleteMalEntry,
	pushMalEntry,
	pushMalProgress
} from '$lib/services/malOAuth';
import { toast } from '$lib/stores/toast';

export interface SyncIssue {
	provider: 'AniList' | 'MyAnimeList';
	message: string;
}

export interface SyncReport {
	synced: ('AniList' | 'MyAnimeList')[];
	issues: SyncIssue[];
}

const emptyReport = (): SyncReport => ({ synced: [], issues: [] });

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : 'Sync request failed.';
}

/** Resolve (and cache) the MAL id for an AniList title. */
async function resolveMalId(entry: { id: number; malId?: number | null }): Promise<number | null> {
	const stored = get(watchlist)[entry.id]?.malId;
	const known = entry.malId ?? stored;
	if (known) return known;
	try {
		const malId = await malIdFor(entry.id);
		if (malId) {
			setWatchlistMalId(entry.id, malId);
			return malId;
		}
	} catch {
		/* fall through — the caller reports the unresolved mapping */
	}
	return null;
}

/**
 * Push a watchlist add/status change to both providers.
 *
 * Runs after the local store has already been updated. A failed provider is
 * reported to the caller instead of being silently swallowed.
 */
export async function syncWatchlistEntry(
	entry: NewWatchlistEntry,
	status: WatchStatus
): Promise<SyncReport> {
	const report = emptyReport();
	const current = get(settings);
	const progress = get(progressStore)[entry.id]?.episode;
	const episode =
		progress ?? (status === 'completed' && entry.totalEpisodes ? entry.totalEpisodes : undefined);

	// Re-adding or changing an entry cancels any pending delete, even if the
	// provider is currently signed out and the push is skipped.
	clearTombstone('anilist', entry.id);
	if (entry.malId) clearTombstone('mal', entry.malId);

	if (current.anilistToken) {
		try {
			await pushEntry(entry.id, status, episode);
			report.synced.push('AniList');
		} catch (e) {
			report.issues.push({ provider: 'AniList', message: messageOf(e) });
		}
	}

	if (current.malToken) {
		const malId = await resolveMalId(entry);
		if (!malId) {
			report.issues.push({
				provider: 'MyAnimeList',
				message: 'Could not match this title to a MAL id.'
			});
		} else {
			clearTombstone('mal', malId);
			try {
				await pushMalEntry(malId, status, episode);
				report.synced.push('MyAnimeList');
			} catch (e) {
				report.issues.push({ provider: 'MyAnimeList', message: messageOf(e) });
			}
		}
	}

	return report;
}

/** Push episode progress to both providers. */
export async function syncEpisodeProgress(
	entry: { id: number; malId?: number | null },
	ep: number,
	completed = false
): Promise<SyncReport> {
	const report = emptyReport();
	const current = get(settings);

	// Watching a title again means the local entry should win over an old
	// pending delete.
	clearTombstone('anilist', entry.id);
	if (entry.malId) clearTombstone('mal', entry.malId);

	const tasks: Promise<void>[] = [];

	if (current.anilistToken) {
		tasks.push(
			pushProgress(entry.id, ep, completed)
				.then(() => {
					report.synced.push('AniList');
				})
				.catch((e) => {
					report.issues.push({ provider: 'AniList', message: messageOf(e) });
				})
		);
	}

	if (current.malToken) {
		tasks.push(
			(async () => {
				const malId = await resolveMalId(entry);
				if (!malId) {
					report.issues.push({
						provider: 'MyAnimeList',
						message: 'Could not match this title to a MAL id.'
					});
					return;
				}
				clearTombstone('mal', malId);
				try {
					await pushMalProgress(malId, ep, completed);
					rememberRemoteId('mal', malId);
					report.synced.push('MyAnimeList');
				} catch (e) {
					report.issues.push({ provider: 'MyAnimeList', message: messageOf(e) });
				}
			})()
		);
	}

	await Promise.all(tasks);
	return report;
}

async function deleteFromAnilist(entry: WatchlistEntry, report: SyncReport): Promise<void> {
	addTombstone('anilist', entry.id);
	try {
		await deleteEntry(entry.id);
		clearTombstone('anilist', entry.id);
		forgetRemoteId('anilist', entry.id);
		report.synced.push('AniList');
	} catch (e) {
		report.issues.push({ provider: 'AniList', message: messageOf(e) });
	}
}

async function deleteFromMal(entry: WatchlistEntry, report: SyncReport): Promise<void> {
	const malId = await resolveMalId(entry);
	if (!malId) return;
	addTombstone('mal', malId);
	try {
		await deleteMalEntry(malId);
		clearTombstone('mal', malId);
		forgetRemoteId('mal', malId);
		report.synced.push('MyAnimeList');
	} catch (e) {
		report.issues.push({ provider: 'MyAnimeList', message: messageOf(e) });
	}
}

/**
 * Delete a watchlist entry locally, then remove it from every connected
 * provider. A failed remote delete leaves a tombstone so the next sync retries
 * it instead of re-importing the title.
 */
export async function removeWatchlistEverywhere(id: number): Promise<SyncReport> {
	const entry = get(watchlist)[id];
	removeFromWatchlist(id);
	if (!entry) return emptyReport();

	const report = emptyReport();
	const current = get(settings);
	const tasks: Promise<void>[] = [];
	if (current.anilistToken) tasks.push(deleteFromAnilist(entry, report));
	if (current.malToken) tasks.push(deleteFromMal(entry, report));
	await Promise.all(tasks);
	return report;
}

/** Human-readable provider failures for a toast. */
export function syncIssueText(report: SyncReport): string {
	return report.issues.map((issue) => `${issue.provider}: ${issue.message}`).join('; ');
}

/** Show a failure toast after a local action that also tried to sync. */
export function notifyLocalSyncIssues(report: SyncReport, localMessage: string): void {
	if (report.issues.length) toast(`${localMessage} — ${syncIssueText(report)}`, false);
}
