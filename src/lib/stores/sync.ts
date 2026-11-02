import { get } from 'svelte/store';
import { persisted } from '$lib/stores/persisted';

export type SyncProvider = 'anilist' | 'mal';

export interface ProviderSyncState {
	/** Remote ids that existed on the provider at the last completed sync. */
	remote: Record<string, true>;
	/** Locally removed ids whose remote delete still needs to be retried. */
	tombstones: Record<string, number>;
}

export interface SyncState {
	anilist: ProviderSyncState;
	mal: ProviderSyncState;
	/** One-time migration: older imports stored every MAL row as planned. */
	malStatusRepaired?: boolean;
}

const emptyProvider = (): ProviderSyncState => ({ remote: {}, tombstones: {} });
const initial = (): SyncState => ({ anilist: emptyProvider(), mal: emptyProvider() });

/**
 * Persistent two-way sync bookkeeping.
 *
 * `remote` is the provider's list as it looked after the last successful sync.
 * Comparing it with the current remote list lets the sync button tell a remote
 * deletion apart from a title that was only just added locally. Tombstones keep
 * a locally deleted title from being re-imported when its remote delete failed.
 */
export const syncState = persisted<SyncState>('anikage:sync-state', initial());

function providerState(state: SyncState, provider: SyncProvider): ProviderSyncState {
	return state?.[provider] ?? emptyProvider();
}

function updateProvider(
	provider: SyncProvider,
	update: (state: ProviderSyncState) => ProviderSyncState
): void {
	syncState.update((state) => {
		const safe = state ?? initial();
		return {
			...safe,
			anilist: safe.anilist ?? emptyProvider(),
			mal: safe.mal ?? emptyProvider(),
			[provider]: update(providerState(safe, provider))
		};
	});
}

function numericIds(record: Record<string, true> | undefined): Set<number> {
	const ids = new Set<number>();
	for (const key of Object.keys(record ?? {})) {
		const id = Number(key);
		if (Number.isFinite(id) && id > 0) ids.add(id);
	}
	return ids;
}

export function getRemoteIds(provider: SyncProvider): Set<number> {
	return numericIds(providerState(get(syncState), provider).remote);
}

export function replaceRemoteIds(provider: SyncProvider, ids: Iterable<number>): void {
	const remote: Record<string, true> = {};
	for (const id of ids) {
		if (Number.isFinite(id) && id > 0) remote[String(id)] = true;
	}
	updateProvider(provider, (state) => ({ ...state, remote }));
}

export function rememberRemoteId(provider: SyncProvider, id: number): void {
	if (!Number.isFinite(id) || id <= 0) return;
	updateProvider(provider, (state) => ({
		...state,
		remote: { ...state.remote, [String(id)]: true }
	}));
}

export function forgetRemoteId(provider: SyncProvider, id: number): void {
	if (!Number.isFinite(id) || id <= 0) return;
	updateProvider(provider, (state) => {
		if (!(String(id) in state.remote)) return state;
		const remote = { ...state.remote };
		delete remote[String(id)];
		return { ...state, remote };
	});
}

export function getTombstones(provider: SyncProvider): Map<number, number> {
	const tombstones = new Map<number, number>();
	const stored = providerState(get(syncState), provider).tombstones ?? {};
	for (const [key, at] of Object.entries(stored)) {
		const id = Number(key);
		if (Number.isFinite(id) && id > 0) tombstones.set(id, Number(at) || Date.now());
	}
	return tombstones;
}

export function hasTombstone(provider: SyncProvider, id: number): boolean {
	return String(id) in (providerState(get(syncState), provider).tombstones ?? {});
}

export function addTombstone(provider: SyncProvider, id: number): void {
	if (!Number.isFinite(id) || id <= 0) return;
	updateProvider(provider, (state) => ({
		...state,
		tombstones: { ...state.tombstones, [String(id)]: Date.now() }
	}));
}

export function clearTombstone(provider: SyncProvider, id: number): void {
	if (!Number.isFinite(id) || id <= 0) return;
	updateProvider(provider, (state) => {
		if (!(String(id) in state.tombstones)) return state;
		const tombstones = { ...state.tombstones };
		delete tombstones[String(id)];
		return { ...state, tombstones };
	});
}

/** Clear bookkeeping when signing out so it cannot leak into another account. */
export function resetProvider(provider: SyncProvider): void {
	syncState.update((state) => {
		const safe = state ?? initial();
		return {
			...safe,
			[provider]: emptyProvider(),
			...(provider === 'mal' ? { malStatusRepaired: false } : {})
		};
	});
}

/** Older versions imported every MAL row as planned; repair that exactly once. */
export function malStatusRepairNeeded(): boolean {
	return !get(syncState).malStatusRepaired;
}

export function markMalStatusRepaired(): void {
	syncState.update((state) => ({ ...(state ?? initial()), malStatusRepaired: true }));
}

/** Drop tombstones whose remote entry is already gone (or was deleted for us). */
export function clearResolvedTombstones(provider: SyncProvider, remoteIds: Set<number>): void {
	updateProvider(provider, (state) => {
		let changed = false;
		const tombstones = { ...state.tombstones };
		for (const key of Object.keys(tombstones)) {
			if (!remoteIds.has(Number(key))) {
				delete tombstones[key];
				changed = true;
			}
		}
		return changed ? { ...state, tombstones } : state;
	});
}
