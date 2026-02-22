/**
 * Convert a label string to a URL-safe slug.
 * Japanese / CJK characters are dropped; Latin chars are lowered.
 */
export function toSlug(label: string): string {
	return label
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")          // strip diacritics
		.replace(/[^\x20-\x7E]/g, "")             // strip non-ASCII
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")              // non-alphanum → _
		.replace(/^_|_$/g, "");                    // trim leading/trailing _
}
