<script lang="ts">
  import type { CharacterDef, Effect, Element, CharacterClass } from "../lib/types";
  import { ELEMENTS, CHARACTER_CLASSES, defaultBaseStats } from "../lib/types";
  import { store } from "../lib/store.svelte";
  import EntityList from "./EntityList.svelte";
  import EffectEditor from "./EffectEditor.svelte";
  import JsonPreview from "./JsonPreview.svelte";

  let editingEffect = $state<{
    charIdx: number;
    section: "effects" | number; // "effects" or mindscape level
    effectIdx: number;
    effect: Effect;
  } | null>(null);

  let selectedCharId = $state<string | undefined>(undefined);

  let selectedCharIdx = $derived(
    selectedCharId != null
      ? store.state.characters.findIndex((c) => c.id === selectedCharId)
      : -1
  );
  let selectedChar = $derived(
    selectedCharIdx >= 0 ? store.state.characters[selectedCharIdx] : null
  );

  let showAdvancedStats = $state(false);

  function addChar() {
    const id = `char_${Date.now()}`;
    const newChar: CharacterDef = {
      id,
      name: "New Character",
      element: "physical",
      class: "Attack",
      baseStats: defaultBaseStats(),
      effects: [],
      mindscape: {},
    };
    store.addCharacter(newChar);
    selectedCharId = id;
  }

  function removeChar(id: string) {
    const idx = store.state.characters.findIndex((c) => c.id === id);
    if (idx >= 0) store.removeCharacter(idx);
    if (selectedCharId === id) selectedCharId = undefined;
  }

  function updateCharField(field: "id" | "name" | "element" | "class", val: string) {
    if (selectedCharIdx < 0) return;
    const copy: CharacterDef = { ...store.state.characters[selectedCharIdx], [field]: val };
    store.updateCharacter(selectedCharIdx, copy);
    if (field === "id") selectedCharId = val;
  }

  function updateBaseStat(key: string, raw: string) {
    if (selectedCharIdx < 0) return;
    const num = parseFloat(raw);
    const copy = deepCopyChar(store.state.characters[selectedCharIdx]);
    (copy.baseStats as any)[key] = isNaN(num) ? 0 : num;
    store.updateCharacter(selectedCharIdx, copy);
  }

  function updateBaseStatPct(key: string, raw: string) {
    if (selectedCharIdx < 0) return;
    const num = parseFloat(raw);
    const copy = deepCopyChar(store.state.characters[selectedCharIdx]);
    (copy.baseStats as any)[key] = isNaN(num) ? 0 : num / 100;
    store.updateCharacter(selectedCharIdx, copy);
  }

  // ── Effects ──
  function addEffect(section: "effects" | number) {
    if (selectedCharIdx < 0) return;
    const newEffect: Effect = {
      id: `${selectedChar!.id}_eff_${Date.now()}`,
      label: "",
      target: "mainDps",
      enabledByDefault: true,
      mods: [],
    };
    editingEffect = { charIdx: selectedCharIdx, section, effectIdx: -1, effect: newEffect };
  }

  function editEffect(section: "effects" | number, effectIdx: number) {
    if (selectedCharIdx < 0) return;
    const arr = getEffectsForSection(section);
    editingEffect = {
      charIdx: selectedCharIdx,
      section,
      effectIdx,
      effect: JSON.parse(JSON.stringify(arr[effectIdx])),
    };
  }

  function removeEffect(section: "effects" | number, effectIdx: number) {
    if (selectedCharIdx < 0) return;
    const copy = deepCopyChar(store.state.characters[selectedCharIdx]);
    if (section === "effects") {
      copy.effects = copy.effects.filter((_, i) => i !== effectIdx);
    } else {
      const level = section as number;
      if (copy.mindscape?.[level]) {
        copy.mindscape[level] = copy.mindscape[level].filter((_, i) => i !== effectIdx);
      }
    }
    store.updateCharacter(selectedCharIdx, copy);
  }

  function saveEffect(e: Effect) {
    if (!editingEffect || selectedCharIdx < 0) return;
    const copy = deepCopyChar(store.state.characters[selectedCharIdx]);
    const section = editingEffect.section;

    if (section === "effects") {
      if (editingEffect.effectIdx < 0) {
        copy.effects = [...copy.effects, e];
      } else {
        copy.effects = copy.effects.map((x, i) => (i === editingEffect!.effectIdx ? e : x));
      }
    } else {
      const level = section as number;
      if (!copy.mindscape) copy.mindscape = {};
      if (!copy.mindscape[level]) copy.mindscape[level] = [];
      if (editingEffect.effectIdx < 0) {
        copy.mindscape[level] = [...copy.mindscape[level], e];
      } else {
        copy.mindscape[level] = copy.mindscape[level].map((x, i) => (i === editingEffect!.effectIdx ? e : x));
      }
    }
    store.updateCharacter(selectedCharIdx, copy);
    editingEffect = null;
  }

  function getEffectsForSection(section: "effects" | number): Effect[] {
    if (!selectedChar) return [];
    if (section === "effects") return selectedChar.effects;
    return selectedChar.mindscape?.[section as number] ?? [];
  }

  function deepCopyChar(c: CharacterDef): CharacterDef {
    return JSON.parse(JSON.stringify(c));
  }

  let listItems = $derived(
    store.state.characters.map((c) => ({ id: c.id, label: c.name || c.id }))
  );

  const MINDSCAPE_LEVELS = [1, 2, 4, 6];
</script>

<div class="char-page">
  <div class="char-left">
    <EntityList
      items={listItems}
      selectedId={selectedCharId}
      title="Characters"
      onselect={(id) => { selectedCharId = id; editingEffect = null; }}
      onadd={addChar}
      onremove={removeChar}
    />
  </div>

  <div class="char-right">
    {#if editingEffect}
      <EffectEditor
        bind:effect={editingEffect.effect}
        onsave={saveEffect}
        oncancel={() => (editingEffect = null)}
      />
    {:else if selectedChar}
      <div class="detail">
        <!-- Basic info -->
        <div class="detail-header">
          <div class="field-group">
            <label class="field-label">Name</label>
            <input class="field-input" value={selectedChar.name}
              oninput={(e) => updateCharField("name", (e.target as HTMLInputElement).value)} />
          </div>
          <div class="field-group">
            <label class="field-label">ID</label>
            <input class="field-input mono" value={selectedChar.id}
              oninput={(e) => updateCharField("id", (e.target as HTMLInputElement).value)} />
          </div>
          <div class="field-group">
            <label class="field-label">Element</label>
            <select class="field-input" value={selectedChar.element}
              onchange={(e) => updateCharField("element", (e.target as HTMLSelectElement).value)}>
              {#each ELEMENTS as el}
                <option value={el.value}>{el.label}</option>
              {/each}
            </select>
          </div>
          <div class="field-group">
            <label class="field-label">Class</label>
            <select class="field-input" value={selectedChar.class}
              onchange={(e) => updateCharField("class", (e.target as HTMLSelectElement).value)}>
              {#each CHARACTER_CLASSES as cc}
                <option value={cc.value}>{cc.label}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- Base Stats -->
        <div class="section-block">
          <div class="section-header">
            <h4 class="section-title">Base Stats (Lv60 / Core F)</h4>
          </div>
          <div class="stats-grid">
            <div class="stat-field">
              <label class="stat-label">HP</label>
              <input type="number" class="stat-input" value={selectedChar.baseStats.hp}
                onchange={(e) => updateBaseStat("hp", (e.target as HTMLInputElement).value)} />
            </div>
            <div class="stat-field">
              <label class="stat-label">ATK</label>
              <input type="number" class="stat-input" value={selectedChar.baseStats.atk}
                onchange={(e) => updateBaseStat("atk", (e.target as HTMLInputElement).value)} />
            </div>
            <div class="stat-field">
              <label class="stat-label">DEF</label>
              <input type="number" class="stat-input" value={selectedChar.baseStats.def}
                onchange={(e) => updateBaseStat("def", (e.target as HTMLInputElement).value)} />
            </div>
            <div class="stat-field">
              <label class="stat-label">Impact</label>
              <input type="number" class="stat-input" value={selectedChar.baseStats.impact}
                onchange={(e) => updateBaseStat("impact", (e.target as HTMLInputElement).value)} />
            </div>
            <div class="stat-field">
              <label class="stat-label">Anomaly Mastery</label>
              <input type="number" class="stat-input" value={selectedChar.baseStats.anomalyMastery}
                onchange={(e) => updateBaseStat("anomalyMastery", (e.target as HTMLInputElement).value)} />
            </div>
            <div class="stat-field">
              <label class="stat-label">Anomaly Prof.</label>
              <input type="number" class="stat-input" value={selectedChar.baseStats.anomalyProficiency}
                onchange={(e) => updateBaseStat("anomalyProficiency", (e.target as HTMLInputElement).value)} />
            </div>
            <div class="stat-field">
              <label class="stat-label">CRIT Rate (%)</label>
              <input type="number" class="stat-input" step="0.1"
                value={((selectedChar.baseStats.critRate ?? 0) * 100).toFixed(1)}
                onchange={(e) => updateBaseStatPct("critRate", (e.target as HTMLInputElement).value)} />
            </div>
            <div class="stat-field">
              <label class="stat-label">CRIT DMG (%)</label>
              <input type="number" class="stat-input" step="0.1"
                value={((selectedChar.baseStats.critDmg ?? 0) * 100).toFixed(1)}
                onchange={(e) => updateBaseStatPct("critDmg", (e.target as HTMLInputElement).value)} />
            </div>
          </div>

          <!-- Advanced (collapsible) -->
          <button class="btn-toggle" onclick={() => (showAdvancedStats = !showAdvancedStats)}>
            {showAdvancedStats ? "▼" : "▶"} Advanced Stats
          </button>
          {#if showAdvancedStats}
            <div class="stats-grid">
              <div class="stat-field">
                <label class="stat-label">PEN Rate (%)</label>
                <input type="number" class="stat-input" step="0.1"
                  value={((selectedChar.baseStats.penRate ?? 0) * 100).toFixed(1)}
                  onchange={(e) => updateBaseStatPct("penRate", (e.target as HTMLInputElement).value)} />
              </div>
              <div class="stat-field">
                <label class="stat-label">Energy Regen (%)</label>
                <input type="number" class="stat-input" step="0.1"
                  value={((selectedChar.baseStats.energyRegen ?? 0) * 100).toFixed(1)}
                  onchange={(e) => updateBaseStatPct("energyRegen", (e.target as HTMLInputElement).value)} />
              </div>
              <div class="stat-field">
                <label class="stat-label">Adrenaline Regen (%)</label>
                <input type="number" class="stat-input" step="0.1"
                  value={((selectedChar.baseStats.adrenalineRegen ?? 0) * 100).toFixed(1)}
                  onchange={(e) => updateBaseStatPct("adrenalineRegen", (e.target as HTMLInputElement).value)} />
              </div>
            </div>
          {/if}
        </div>

        <!-- Base Effects -->
        <div class="section-block">
          <div class="section-header">
            <h4 class="section-title">Base Effects</h4>
            <button class="btn-sm" onclick={() => addEffect("effects")}>＋ Add</button>
          </div>
          {#each selectedChar.effects as eff, i}
            <div class="effect-card" onclick={() => editEffect("effects", i)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && editEffect("effects", i)}>
              <div class="effect-card-info">
                <span class="effect-card-label">{eff.label || eff.id}</span>
                <span class="effect-card-meta">{eff.mods.length} mod(s) · {eff.target}</span>
              </div>
              <button class="btn-micro btn-danger" onclick={(e: MouseEvent) => { e.stopPropagation(); removeEffect("effects", i); }} title="Remove">✕</button>
            </div>
          {/each}
          {#if selectedChar.effects.length === 0}
            <p class="empty-hint">No base effects</p>
          {/if}
        </div>

        <!-- Mindscape -->
        {#each MINDSCAPE_LEVELS as level}
          {@const effects = selectedChar.mindscape?.[level] ?? []}
          <div class="section-block">
            <div class="section-header">
              <h4 class="section-title">Mindscape {level}</h4>
              <button class="btn-sm" onclick={() => addEffect(level)}>＋ Add</button>
            </div>
            {#each effects as eff, i}
              <div class="effect-card" onclick={() => editEffect(level, i)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && editEffect(level, i)}>
                <div class="effect-card-info">
                  <span class="effect-card-label">{eff.label || eff.id}</span>
                  <span class="effect-card-meta">{eff.mods.length} mod(s) · {eff.target}</span>
                </div>
                <button class="btn-micro btn-danger" onclick={(e: MouseEvent) => { e.stopPropagation(); removeEffect(level, i); }} title="Remove">✕</button>
              </div>
            {/each}
            {#if effects.length === 0}
              <p class="empty-hint">No M{level} effects</p>
            {/if}
          </div>
        {/each}

        <JsonPreview data={selectedChar} title="Character JSON" />
      </div>
    {:else}
      <div class="placeholder">
        <p>Select a character or create a new one</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .char-page { display: flex; gap: 20px; height: 100%; }
  .char-left { flex-shrink: 0; width: 280px; }
  .char-right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
  .detail { display: flex; flex-direction: column; gap: 16px; }
  .detail-header { display: flex; gap: 14px; flex-wrap: wrap; }
  .field-group { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 140px; }
  .field-label { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; }
  .field-input {
    background: var(--surface-2); color: var(--text); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 12px; font-size: 0.88rem; font-family: inherit;
  }
  .field-input:focus { outline: none; border-color: var(--accent); }
  .field-input.mono { font-family: "JetBrains Mono", monospace; font-size: 0.82rem; }
  .section-block {
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px; display: flex; flex-direction: column; gap: 8px;
  }
  .section-header { display: flex; align-items: center; justify-content: space-between; }
  .section-title { margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--text); }
  .btn-sm {
    background: var(--accent-surface); color: var(--accent); border: 1px solid var(--accent);
    border-radius: 6px; padding: 4px 12px; font-size: 0.78rem; font-weight: 600; cursor: pointer;
    transition: all 0.15s;
  }
  .btn-sm:hover { background: var(--accent); color: #fff; }
  .stats-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;
  }
  .stat-field { display: flex; flex-direction: column; gap: 3px; }
  .stat-label { font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; }
  .stat-input {
    background: var(--surface-2); color: var(--text); border: 1px solid var(--border);
    border-radius: 6px; padding: 6px 10px; font-size: 0.85rem; font-family: "JetBrains Mono", monospace;
    width: 100%; text-align: right;
  }
  .stat-input:focus { outline: none; border-color: var(--accent); }
  .btn-toggle {
    background: none; border: none; color: var(--text-secondary); font-size: 0.8rem;
    font-weight: 600; cursor: pointer; padding: 4px 0; text-align: left;
    transition: color 0.15s;
  }
  .btn-toggle:hover { color: var(--accent); }
  .effect-card {
    display: flex; align-items: center; justify-content: space-between;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;
    padding: 10px 14px; cursor: pointer; transition: all 0.12s;
  }
  .effect-card:hover { border-color: var(--accent); background: var(--accent-surface); }
  .effect-card-info { display: flex; flex-direction: column; gap: 2px; }
  .effect-card-label { font-size: 0.88rem; font-weight: 500; color: var(--text); }
  .effect-card-meta { font-size: 0.72rem; color: var(--text-muted); }
  .btn-micro {
    background: var(--surface-3); border: none; color: var(--text-secondary);
    cursor: pointer; font-size: 0.8rem; width: 26px; height: 26px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 6px; transition: all 0.15s;
  }
  .btn-danger:hover { background: var(--danger-surface); color: var(--danger); }
  .empty-hint { color: var(--text-secondary); font-size: 0.8rem; font-style: italic; text-align: center; padding: 12px; }
  .placeholder { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.9rem; }
</style>
