import { devices, expect, test, type Page } from '@playwright/test';

/** One account walks through the whole app, in order (the database starts empty). */
test.describe.configure({ mode: 'serial' });

const MOCK = 'http://localhost:4400';
let page: Page;

test.beforeAll(async ({ browser }) => {
	page = await browser.newPage();
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

test('works on a phone', async ({ browser }) => {
	const phone = await browser.newContext({ ...devices['Pixel 7'] });
	const p = await phone.newPage();
	await signIn(p);
	const tabs = p.getByRole('navigation', { name: 'Main' }).last();
	await tabs.getByRole('link', { name: 'Library' }).click();
	await expect(p).toHaveURL('/library');
	const width = await p.evaluate(() => document.documentElement.scrollWidth);
	expect(width).toBeLessThanOrEqual(p.viewportSize()!.width);
	await phone.close();
});
