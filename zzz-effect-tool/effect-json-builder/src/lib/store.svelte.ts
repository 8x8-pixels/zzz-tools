import type {
	AppState, Effect, CharacterDef, WEngineDef, DiscSetDef, TabId,
} from "./types";

const STORAGE_KEY = "effect-json-builder-state";

// ── Default state ───────────────────────────────────

function defaultState(): AppState {
	return {
		version: 1,
		effectLibrary: [],
		characters: [],
		wengines: [],
		discSets: [],
		selectedTab: "library",
		selectedId: undefined,
		dirty: false,
	};
}

// ── Load / Save ─────────────────────────────────────

function loadFromStorage(): AppState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return { ...defaultState(), ...parsed, dirty: false };
		}
	} catch {
		// ignore
	}
	return defaultState();
}

function saveToStorage(state: AppState) {
	try {
		const { dirty: _, selectedTab: __, selectedId: ___, ...data } = state;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch {
		// ignore
	}
}

// ── Reactive store (Svelte 5 runes-compatible) ──────

function createStore() {
	let state = $state<AppState>(loadFromStorage());
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleSave() {
		state.dirty = true;
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveToStorage(state), 300);
	}

	return {
		get state() { return state; },

		// ── Tab ──
		selectTab(tab: TabId) { state.selectedTab = tab; state.selectedId = undefined; },
		selectId(id: string | undefined) { state.selectedId = id; },

		// ── Effect Library ──
		addEffect(e: Effect) { state.effectLibrary.push(e); scheduleSave(); },
		updateEffect(idx: number, e: Effect) { state.effectLibrary[idx] = e; scheduleSave(); },
		removeEffect(idx: number) { state.effectLibrary.splice(idx, 1); state.selectedId = undefined; scheduleSave(); },
		duplicateEffect(idx: number) {
			const src = state.effectLibrary[idx];
			const dup = JSON.parse(JSON.stringify(src));
			dup.id = src.id + "_copy";
			dup.label = src.label + " (Copy)";
			state.effectLibrary.splice(idx + 1, 0, dup);
			scheduleSave();
		},

		// ── Characters ──
		addCharacter(c: CharacterDef) { state.characters.push(c); scheduleSave(); },
		updateCharacter(idx: number, c: CharacterDef) { state.characters[idx] = c; scheduleSave(); },
		removeCharacter(idx: number) { state.characters.splice(idx, 1); state.selectedId = undefined; scheduleSave(); },

		// ── W-Engines ──
		addWEngine(w: WEngineDef) { state.wengines.push(w); scheduleSave(); },
		updateWEngine(idx: number, w: WEngineDef) { state.wengines[idx] = w; scheduleSave(); },
		removeWEngine(idx: number) { state.wengines.splice(idx, 1); state.selectedId = undefined; scheduleSave(); },

		// ── Disc Sets ──
		addDiscSet(d: DiscSetDef) { state.discSets.push(d); scheduleSave(); },
		updateDiscSet(idx: number, d: DiscSetDef) { state.discSets[idx] = d; scheduleSave(); },
		removeDiscSet(idx: number) { state.discSets.splice(idx, 1); state.selectedId = undefined; scheduleSave(); },

		// ── Bulk ──
		replaceEffectLibrary(effects: Effect[]) { state.effectLibrary = effects; scheduleSave(); },
		replaceCharacters(chars: CharacterDef[]) { state.characters = chars; scheduleSave(); },
		replaceWEngines(we: WEngineDef[]) { state.wengines = we; scheduleSave(); },
		replaceDiscSets(ds: DiscSetDef[]) { state.discSets = ds; scheduleSave(); },

		reset() { Object.assign(state, defaultState()); localStorage.removeItem(STORAGE_KEY); },
	};
}

export const store = createStore();
