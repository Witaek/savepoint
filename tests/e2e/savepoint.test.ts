import { devices, expect, test, type Page } from '@playwright/test';

/**
 * One account walks through the whole app, in order (the database starts empty), so a retry
 * would start from the middle: no retries.
 */
test.describe.configure({ mode: 'serial', retries: 0 });

/** A 1×1 PNG served for every Steam/IGDB image, so pages look the same with or without network. */
const PIXEL = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	'base64'
);
const IMAGES = /steamstatic\.com|akamaihd\.net|images\.igdb\.com/;

const MOCK = 'http://localhost:4400';
let page: Page;

test.beforeAll(async ({ browser }) => {
	// The service worker would fetch images itself, past the stub.
	page = await browser.newPage({ serviceWorkers: 'block' });
	await page.route(IMAGES, (route) =>
		route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
	);
});

async function signIn(p: Page) {
	await p.goto('/login');
	await p.getByLabel('Username').fill('ashen');
	await p.getByLabel('Password').fill('password123');
	await p.getByRole('button', { name: 'Sign in' }).click();
	await expect(p).toHaveURL('/');
}

test('first start creates the admin account', async () => {
	await page.goto('/');
	await expect(page).toHaveURL('/setup');
	await page.getByLabel('Username').fill('ashen');
	await page.getByLabel('Password', { exact: true }).fill('password123');
	await page.getByLabel('Confirm password').fill('password123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL('/');
	await expect(page.getByText('Kindle your first bonfire')).toBeVisible();
});

test('linking Steam imports the library and achievements', async () => {
	await page.goto('/settings');
	await page.getByLabel('Profile link or SteamID').fill('https://steamcommunity.com/id/nobody');
	await page.getByRole('button', { name: 'Link Steam' }).click();
	await expect(page.getByText('No Steam profile is called "nobody"')).toBeVisible();

	await page.getByLabel('Profile link or SteamID').fill('https://steamcommunity.com/id/ashenone/');
	await page.getByRole('button', { name: 'Link Steam' }).click();
	await expect(page.getByText(/Last sync: 7 games, \d+ achievements imported/)).toBeVisible({
		timeout: 30_000
	});

	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'ELDEN RING' })).toBeVisible();
	await expect(page.getByText('38 / 42')).toBeVisible();
	await expect(page.getByText('3 games from Steam are waiting to be sorted')).toBeVisible();
});

test('the library filters, sorts and triages', async () => {
	await page.goto('/library');
	await expect(page.locator('main li a[href^="/game/"]')).toHaveCount(7);
	await page.getByRole('button', { name: /^100%/ }).click();
	await expect(page).toHaveURL(/status=perfected/);
	await expect(page.locator('main li a[href^="/game/"]')).toHaveCount(1);

	await page.getByRole('button', { name: /^Unsorted/ }).click();
	const row = page.locator('li', { hasText: 'Hollow Knight' });
	await row.getByRole('button', { name: 'Abandoned' }).click();
	await expect(page.locator('li', { hasText: 'Hollow Knight' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Abandoned 1/ })).toBeVisible();
});

test('a game page lists achievements, locked first, with hidden ones blurred', async () => {
	await page.goto('/library');
	await page
		.getByRole('link', { name: /KINGDOM HEARTS/ })
		.first()
		.click();
	await expect(page.getByRole('heading', { name: /KINGDOM HEARTS/ })).toBeVisible();
	await expect(page.getByText('Achievements · 61 / 100')).toBeVisible();
	const reveal = page.getByRole('button', { name: 'Reveal hidden achievement' }).first();
	await reveal.click();
	await expect(page.getByRole('button', { name: 'Reveal hidden achievement' })).toHaveCount(1);
	// Achievements of a game owned on Steam can't be ticked by hand.
	await expect(page.getByRole('button', { name: /Mark .* as unlocked/ })).toHaveCount(0);
});

test('search adds a game, and a game added by hand gets a checklist', async () => {
	await page.goto('/search?q=nightreign');
	await expect(page.getByText('In library · Wishlist')).toBeVisible();

	await page.getByRole('button', { name: 'Add a game by hand' }).click();
	await page.locator('#manual-name').fill('Bloodborne');
	await page.locator('#manual-platform').selectOption('PS4');
	await page.locator('form[action="?/manual"]').getByRole('button', { name: 'Add' }).click();
	await expect(page.getByRole('heading', { name: 'Bloodborne' })).toBeVisible();

	for (const name of ['Defeat Ludwig', 'Defeat Orphan of Kos']) {
		if (await page.getByRole('button', { name: '+ Add an item' }).isVisible()) {
			await page.getByRole('button', { name: '+ Add an item' }).click();
		}
		await page.locator('#item-name').fill(name);
		await page.locator('form[action="?/addItem"]').getByRole('button', { name: 'Add' }).click();
		await expect(page.getByText(name, { exact: true })).toBeVisible();
	}
	await page.getByRole('button', { name: 'Tick Defeat Ludwig' }).click();
	await expect(page.getByText('Checklist · 1 / 2')).toBeVisible();
});

test('reaching 100% is celebrated once and enshrined', async () => {
	await fetch(`${MOCK}/mock/unlock?appid=1245620&count=4`, { method: 'POST' });
	await page.goto('/library');
	await page.getByRole('link', { name: 'ELDEN RING' }).first().click();
	await page.getByRole('button', { name: 'Sync' }).click();
	await expect(page.getByText('4 new achievements.')).toBeVisible();

	await page.goto('/');
	const moment = page.getByRole('dialog', { name: 'PERFECTION ACHIEVED' });
	await expect(moment).toBeVisible();
	await moment.getByRole('button', { name: 'Continue' }).click();
	await expect(moment).toHaveCount(0);
	await page.reload();
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await page.goto('/hall-of-fame');
	await expect(page.getByText('2 games taken to 100%.')).toBeVisible();
});

test('a collection splits into games, each with its own progress', async () => {
	await page.goto('/library');
	await page
		.getByRole('link', { name: /KINGDOM HEARTS/ })
		.first()
		.click();
	await page.waitForURL(/\/game\/\d+$/);
	const gameUrl = page.url();
	await page.getByRole('link', { name: /Split it into games/ }).click();
	await expect(page.getByRole('heading', { name: 'SPLIT INTO GAMES' })).toBeVisible();

	// The API names start with one prefix per game: Savepoint suggests the groups.
	const names = [
		'Kingdom Hearts Final Mix',
		'Re:Chain of Memories',
		'Kingdom Hearts II Final Mix',
		'Birth by Sleep Final Mix'
	];
	for (const [i, name] of names.entries()) await page.locator(`#suggest-${i}`).fill(name);
	await page.getByRole('button', { name: 'Create these groups' }).click();
	await expect(page.getByText('API name starts with BBS_')).toBeVisible();

	// One achievement moved by hand stays there.
	await page.getByRole('button', { name: /^All/ }).click();
	await page.getByLabel('Select Keyblade Trial 1', { exact: true }).check();
	await page.locator('#move-target').selectOption({ label: 'Birth by Sleep Final Mix' });
	await page.getByRole('button', { name: 'Move', exact: true }).click();
	await expect(page.getByText('Moved 1 achievement.')).toBeVisible();
	await expect(page.getByText('KH1_000 · Birth by Sleep Final Mix (by hand)')).toBeVisible();

	// The split downloads as a file another server can import.
	const id = gameUrl.match(/game\/(\d+)/)![1];
	const file = await (await page.request.get(`/api/games/${id}/split`)).json();
	expect(file.groups.map((g: { name: string }) => g.name)).toEqual(names);
	expect(file.groups[3].achievements).toEqual(['KH1_000']);

	// The game page has a tab per game, with its own progress.
	await page.goto(gameUrl);
	const parts = page.getByRole('navigation', { name: 'Parts of this game' });
	await expect(parts.getByRole('button', { name: /Re:Chain of Memories/ })).toContainText('100%');
	const bbs = parts.getByRole('button', { name: /Birth by Sleep Final Mix/ });
	await expect(bbs).toContainText('1 / 26');
	await bbs.click();
	await expect(
		page.getByRole('heading', { name: /Birth by Sleep Final Mix · 1 \/ 26/ })
	).toBeVisible();
});

test('Settings names the games Steam refused, and why', async () => {
	await fetch(`${MOCK}/mock/refuse?appid=367520`, { method: 'POST' });
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Re-read everything' }).click();
	await expect(page.getByText(/1 game Steam didn't answer for/)).toBeVisible({ timeout: 30_000 });
	await page.getByText('1 game Steam didn’t give achievements for').click();
	const item = page.getByRole('link', { name: /Hollow Knight/ });
	await expect(item).toContainText('Steam answered 403: Profile is not public');
	await item.click();
	await expect(page.getByRole('heading', { name: 'Hollow Knight' })).toBeVisible();
});

test('fits the narrowest phone, with Settings, Stats and Back at hand', async ({ browser }) => {
	// iPhone SE: 320px. A phone browser widens its layout to fit content that overflows, so
	// "nothing is wider than the page" isn't enough: the page must stay as wide as the screen.
	const phone = await browser.newContext({ ...devices['iPhone SE'], serviceWorkers: 'block' });
	await phone.route(IMAGES, (route) =>
		route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
	);
	const p = await phone.newPage();
	await signIn(p);
	const screen = p.viewportSize()!.width;
	for (const path of [
		'/',
		'/library',
		'/library?status=unsorted',
		'/search?q=elden',
		'/hall-of-fame',
		'/stats',
		'/settings'
	]) {
		await p.goto(path);
		const width = await p.evaluate(() =>
			Math.max(window.innerWidth, document.documentElement.scrollWidth)
		);
		expect(width, `${path} is wider than the screen`).toBeLessThanOrEqual(screen);
	}

	// Game pages, including one with a long one-word title.
	await p.goto('/library');
	for (const name of [/KINGDOM HEARTS/, /Bloodborne/i]) {
		await p.getByRole('link', { name }).first().click();
		await expect(p.getByRole('heading', { level: 1 })).toBeVisible();
		const width = await p.evaluate(() =>
			Math.max(window.innerWidth, document.documentElement.scrollWidth)
		);
		expect(width).toBeLessThanOrEqual(screen);
		// The installed app has no browser back button.
		await p.getByRole('link', { name: 'Back' }).click();
		await expect(p).toHaveURL('/library');
	}

	// The split editor and the game's tabs fit too.
	await p
		.getByRole('link', { name: /KINGDOM HEARTS/ })
		.first()
		.click();
	await p.getByRole('link', { name: /Edit how this game is split/ }).click();
	await expect(p.getByRole('heading', { name: 'SPLIT INTO GAMES' })).toBeVisible();
	expect(
		await p.evaluate(() => Math.max(window.innerWidth, document.documentElement.scrollWidth))
	).toBeLessThanOrEqual(screen);

	// Five tabs, with Stats; Settings is the gear at the top.
	const tabs = p.getByRole('navigation', { name: 'Main' }).last();
	await tabs.getByRole('link', { name: 'Stats' }).click();
	await expect(p).toHaveURL('/stats');
	await p.getByRole('link', { name: 'Settings' }).click();
	await expect(p).toHaveURL('/settings');
	await phone.close();
});
