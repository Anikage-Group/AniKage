import { browser } from '$app/environment';
import { writable, type Writable } from 'svelte/store';

/** localStorage-persisted writable store. */
export function persisted<T>(key: string, initial: T): Writable<T> {
	let start = initial;
	if (browser) {
		try {
			const raw = localStorage.getItem(key);
			if (raw != null) start = JSON.parse(raw) as T;
		} catch {
			/* corrupted storage → fall back to initial */
		}
	}

	const store = writable<T>(start);

	if (browser) {
		store.subscribe((v) => {
			try {
				localStorage.setItem(key, JSON.stringify(v));
			} catch {
				/* quota / private mode */
			}
		});
	}

	return store;
}
