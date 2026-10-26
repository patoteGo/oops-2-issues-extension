// Description zoom — issue #1.
// Toggles the description card between its normal sidebar size (width still
// controlled by the existing width divider) and a fullscreen mode that fills
// the extension window, so images and markdown render large, stay scrollable,
// and are easy to copy/paste.

const MAX_SVG =
	'<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg>';
const RESTORE_SVG =
	'<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4"/></svg>';

function initDescriptionZoom(doc = document) {
	const card = doc.getElementById('descriptionCard');
	const btn = doc.getElementById('descZoomBtn');
	if (!card || !btn) return null;

	function apply(zoomed) {
		card.classList.toggle('card--zoom', zoomed);
		btn.setAttribute('aria-pressed', String(zoomed));
		btn.title = zoomed ? 'Restore description size' : 'Maximize description';
		btn.setAttribute('aria-label', btn.title);
		btn.innerHTML = zoomed ? RESTORE_SVG : MAX_SVG;
	}

	apply(false);

	btn.addEventListener('click', () => {
		apply(!card.classList.contains('card--zoom'));
	});

	doc.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && card.classList.contains('card--zoom')) {
			apply(false);
		}
	});

	return { apply };
}

export { initDescriptionZoom, MAX_SVG, RESTORE_SVG };

if (typeof document !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => initDescriptionZoom());
	} else {
		initDescriptionZoom();
	}
}
