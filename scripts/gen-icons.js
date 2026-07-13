#!/usr/bin/env node
/*
 * One-shot icon generator for oops 2 issues (dependency-free).
 * Renders a rose-gradient rounded square with a bold white "EP" wordmark
 * at 4x supersampling, then box-downsamples for anti-aliasing.
 * Outputs: icons/icon16.png, icons/icon48.png, icons/icon128.png
 * Run: node scripts/gen-icons.js  (from oops-2-issues/)
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZES = [16, 48, 128];
const SS = 4; // supersample factor

// ---- tiny PNG encoder (RGBA 8-bit) ------------------------------------
const CRC_TABLE = (() => {
	const t = new Int32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c;
	}
	return t;
})();

function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++)
		c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const typeBuf = Buffer.from(type, "ascii");
	const crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
	return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type RGBA
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (width * 4 + 1)] = 0;
		rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
	}
	const idat = zlib.deflateSync(raw, { level: 9 });
	return Buffer.concat([
		sig,
		chunk("IHDR", ihdr),
		chunk("IDAT", idat),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

// ---- drawing helpers (operate on an RGBA buffer) ----------------------
function lerp(a, b, t) {
	return a + (b - a) * t;
}

function blend(dst, x, y, r, g, b, a) {
	const i = (y * dst.width + x) * 4;
	const da = dst.px[i + 3] / 255;
	const sa = a / 255;
	const out = sa + da * (1 - sa);
	if (out === 0) return;
	dst.px[i] = (r * sa + dst.px[i] * da * (1 - sa)) / out;
	dst.px[i + 1] = (g * sa + dst.px[i + 1] * da * (1 - sa)) / out;
	dst.px[i + 2] = (b * sa + dst.px[i + 2] * da * (1 - sa)) / out;
	dst.px[i + 3] = out * 255;
}

/** Filled axis-aligned rect with per-pixel coverage (gap-free, AA edges). */
function fillRect(dst, x0, y0, x1, y1, r, g, b, a) {
	const xs = Math.floor(x0);
	const xe = Math.ceil(x1);
	const ys = Math.floor(y0);
	const ye = Math.ceil(y1);
	for (let y = ys; y < ye; y++) {
		if (y < 0 || y >= dst.height) continue;
		const covY = Math.min(y + 1, y1) - Math.max(y, y0);
		if (covY <= 0) continue;
		for (let x = xs; x < xe; x++) {
			if (x < 0 || x >= dst.width) continue;
			const covX = Math.min(x + 1, x1) - Math.max(x, x0);
			if (covX <= 0) continue;
			blend(dst, x, y, r, g, b, a * covX * covY);
		}
	}
}

function roundedRect(dst, x0, y0, x1, y1, radius, colorFn) {
	for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
		if (y < 0 || y >= dst.height) continue;
		for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
			if (x < 0 || x >= dst.width) continue;
			const cx = x;
			const cy = y;
			const left = x0 + radius;
			const right = x1 - radius;
			const top = y0 + radius;
			const bottom = y1 - radius;
			let nx = cx;
			let ny = cy;
			if (cx < left) nx = left;
			else if (cx > right) nx = right;
			if (cy < top) ny = top;
			else if (cy > bottom) ny = bottom;
			const ddx = cx - nx;
			const ddy = cy - ny;
			const dist = Math.sqrt(ddx * ddx + ddy * ddy);
			let cov;
			if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
				cov =
					dist <= radius - 0.5
						? 1
						: dist >= radius + 0.5
							? 0
							: radius + 0.5 - dist;
			} else {
				cov = 0;
			}
			if (cov <= 0) continue;
			const c = colorFn(x, y);
			blend(dst, x, y, c[0], c[1], c[2], c[3] * cov);
		}
	}
}

// ---- tiny bitmap font (5x7, uppercase) --------------------------------
const FONT = {
	E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
	P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
	O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
	I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
	// digit '2' (same 5x7 grid as the letters)
	2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
};
const CELL_H = 7;
const CELL_W = 5;
const GAP = 1; // cells between letters

/**
 * Draw a word in the bitmap font, centered at (cx, cy), scaled so its width
 * fits `maxWidth` (and height stays within `maxHeight`).
 */
function drawText(dst, word, cx, cy, maxWidth, maxHeight, color) {
	const n = word.length;
	const totalCellsW = n * CELL_W + (n - 1) * GAP;
	const scale = Math.min(maxWidth / totalCellsW, maxHeight / CELL_H);
	const blockW = totalCellsW * scale;
	const blockH = CELL_H * scale;
	const oy = cy - blockH / 2;
	let ox = cx - blockW / 2;

	for (let i = 0; i < n; i++) {
		const rows = FONT[word[i]];
		if (!rows) {
			ox += (CELL_W + GAP) * scale;
			continue;
		}
		for (let row = 0; row < CELL_H; row++) {
			const line = rows[row];
			for (let col = 0; col < CELL_W; col++) {
				if (line.charAt(col) === "1") {
					fillRect(
						dst,
						ox + col * scale,
						oy + row * scale,
						ox + (col + 1) * scale,
						oy + (row + 1) * scale,
						color[0],
						color[1],
						color[2],
						color[3],
					);
				}
			}
		}
		ox += (CELL_W + GAP) * scale;
	}
}

// ---- render -----------------------------------------------------------
function render(size) {
	const W = size * SS;
	const px = Buffer.alloc(W * W * 4); // transparent
	const dst = { width: W, height: W, px };

	const grad = (x, y) => {
		const t = y / (W - 1);
		return [
			Math.round(lerp(251, 225, t)), // r: rose-400 -> rose-600
			Math.round(lerp(113, 29, t)), // g
			Math.round(lerp(133, 72, t)), // b
			255,
		];
	};

	// Background: rose-gradient rounded square.
	const pad = Math.max(1, Math.round(W * 0.04));
	const corner = W * 0.22;
	roundedRect(dst, pad, pad, W - pad, W - pad, corner, grad);

	// Foreground: bold white "O2I" wordmark, centered.
	drawText(dst, "O2I", W / 2, W / 2, W * 0.74, W * 0.62, [255, 255, 255, 255]);

	// Box-downsample to target size.
	const out = Buffer.alloc(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			const count = SS * SS;
			for (let sy = 0; sy < SS; sy++) {
				for (let sx = 0; sx < SS; sx++) {
					const i = ((y * SS + sy) * W + (x * SS + sx)) * 4;
					r += px[i];
					g += px[i + 1];
					b += px[i + 2];
					a += px[i + 3];
				}
			}
			const o = (y * size + x) * 4;
			out[o] = r / count;
			out[o + 1] = g / count;
			out[o + 2] = b / count;
			out[o + 3] = a / count;
		}
	}
	return encodePNG(size, size, out);
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const s of SIZES) {
	const buf = render(s);
	fs.writeFileSync(path.join(outDir, `icon${s}.png`), buf);
	console.log(`wrote icons/icon${s}.png (${buf.length} bytes)`);
}
