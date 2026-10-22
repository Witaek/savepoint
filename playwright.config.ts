import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a production build with a fresh database, and a stand-in for the
 * Steam API (tests/e2e/mock-steam.mjs), so no network access is needed.
 */
const PORT = 4300;
const MOCK_PORT = 4400;
export const E2E_DATA_DIR = './test-results/e2e-data';

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
	projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
	webServer: [
		{
			command: 'node tests/e2e/mock-steam.mjs',
			url: `http://localhost:${MOCK_PORT}/health`,
			reuseExistingServer: false,
			env: { MOCK_STEAM_PORT: String(MOCK_PORT) }
		},
		{
			command: 'npm run build && node build',
			port: PORT,
			reuseExistingServer: false,
			timeout: 180_000,
			env: {
				PORT: String(PORT),
				DATA_DIR: E2E_DATA_DIR,
				DISABLE_JOBS: '1',
				STEAM_API_KEY: 'test',
				STEAM_API_URL: `http://localhost:${MOCK_PORT}`,
				STEAM_STORE_URL: `http://localhost:${MOCK_PORT}`,
				IGDB_CLIENT_ID: '',
				IGDB_CLIENT_SECRET: ''
			}
		}
	]
});
