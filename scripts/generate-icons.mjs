// Renders the PNG icons (PWA, Apple touch icon) from static/favicon.svg: `npm run icons`.
import { mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync(new URL('../static/favicon.svg', import.meta.url));
const out = new URL('../static/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };
for (const [name, size] of Object.entries(sizes)) {
	await sharp(svg, { density: 512 }).resize(size, size).png().toFile(new URL(name, out).pathname);
}
// Maskable: the artwork shrunk into the safe zone on the same background.
const inner = await sharp(svg, { density: 512 }).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0c0b09' } })
	.composite([{ input: inner, top: 56, left: 56 }])
	.png()
	.toFile(new URL('icon-maskable-512.png', out).pathname);
console.log('Icons written to static/icons/');
