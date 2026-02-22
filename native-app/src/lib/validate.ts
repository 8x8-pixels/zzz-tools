import type { Effect, Mod } from "./types";

export type ValidationError = {
	field: string;
	message: string;
};

const ID_RE = /^[a-zA-Z0-9_-]+$/;

export function validateEffect(e: Effect): ValidationError[] {
	const errors: ValidationError[] = [];

	if (!e.id || !e.id.trim()) {
		errors.push({ field: "id", message: "ID is required" });
	} else if (!ID_RE.test(e.id)) {
		errors.push({ field: "id", message: "ID must be alphanumeric, _, or -" });
	}

	if (!e.label || !e.label.trim()) {
		errors.push({ field: "label", message: "Label is required" });
	}

	if (!e.target) {
		errors.push({ field: "target", message: "Target is required" });
	}

	if (!e.mods || e.mods.length === 0) {
		errors.push({ field: "mods", message: "At least one mod is required" });
	} else {
		e.mods.forEach((m: Mod, i: number) => {
			if (isNaN(m.value)) {
				errors.push({ field: `mods[${i}].value`, message: "Value must be a number" });
			}
			if (m.key === "element_dmg_bonus" && !m.element) {
				errors.push({ field: `mods[${i}].element`, message: "Element is required for element_dmg_bonus" });
			}
		});
	}

	if (e.condition) {
		if (e.condition.mode === "uptime") {
			const u = e.condition.defaultUptime;
			if (u === undefined || u === null || isNaN(u)) {
				errors.push({ field: "condition.defaultUptime", message: "Uptime is required" });
			} else if (u < 0 || u > 1) {
				errors.push({ field: "condition.defaultUptime", message: "Uptime must be 0–100%" });
			}
		}
	}

	return errors;
}

export function validateUniqueIds(effects: Effect[]): ValidationError[] {
	const seen = new Map<string, number>();
	const errors: ValidationError[] = [];
	effects.forEach((e, i) => {
		if (seen.has(e.id)) {
			errors.push({
				field: `effects[${i}].id`,
				message: `Duplicate ID "${e.id}" (first at index ${seen.get(e.id)})`,
			});
		} else {
			seen.set(e.id, i);
		}
	});
	return errors;
}
