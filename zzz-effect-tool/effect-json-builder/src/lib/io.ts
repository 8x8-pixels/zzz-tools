import type { Effect, CharacterDef, WEngineDef, DiscSetDef, Mod } from "./types";
import { defaultBaseStats } from "./types";

// ── Import helpers ──────────────────────────────────

function applyModDefaults(m: any): Mod {
	return {
		key: m.key ?? "atk_flat",
		op: m.op ?? "add",
		value: typeof m.value === "number" ? m.value : 0,
		element: m.element ?? undefined,
	};
}

function applyEffectDefaults(e: any): Effect {
	return {
		id: e.id ?? "",
		label: e.label ?? "",
		target: e.target ?? "mainDps",
		enabledByDefault: e.enabledByDefault ?? false,
		condition: e.condition ?? undefined,
		mods: (e.mods ?? []).map(applyModDefaults),
		notes: e.notes ?? undefined,
		tags: e.tags ?? undefined,
	};
}

export function parseEffectLibrary(json: any): { version: number; effects: Effect[] } {
	return {
		version: json.version ?? 1,
		effects: (json.effects ?? []).map(applyEffectDefaults),
	};
}

export function parseCharacters(json: any): { version: number; characters: CharacterDef[] } {
	return {
		version: json.version ?? 1,
		characters: (json.characters ?? []).map((c: any) => ({
			id: c.id ?? "",
			name: c.name ?? "",
			element: c.element ?? "physical",
			class: c.class ?? "Attack",
			baseStats: { ...defaultBaseStats(), ...(c.baseStats ?? {}) },
			effects: (c.effects ?? []).map(applyEffectDefaults),
			mindscape: c.mindscape
				? Object.fromEntries(
					Object.entries(c.mindscape).map(([k, v]) => [
						Number(k),
						(v as any[]).map(applyEffectDefaults),
					])
				)
				: undefined,
		})),
	};
}

export function parseWEngines(json: any): { version: number; wengines: WEngineDef[] } {
	return {
		version: json.version ?? 1,
		wengines: (json.wengines ?? []).map((w: any) => ({
			id: w.id ?? "",
			name: w.name ?? "",
			baseMods: (w.baseMods ?? []).map(applyModDefaults),
			effects: (w.effects ?? []).map(applyEffectDefaults),
		})),
	};
}

export function parseDiscSets(json: any): { version: number; discSets: DiscSetDef[] } {
	return {
		version: json.version ?? 1,
		discSets: (json.discSets ?? []).map((d: any) => ({
			setId: d.setId ?? "",
			name: d.name ?? "",
			effects2pc: (d.effects2pc ?? []).map(applyEffectDefaults),
			effects4pc: (d.effects4pc ?? []).map(applyEffectDefaults),
		})),
	};
}

// ── Read file ───────────────────────────────────────

export function readJsonFile(file: File): Promise<any> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			try {
				resolve(JSON.parse(reader.result as string));
			} catch (err) {
				reject(new Error("Invalid JSON file"));
			}
		};
		reader.onerror = () => reject(new Error("Failed to read file"));
		reader.readAsText(file);
	});
}

// ── Export helpers ───────────────────────────────────

function downloadJson(data: unknown, filename: string) {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

export function exportEffectLibrary(effects: Effect[]) {
	downloadJson({ version: 1, effects }, "effect_library.json");
}

export function exportCharacters(characters: CharacterDef[]) {
	downloadJson({ version: 1, characters }, "characters.json");
}

export function exportWEngines(wengines: WEngineDef[]) {
	downloadJson({ version: 1, wengines }, "wengines.json");
}

export function exportDiscSets(discSets: DiscSetDef[]) {
	downloadJson({ version: 1, discSets }, "disc_sets.json");
}

export function exportBundle(
	effects: Effect[],
	characters: CharacterDef[],
	wengines: WEngineDef[],
	discSets: DiscSetDef[],
) {
	downloadJson(
		{ version: 1, effects, characters, wengines, discSets },
		"effects_bundle.json"
	);
}
