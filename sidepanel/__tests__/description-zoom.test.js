import { describe, it, expect, beforeEach } from 'vitest';
import { initDescriptionZoom } from '../description-zoom.js';

describe('description zoom (fullscreen) toggle', () => {
	let card, btn, api;

	beforeEach(() => {
		document.body.innerHTML = `
			<div id="descriptionCard" class="card">
				<textarea id="description"></textarea>
				<article id="preview" hidden></article>
			</div>
			<button id="descZoomBtn"></button>
		`;
		card = document.getElementById('descriptionCard');
		btn = document.getElementById('descZoomBtn');
		api = initDescriptionZoom(document);
	});

	it('starts in normal mode', () => {
		expect(card.classList.contains('card--zoom')).toBe(false);
		expect(btn.getAttribute('aria-pressed')).toBe('false');
		expect(btn.getAttribute('title')).toMatch(/maximize/i);
	});

	it('maximizes the description card on click', () => {
		btn.click();
		expect(card.classList.contains('card--zoom')).toBe(true);
		expect(btn.getAttribute('aria-pressed')).toBe('true');
		expect(btn.getAttribute('title')).toMatch(/restore/i);
	});

	it('restores the previous size on second click', () => {
		btn.click();
		btn.click();
		expect(card.classList.contains('card--zoom')).toBe(false);
		expect(btn.getAttribute('aria-pressed')).toBe('false');
	});

	it('exposes an imperative apply() for tests', () => {
		api.apply(true);
		expect(card.classList.contains('card--zoom')).toBe(true);
		api.apply(false);
		expect(card.classList.contains('card--zoom')).toBe(false);
	});

	it('returns null when elements are missing (other views)', () => {
		document.body.innerHTML = '<div></div>';
		expect(initDescriptionZoom(document)).toBeNull();
	});

	it('leaves the DOM outside the card untouched', () => {
		const repo = document.createElement('select');
		repo.id = 'repo';
		document.body.appendChild(repo);
		let changeCount = 0;
		repo.addEventListener('change', () => changeCount++);
		btn.click();
		btn.click();
		expect(changeCount).toBe(0);
		expect(repo.value).toBe('');
	});
});
