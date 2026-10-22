/** Dates and numbers, formatted for people. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(date: Date | string | number, now = Date.now()): string {
	const time = new Date(date).getTime();
	const diff = now - time;
	if (time <= 0) return 'long ago';
	if (diff < MINUTE) return 'just now';
	if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
	if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
	if (diff < 2 * DAY) return 'yesterday';
	if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} days ago`;
	return formatDate(date);
}

export function formatDate(date: Date | string | number): string {
	const d = new Date(date);
	if (d.getTime() <= 0) return 'Unknown date';
	return d.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
	});
}

export const formatNumber = (n: number) => n.toLocaleString('en-US');
