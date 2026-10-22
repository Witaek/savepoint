/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

/**
 * Offline support:
 * - the app shell (JS, CSS, fonts, icons) is precached per version;
 * - pages and their data are network-first, falling back to the last copy seen on this device,
 *   then to offline.html;
 * - covers and banners are cache-first with their own cap, and achievement icons (there are
 *   thousands) with a separate one, so icons never push covers out;
 * - API calls always go to the network.
 */
const sw = self as unknown as ServiceWorkerGlobalScope;

const SHELL = `shell-${version}`;
const PAGES = 'pages-v1';
const COVERS = 'covers-v1';
const ICONS = 'icons-v1';
const MAX_PAGES = 60;
const MAX_COVERS = 500;
const MAX_ICONS = 800;

/** Steam and IGDB artwork. Achievement icons live under /steamcommunity/public/images/apps/. */
const IMAGE_HOSTS = [
	'shared.akamai.steamstatic.com',
	'shared.fastly.steamstatic.com',
	'cdn.akamai.steamstatic.com',
	'cdn.cloudflare.steamstatic.com',
	'steamcdn-a.akamaihd.net',
	'avatars.steamstatic.com',
	'images.igdb.com'
];
const isIcon = (url: URL) => url.pathname.includes('/steamcommunity/public/images/apps/');

const shellAssets = [...build, ...files.filter((f) => !f.endsWith('.DS_Store'))];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(SHELL)
			.then((cache) => cache.addAll(shellAssets))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key.startsWith('shell-') && key !== SHELL) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

async function trim(cacheName: string, max: number) {
	const cache = await caches.open(cacheName);
	const keys = await cache.keys();
	for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

async function networkFirst(request: Request): Promise<Response> {
	const cache = await caches.open(PAGES);
	try {
		const response = await fetch(request);
		// Only keep real pages, not redirects to /login or errors.
		if (response.ok && response.type === 'basic' && !response.redirected) {
			await cache.put(request, response.clone());
			void trim(PAGES, MAX_PAGES);
		}
		return response;
	} catch {
		const cached =
			(await cache.match(request)) ?? (await cache.match(request, { ignoreSearch: true }));
		if (cached) return cached;
		if (request.mode === 'navigate') {
			const offline = await caches.match('/offline.html');
			if (offline) return offline;
		}
		return new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
	}
}

async function cacheFirst(request: Request, cacheName: string, max: number): Promise<Response> {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	// Cross-origin images are opaque (status 0); they're still worth caching for offline use.
	// A missing Steam cover is opaque too, but still fails to decode, so the page falls back.
	if (response.ok || response.type === 'opaque') {
		await cache.put(request, response.clone());
		void trim(cacheName, max);
	}
	return response;
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);

	if (IMAGE_HOSTS.includes(url.hostname) && request.mode !== 'cors') {
		event.respondWith(
			isIcon(url) ? cacheFirst(request, ICONS, MAX_ICONS) : cacheFirst(request, COVERS, MAX_COVERS)
		);
		return;
	}
	if (url.origin !== sw.location.origin) return;
	if (url.pathname.startsWith('/api/') || url.pathname === '/logout') return;

	if (shellAssets.includes(url.pathname)) {
		event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
		return;
	}
	if (request.mode === 'navigate' || url.pathname.endsWith('/__data.json')) {
		event.respondWith(networkFirst(request));
	}
});

sw.addEventListener('message', (event) => {
	// Sent by the app when signing out, so the next person on this device doesn't see cached pages.
	if (event.data === 'clear-user-data') event.waitUntil(caches.delete(PAGES));
});
