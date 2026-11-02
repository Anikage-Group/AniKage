/** Time & number formatting helpers. */

export function timeAgo(ts: number): string {
	const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
	if (s < 60) return 'just now';
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 7) return `${d}d ago`;
	const w = Math.floor(d / 7);
	if (w < 5) return `${w}w ago`;
	return `${Math.floor(d / 30)}mo ago`;
}

/** "2d 4h", "4h 12m", "3m 20s", or "Airing now". */
export function countdown(unixSeconds: number): string {
	const diff = unixSeconds * 1000 - Date.now();
	if (diff <= 0) return 'Airing now';
	const s = Math.floor(diff / 1000);
	const d = Math.floor(s / 86400);
	const h = Math.floor((s % 86400) / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (d > 0) return `${d}d ${h}h`;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m ${sec}s`;
	return `${sec}s`;
}

export function formatTime(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function formatScore(score: number | null): string {
	if (score == null) return '—';
	return (score / 10).toFixed(1);
}

/** Format seconds as `M:SS` or `H:MM:SS` (e.g. player progress overlays). */
export function formatDuration(seconds: number | null | undefined): string {
	if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
	const total = Math.round(seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

export function toSeconds(t: string | null | undefined): number | null {
	if (!t) return null;
	const m = t.match(/^(\d+):(\d{2}):(\d{2})$/) || t.match(/^(\d+):(\d{2})$/);
	if (!m) return null;
	if (m.length === 4) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
	return Number(m[1]) * 60 + Number(m[2]);
}

export function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}
