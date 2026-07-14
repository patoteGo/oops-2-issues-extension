/**
 * oops 2 issues — the Reference concept (pure rules + panel).
 *
 * One module owns References end to end: the pure validation / categorization
 * / formatting / normalization rules, and the DOM/controller glue for the
 * drag & drop / browse panel. (The "#### References" markdown section lives in
 * issue-body.js — body composition is its own module.)
 *
 * The mutable runtime layer keeps its existing names — `state.attachments`,
 * `renderAttachments`, `el.attList/attCount/attInput` — that is the state/DOM
 * layer, distinct from these pure rules.
 */
import { el, state, svgNode } from "./session.js";
import { setStatus, saveDraft } from "./ui.js";

// ----- Pure Reference rules -------------------------------------------

/** Max size for a Reference — mirrors the /api/upload limit. */
export const MAX_REFERENCE_SIZE = 25 * 1024 * 1024;

/** MIME types accepted as References (mirrors /api/upload). */
export const ALLOWED_REFERENCE_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/svg+xml",
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.ms-powerpoint",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"text/plain",
	"text/markdown",
	"text/csv",
	"application/zip",
	"application/x-rar-compressed",
	"application/x-7z-compressed",
	"application/json",
	"application/xml",
	"text/html",
	"text/css",
	"text/javascript",
];

/**
 * Human-readable file size, e.g. 1536 -> "1.5 KB".
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const i = Math.min(
		units.length - 1,
		Math.floor(Math.log(bytes) / Math.log(1024)),
	);
	const value = bytes / 1024 ** i;
	const digits = i === 0 ? 0 : value < 10 ? 1 : 0;
	// Drop a trailing ".0" so 1.0 KB reads as "1 KB".
	const display = value.toFixed(digits).replace(/\.0$/, "");
	return `${display} ${units[i]}`;
}

/**
 * Is the given MIME type accepted as a Reference?
 * Mirrors the server's allow-rule (allow-list OR text/* OR empty type).
 * @param {string} type
 * @returns {boolean}
 */
export function isAllowedReferenceType(type) {
	const t = (type || "").toLowerCase();
	if (t === "") return true;
	if (t.startsWith("text/")) return true;
	return ALLOWED_REFERENCE_TYPES.includes(t);
}

/**
 * Validate a Reference file before reading/uploading it.
 * @param {{size?:number, type?:string, name?:string}|null|undefined} file
 * @returns {string|null} an error message, or null when valid
 */
export function validateReference(file) {
	if (!file) return "No file.";
	const size = typeof file.size === "number" ? file.size : 0;
	if (size > MAX_REFERENCE_SIZE) {
		return `File is too large (max ${formatFileSize(MAX_REFERENCE_SIZE)}).`;
	}
	if (!isAllowedReferenceType(file.type)) {
		return `File type "${file.type || "unknown"}" is not supported.`;
	}
	return null;
}

/**
 * Derive a coarse display category from a file's MIME type + name.
 * @param {string} type MIME type
 * @param {string} [name]
 * @returns {'image'|'video'|'audio'|'document'|'spreadsheet'|'presentation'|'archive'|'code'|'other'}
 */
export function categorizeFile(type, name = "") {
	const t = (type || "").toLowerCase();
	if (t.startsWith("image/")) return "image";
	if (t.startsWith("video/")) return "video";
	if (t.startsWith("audio/")) return "audio";
	// Check spreadsheet/presentation BEFORE the generic document markers:
	// the OpenXML MIME strings all contain "officedocument", so a naive
	// includes('document') would mis-bucket sheets & decks as documents.
	if (t.includes("sheet") || t.includes("excel")) return "spreadsheet";
	if (t.includes("presentation") || t.includes("powerpoint"))
		return "presentation";
	if (t.includes("pdf") || t.includes("word") || t.includes("msword"))
		return "document";
	if (
		t.includes("zip") ||
		t.includes("rar") ||
		t.includes("7z") ||
		t.includes("tar") ||
		t.includes("gzip")
	)
		return "archive";
	const ext = (name.split(".").pop() || "").toLowerCase();
	if (
		t.startsWith("text/") ||
		["json", "xml", "js", "ts", "py", "md", "csv", "html", "css"].includes(ext)
	)
		return "code";
	return "other";
}

/**
 * Normalize a restored Reference list into a uniform shape. Drops entries
 * without `data` so a corrupted draft cannot break the panel.
 * @param {Array} raw
 * @returns {Array<{data:string,name:string,type:string,size:number,description:string}>}
 */
export function normalizeReferences(raw) {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((a) => a && typeof a === "object" && a.data)
		.map((a) => ({
			data: a.data,
			name: a.name || "file",
			type: a.type || "application/octet-stream",
			size: typeof a.size === "number" ? a.size : 0,
			description: a.description ?? "",
		}));
}

// ----- Reference panel (drag & drop / browse) -------------------------

// File-picker accept hint (mirrors /api/upload's allow-list). The authoritative
// check is validateReference() above.
export const REFERENCE_ACCEPT =
	"image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain,text/markdown,text/csv,.json,.xml,.html,.css,.js,.zip,.rar,.7z";

function iconForCategory(cat) {
	if (cat === "image") return "image";
	if (cat === "code") return "code";
	return "fileText";
}

function readFileAsDataUrl(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(new Error("Could not read file."));
		reader.readAsDataURL(file);
	});
}

/** Read + validate a batch of Files (from <input> or drop) into state. */
export async function handleFilesAdded(fileList) {
	const files = Array.from(fileList || []).filter(Boolean);
	if (!files.length) return;
	let added = 0;
	let skipped = 0;
	for (const file of files) {
		const err = validateReference(file);
		if (err) {
			skipped++;
			setStatus("err", `${file.name}: ${err}`);
			continue;
		}
		try {
			const data = await readFileAsDataUrl(file);
			state.attachments.push({
				data,
				name: file.name || "file",
				type: file.type || "application/octet-stream",
				size: file.size,
				description: "",
			});
			added++;
		} catch (e) {
			skipped++;
			setStatus("err", `${file.name}: ${e?.message || "read failed"}`);
		}
	}
	if (added) {
		renderAttachments();
		saveDraft();
	}
	if (added && !skipped) {
		setStatus(
			"ok",
			`Attached ${added} file${added === 1 ? "" : "s"} (${state.attachments.length} total).`,
		);
	}
}

export function removeAttachment(index) {
	state.attachments.splice(index, 1);
	renderAttachments();
	saveDraft();
}

export function setAttachmentDescription(index, value) {
	if (state.attachments[index]) {
		state.attachments[index].description = value;
		saveDraft();
	}
}

export function renderAttachments() {
	const items = state.attachments;
	el.attList.replaceChildren();
	el.attCount.hidden = items.length === 0;
	el.attCount.textContent = String(items.length);
	el.attList.hidden = items.length === 0;
	items.forEach((att, i) => {
		const cat = categorizeFile(att.type, att.name);
		const row = document.createElement("div");
		row.className = "att-row";

		const ico = document.createElement("span");
		ico.className = "att-ico";
		ico.replaceChildren(svgNode(iconForCategory(cat)));

		const body = document.createElement("div");
		body.className = "att-body";
		const name = document.createElement("span");
		name.className = "att-name";
		name.textContent = att.name;
		name.title = att.name;
		const meta = document.createElement("span");
		meta.className = "att-meta";
		meta.textContent = `${formatFileSize(att.size)} · ${att.type || "file"}`;
		const desc = document.createElement("input");
		desc.type = "text";
		desc.className = "att-desc";
		desc.value = att.description;
		desc.placeholder = "Describe this reference (optional)";
		desc.setAttribute("aria-label", `Description for ${att.name}`);
		desc.addEventListener("input", (e) =>
			setAttachmentDescription(i, e.target.value),
		);
		body.append(name, meta, desc);

		const rm = document.createElement("button");
		rm.type = "button";
		rm.className = "att-clear";
		rm.title = "Remove";
		rm.setAttribute("aria-label", `Remove ${att.name}`);
		rm.replaceChildren(svgNode("x"));
		rm.addEventListener("click", (e) => {
			e.stopPropagation();
			removeAttachment(i);
		});

		row.append(ico, body, rm);
		el.attList.appendChild(row);
	});
}
