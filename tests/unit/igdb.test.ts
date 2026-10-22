import { describe, expect, it } from 'vitest';
import { mapIgdbGame } from '../../src/lib/server/providers/igdb';

describe('mapIgdbGame', () => {
	it('maps a game and finds its Steam app', () => {
		const game = mapIgdbGame({
			id: 119133,
			name: 'Elden Ring',
			cover: { image_id: 'co4jni' },
			artworks: [{ image_id: 'ar1' }],
			summary: ' Rise, Tarnished. ',
			first_release_date: 1_645_747_200,
			genres: [{ name: 'Role-playing (RPG)' }],
			platforms: [{ abbreviation: 'PS5', name: 'PlayStation 5' }, { name: 'Google Stadia' }],
			involved_companies: [
				{ developer: true, company: { name: 'FromSoftware' } },
				{ developer: false, company: { name: 'Bandai Namco' } }
			],
			external_games: [
				{ external_game_source: 5, uid: 'gog-id' },
				{ external_game_source: 1, uid: '1245620' }
			]
		});
		expect(game).toEqual({
			igdbId: 119133,
			name: 'Elden Ring',
			cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co4jni.jpg',
			hero: 'https://images.igdb.com/igdb/image/upload/t_1080p/ar1.jpg',
			summary: 'Rise, Tarnished.',
			releaseDate: '2022-02-25',
			developers: ['FromSoftware'],
			genres: ['Role-playing (RPG)'],
			platforms: ['PS5', 'Google Stadia'],
			steamAppId: 1245620
		});
	});

	it('accepts the older category field and games without Steam', () => {
		expect(
			mapIgdbGame({ id: 1, name: 'A', external_games: [{ category: 1, uid: '42' }] }).steamAppId
		).toBe(42);
		expect(mapIgdbGame({ id: 2, name: 'B' })).toMatchObject({
			cover: null,
			hero: null,
			releaseDate: null,
			steamAppId: null
		});
	});
});
