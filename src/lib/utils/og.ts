import { browser } from '$app/environment';

/**
 * Open Graph / Twitter card tags.
 *
 * The app renders on the client (`ssr = false`), so the static tags in
 * `app.html` are only a fallback — pages call `setOg()` once their data
 * arrives to replace them with the real title, description and image.
 */

export interface OgData {
	/** Page title, e.g. the anime or episode name. */
	title: string;
	/** Short summary used for the link preview. */
	description?: string;
	/** Absolute or root-relative preview image. */
	image?: string;
	/** Canonical URL of the page. */
	url?: string;
	/** `video.episode` for a watch page, `video.movie` / `website` otherwise. */
	type?: string;
	/** Extra `og:*` tags (e.g. `video:duration`). */
	extra?: Record<string, string>;
}

/** Fallback preview image — the site-wide card in `static/og.png`. */
export const OG_FALLBACK_IMAGE = '/og.png';
const OG_FALLBACK_TITLE = 'Anikage — Cinematic Anime Streaming';
const OG_FALLBACK_DESCRIPTION = 'Stream anime with a fast, distraction-free player.';

/** Absolute URL for a preview image (crawlers need one). */
function absoluteImage(image: string): string {
	if (/^https?:\/\//i.test(image)) return image;
	if (!browser) return image;
	return new URL(image, location.origin).href;
}

/** Create or update a single `<meta>` tag and return its element. */
function meta(attr: 'property' | 'name', key: string): HTMLMetaElement {
	const selector = `meta[${attr}="${key}"]`;
	let el = document.head.querySelector<HTMLMetaElement>(selector);
	if (!el) {
		el = document.createElement('meta');
		el.setAttribute(attr, key);
		document.head.appendChild(el);
	}
	return el;
}

/**
 * Replace the Open Graph / Twitter card tags with the given page data.
 * Missing values fall back to the site defaults.
 */
export function setOg(data: Partial<OgData>): void {
	if (!browser) return;

	const title = data.title?.trim() || OG_FALLBACK_TITLE;
	const description = data.description?.trim() || OG_FALLBACK_DESCRIPTION;
	const image = absoluteImage(data.image?.trim() || OG_FALLBACK_IMAGE);
	const type = data.type?.trim() || 'website';

	meta('property', 'og:title').content = title;
	meta('property', 'og:description').content = description;
	meta('property', 'og:image').content = image;
	meta('property', 'og:type').content = type;
	meta('property', 'og:site_name').content = 'Anikage';

	// A stale URL from the previous page is worse than none at all.
	const urlMeta = meta('property', 'og:url');
	if (data.url?.trim()) {
		urlMeta.content = data.url.trim();
	} else {
		urlMeta.remove();
	}

	meta('name', 'twitter:card').content = 'summary_large_image';
	meta('name', 'twitter:title').content = title;
	meta('name', 'twitter:description').content = description;
	meta('name', 'twitter:image').content = image;

	// Drop any stale extra tags from a previous page.
	for (const el of Array.from(document.head.querySelectorAll('meta[property^="video:"]'))) {
		el.remove();
	}
	for (const [key, value] of Object.entries(data.extra ?? {})) {
		meta('property', key).content = value;
	}

	// Keep the plain description in sync with the preview description.
	const desc = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
	if (desc) desc.content = description;
}
