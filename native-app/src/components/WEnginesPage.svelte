<script lang="ts">
  import type { WEngineDef, Effect, Mod } from "../lib/types";
  import { store } from "../lib/store.svelte";
  import EntityList from "./EntityList.svelte";
  import EffectEditor from "./EffectEditor.svelte";
  import ModListEditor from "./ModListEditor.svelte";
  import JsonPreview from "./JsonPreview.svelte";

  let editingEffect = $state<{
    weIdx: number;
    effectIdx: number;
    effect: Effect;
  } | null>(null);

  let selectedWeId = $state<string | undefined>(undefined);

  let selectedWeIdx = $derived(
    selectedWeId != null
      ? store.state.wengines.findIndex((w) => w.id === selectedWeId)
      : -1
  );
  let selectedWe = $derived(
    selectedWeIdx >= 0 ? store.state.wengines[selectedWeIdx] : null
  );

  function addWEngine() {
    const id = `wengine_${Date.now()}`;
    const newWe: WEngineDef = { id, name: "New W-Engine", baseMods: [], effects: [] };
    store.addWEngine(newWe);
    selectedWeId = id;
  }

  function removeWEngine(id: string) {
    const idx = store.state.wengines.findIndex((w) => w.id === id);
    if (idx >= 0) store.removeWEngine(idx);
    if (selectedWeId === id) selectedWeId = undefined;
  }

  function updateWeField(field: "id" | "name", val: string) {
    if (selectedWeIdx < 0) return;
    const copy: WEngineDef = { ...store.state.wengines[selectedWeIdx], [field]: val };
    store.updateWEngine(selectedWeIdx, copy);
    if (field === "id") selectedWeId = val;
  }

  function updateBaseMods(mods: Mod[]) {
    if (selectedWeIdx < 0) return;
    const copy: WEngineDef = { ...store.state.wengines[selectedWeIdx], baseMods: mods };
    store.updateWEngine(selectedWeIdx, copy);
  }

  function addEffect() {
    if (selectedWeIdx < 0) return;
    const newEffect: Effect = {
      id: `${selectedWe!.id}_eff_${Date.now()}`,
      label: "",
      target: "mainDps",
      enabledByDefault: true,
      mods: [],
    };
    editingEffect = { weIdx: selectedWeIdx, effectIdx: -1, effect: newEffect };
  }

  function editEffect(effectIdx: number) {
    if (selectedWeIdx < 0) return;
    editingEffect = {
      weIdx: selectedWeIdx,
      effectIdx,
      effect: JSON.parse(JSON.stringify(selectedWe!.effects[effectIdx])),
    };
  }

  function removeEffect(effectIdx: number) {
    if (selectedWeIdx < 0) return;
    const copy: WEngineDef = {
      ...store.state.wengines[selectedWeIdx],
      effects: store.state.wengines[selectedWeIdx].effects.filter((_, i) => i !== effectIdx),
    };
    store.updateWEngine(selectedWeIdx, copy);
  }

  function saveEffect(e: Effect) {
    if (!editingEffect || selectedWeIdx < 0) return;
    const copy: WEngineDef = { ...store.state.wengines[selectedWeIdx] };
    if (editingEffect.effectIdx < 0) {
      copy.effects = [...copy.effects, e];
    } else {
      copy.effects = copy.effects.map((x, i) => (i === editingEffect!.effectIdx ? e : x));
    }
    store.updateWEngine(selectedWeIdx, copy);
    editingEffect = null;
  }

  let listItems = $derived(
    store.state.wengines.map((w) => ({ id: w.id, label: w.name || w.id }))
  );
</script>

<div class="we-page">
  <div class="we-left">
    <EntityList
      items={listItems}
      selectedId={selectedWeId}
      title="W-Engines"
      onselect={(id) => { selectedWeId = id; editingEffect = null; }}
      onadd={addWEngine}
      onremove={removeWEngine}
    />
  </div>

  <div class="we-right">
    {#if editingEffect}
      <EffectEditor
        bind:effect={editingEffect.effect}
        onsave={saveEffect}
        oncancel={() => (editingEffect = null)}
      />
    {:else if selectedWe}
      <div class="detail">
        <div class="detail-header">
          <div class="field-group">
            <label class="field-label">Name</label>
            <input class="field-input" value={selectedWe.name}
              oninput={(e) => updateWeField("name", (e.target as HTMLInputElement).value)} />
          </div>
          <div class="field-group">
            <label class="field-label">ID</label>
            <input class="field-input mono" value={selectedWe.id}
              oninput={(e) => updateWeField("id", (e.target as HTMLInputElement).value)} />
          </div>
        </div>

        <!-- Base Mods (always-on weapon stats) -->
        <div class="section-block">
          <div class="section-header">
            <h4 class="section-title">Base Mods (always ON)</h4>
          </div>
          <ModListEditor bind:mods={selectedWe.baseMods} onchange={() => {
            if (selectedWeIdx >= 0) {
              const copy: WEngineDef = { ...store.state.wengines[selectedWeIdx], baseMods: [...selectedWe!.baseMods] };
              store.updateWEngine(selectedWeIdx, copy);
            }
          }} />
        </div>

        <!-- Conditional Effects -->
        <div class="section-block">
          <div class="section-header">
            <h4 class="section-title">Effects</h4>
            <button class="btn-sm" onclick={addEffect}>＋ Add</button>
          </div>
          {#each selectedWe.effects as eff, i}
            <div class="effect-card" onclick={() => editEffect(i)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && editEffect(i)}>
              <div class="effect-card-info">
                <span class="effect-card-label">{eff.label || eff.id}</span>
                <span class="effect-card-meta">{eff.mods.length} mod(s) · {eff.target}</span>
              </div>
              <button class="btn-micro btn-danger" onclick={(e: MouseEvent) => { e.stopPropagation(); removeEffect(i); }} title="Remove">✕</button>
            </div>
          {/each}
          {#if selectedWe.effects.length === 0}
            <p class="empty-hint">No effects yet</p>
          {/if}
        </div>

        <JsonPreview data={selectedWe} title="W-Engine JSON" />
      </div>
    {:else}
      <div class="placeholder">
        <p>Select a W-Engine or create a new one</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .we-page { display: flex; gap: 20px; height: 100%; }
  .we-left { flex-shrink: 0; width: 280px; }
  .we-right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
  .detail { display: flex; flex-direction: column; gap: 16px; }
  .detail-header { display: flex; gap: 14px; }
  .field-group { display: flex; flex-direction: column; gap: 4px; flex: 1; }
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
