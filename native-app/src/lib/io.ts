import type { Effect, CharacterDef, WEngineDef, DiscSetDef, Mod } from "./types";
import { defaultBaseStats } from "./types";
import { saveJsonFile } from "./tauri";

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

// ── Export helpers ───────────────────────────────────

export async function exportEffectLibrary(effects: Effect[]) {
	await saveJsonFile("effect_library.json", JSON.stringify({ version: 1, effects }, null, 2));
}

export async function exportCharacters(characters: CharacterDef[]) {
	await saveJsonFile("characters.json", JSON.stringify({ version: 1, characters }, null, 2));
}

export async function exportWEngines(wengines: WEngineDef[]) {
	await saveJsonFile("wengines.json", JSON.stringify({ version: 1, wengines }, null, 2));
}

export async function exportDiscSets(discSets: DiscSetDef[]) {
	await saveJsonFile("disc_sets.json", JSON.stringify({ version: 1, discSets }, null, 2));
}

export async function exportBundle(
	effects: Effect[],
	characters: CharacterDef[],
	wengines: WEngineDef[],
	discSets: DiscSetDef[],
) {
	await saveJsonFile(
		"effects_bundle.json",
		JSON.stringify({ version: 1, effects, characters, wengines, discSets }, null, 2)
	);
}
