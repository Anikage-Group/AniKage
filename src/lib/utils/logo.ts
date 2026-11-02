/**
 * Crop fully-transparent margins from transparent title art (clearlogo).
 *
 * Loads the image with CORS so the canvas isn't tainted. If the asset refuses
 * CORS (or the canvas fails for any reason), resolve `null` so callers can fall
 * back to the original URL — the logo still renders, just without trimming.
 */
export function trimTransparentLogo(url: string): Promise<string | null> {
	return new Promise((resolve) => {
		if (typeof document === 'undefined') return resolve(null);
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			try {
				const w = img.naturalWidth;
				const h = img.naturalHeight;
				if (!w || !h) return resolve(null);
				const canvas = document.createElement('canvas');
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext('2d');
				if (!ctx) return resolve(null);
				ctx.drawImage(img, 0, 0);
				const { data } = ctx.getImageData(0, 0, w, h);
				let top = h;
				let left = w;
				let right = -1;
				let bottom = -1;
				for (let y = 0; y < h; y++) {
					for (let x = 0; x < w; x++) {
						if (data[(y * w + x) * 4 + 3] > 8) {
							if (y < top) top = y;
							if (y > bottom) bottom = y;
							if (x < left) left = x;
							if (x > right) right = x;
						}
					}
				}
				// Nothing visible, or already tight → keep the original.
				if (right < 0 || bottom < 0) return resolve(null);
				if (left === 0 && top === 0 && right === w - 1 && bottom === h - 1) {
					return resolve(null);
				}
				// 2% padding so glyph edges never clip.
				const padX = Math.round((right - left + 1) * 0.02);
				const padY = Math.round((bottom - top + 1) * 0.02);
				const cx = Math.max(0, left - padX);
				const cy = Math.max(0, top - padY);
				const cw = Math.min(w - cx, right - left + 1 + padX * 2);
				const ch = Math.min(h - cy, bottom - top + 1 + padY * 2);
				const out = document.createElement('canvas');
				out.width = cw;
				out.height = ch;
				const octx = out.getContext('2d');
				if (!octx) return resolve(null);
				octx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
				resolve(out.toDataURL('image/png'));
			} catch {
				// Canvas tainted (no CORS) — use the original art.
				resolve(null);
			}
		};
		img.onerror = () => resolve(null);
		img.src = url;
	});
}
