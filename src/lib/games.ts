/** Shared by server and pages: statuses, platforms, progress and image helpers. */

export const GAME_STATUSES = [
	'playing',
	'backlog',
	'unsorted',
	'beaten',
	'on_hold',
	'abandoned',
	'wishlist'
] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const STATUS_LABELS: Record<GameStatus, string> = {
	playing: 'Playing',
	backlog: 'Backlog',
	unsorted: 'Unsorted',
	beaten: 'Beaten',
	on_hold: 'On hold',
	abandoned: 'Abandoned',
	wishlist: 'Wishlist'
};

export const STATUS_HINTS: Record<GameStatus, string> = {
	playing: 'Playing it now',
	backlog: 'Owned, not started',
	unsorted: 'Imported from Steam, not sorted yet',
	beaten: 'Credits rolled',
	on_hold: 'Paused for now',
	abandoned: 'Not going back',
	wishlist: 'Want it'
};

export const isGameStatus = (value: unknown): value is GameStatus =>
	GAME_STATUSES.includes(value as GameStatus);

/** Platforms offered when adding a game by hand. */
export const PLATFORMS = [
	'Steam',
	'PC (other)',
	'PS5',
	'PS4',
	'Switch 2',
	'Switch',
	'Xbox Series',
	'Xbox One',
	'Steam Deck',
	'Retro',
	'Mobile',
	'Other'
] as const;

export interface Progress {
	unlocked: number;
	total: number;
}

/** Whole percent, rounded down so 99.6% never shows as 100%. */
export function percent({ unlocked, total }: Progress): number {
	if (total === 0) return 0;
	return Math.floor((unlocked / total) * 100);
}

export const isPerfect = ({ unlocked, total }: Progress) => total > 0 && unlocked >= total;

/** Steam's own artwork for an app, by size. */
export const steamImage = {
	/** 600×900 portrait cover (most games since ~2019). */
	cover: (appId: number) =>
		`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900_2x.jpg`,
	/** 460×215 store header, available for every game. */
	header: (appId: number) =>
		`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
	/** 3840×1240 library banner. */
	hero: (appId: number) =>
		`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`
};

export function formatPlaytime(minutes: number): string {
	if (minutes <= 0) return 'Not played';
	if (minutes < 60) return `${minutes} min`;
	const hours = minutes / 60;
	return hours < 10 ? `${hours.toFixed(1).replace(/\.0$/, '')} h` : `${Math.round(hours)} h`;
}

/** Rarity tiers shown on achievements, from Steam's global percentage. */
export function rarity(percentage: number | null): 'ultra' | 'rare' | 'uncommon' | 'common' | null {
	if (percentage === null) return null;
	if (percentage < 5) return 'ultra';
	if (percentage < 15) return 'rare';
	if (percentage < 40) return 'uncommon';
	return 'common';
}
