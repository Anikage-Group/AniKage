import { writable } from 'svelte/store';

export interface Toast {
	id: number;
	message: string;
	accent?: boolean;
}

export const toasts = writable<Toast[]>([]);
let seq = 0;

export function toast(message: string, accent = false): void {
	const id = ++seq;
	toasts.update((t) => [...t.slice(-2), { id, message, accent }]);
	setTimeout(() => {
		toasts.update((t) => t.filter((x) => x.id !== id));
	}, 2600);
}
