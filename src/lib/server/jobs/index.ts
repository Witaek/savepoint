import { lt } from 'drizzle-orm';
import { purgeExpiredSessions } from '../auth';
import { purgeExpiredCache } from '../cache';
import { getDb } from '../db/client';
import { jobRuns } from '../db/schema';
import { scheduledBackup } from '../services/backup';
import { syncEveryone } from '../services/steam-sync';
import { registerJobs, type JobDefinition } from './scheduler';

const DAY = 24 * 60 * 60 * 1000;

export const jobs: JobDefinition[] = [
	{
		// Games played in the last two weeks: new unlocks show up within 15 minutes.
		name: 'steam-recent',
		schedule: '*/15 * * * *',
		run: () => syncEveryone('quick')
	},
	{
		// The whole library: new purchases, playtime, and achievements not read for a month.
		name: 'steam-library',
		schedule: '10 3 * * *', // daily 03:10
		runOnStart: true,
		run: () => syncEveryone('full')
	},
	{
		name: 'backup',
		schedule: '30 3 * * *', // daily 03:30
		run: scheduledBackup
	},
	{
		name: 'cleanup',
		schedule: '15 4 * * *', // daily 04:15
		async run() {
			const cache = purgeExpiredCache();
			const sessions = purgeExpiredSessions();
			const runs = getDb()
				.delete(jobRuns)
				.where(lt(jobRuns.startedAt, new Date(Date.now() - 30 * DAY)))
				.run().changes;
			return `removed ${cache} cache entries, ${sessions} expired sessions and ${runs} old job runs`;
		}
	}
];

export function startJobs(): void {
	registerJobs(jobs);
}
