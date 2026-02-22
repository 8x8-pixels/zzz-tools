<script lang="ts">
  import type { DiscSetDef, Effect } from "../lib/types";
  import { DISC_SET_NAMES } from "../lib/types";
  import { store } from "../lib/store.svelte";
  import EntityList from "./EntityList.svelte";
  import EffectEditor from "./EffectEditor.svelte";
  import JsonPreview from "./JsonPreview.svelte";

  let editingEffect = $state<{ setIdx: number; section: "2pc" | "4pc"; effectIdx: number; effect: Effect } | null>(null);
  let selectedSetId = $state<string | undefined>(undefined);

  let selectedSetIdx = $derived(
    selectedSetId != null
      ? store.state.discSets.findIndex((d) => d.setId === selectedSetId)
      : -1
  );
  let selectedSet = $derived(selectedSetIdx >= 0 ? store.state.discSets[selectedSetIdx] : null);

  // Names already used
  let usedNames = $derived(new Set(store.state.discSets.map((d) => d.name)));
  let availableNames = $derived(DISC_SET_NAMES.filter((n) => !usedNames.has(n)));

  function addSet() {
    const name = availableNames[0];
    if (!name) return; // all used
    store.addDiscSet({ setId: name, name, effects2pc: [], effects4pc: [] });
    selectedSetId = name;
  }

  function removeSet(id: string) {
    const idx = store.state.discSets.findIndex((d) => d.setId === id);
    if (idx >= 0) store.removeDiscSet(idx);
    if (selectedSetId === id) selectedSetId = undefined;
  }

  function updateSetName(val: string) {
    if (selectedSetIdx < 0) return;
    const copy = { ...store.state.discSets[selectedSetIdx], name: val, setId: val };
    store.updateDiscSet(selectedSetIdx, copy);
    selectedSetId = val;
  }

  function addEffect(section: "2pc" | "4pc") {
    if (selectedSetIdx < 0) return;
    const newEffect: Effect = {
      id: `${selectedSet!.setId}_${section}_${Date.now()}`,
      label: "",
      target: section === "4pc" ? "team" : "mainDps",
      enabledByDefault: section === "2pc",
      condition: section === "4pc" ? { mode: "toggle" } : undefined,
      mods: [],
    };
    editingEffect = { setIdx: selectedSetIdx, section, effectIdx: -1, effect: newEffect };
  }

  function editEffect(section: "2pc" | "4pc", effectIdx: number) {
    if (selectedSetIdx < 0) return;
    const arr = section === "2pc" ? selectedSet!.effects2pc : selectedSet!.effects4pc;
    editingEffect = {
      setIdx: selectedSetIdx,
      section,
      effectIdx,
      effect: JSON.parse(JSON.stringify(arr[effectIdx])),
    };
  }

  function removeEffect(section: "2pc" | "4pc", effectIdx: number) {
    if (selectedSetIdx < 0) return;
    const copy = { ...store.state.discSets[selectedSetIdx] };
    if (section === "2pc") {
      copy.effects2pc = copy.effects2pc.filter((_, i) => i !== effectIdx);
    } else {
      copy.effects4pc = copy.effects4pc.filter((_, i) => i !== effectIdx);
    }
    store.updateDiscSet(selectedSetIdx, copy);
  }

  function saveEffect(e: Effect) {
    if (!editingEffect || selectedSetIdx < 0) return;
    const copy = { ...store.state.discSets[selectedSetIdx] };
    const section = editingEffect.section;
    if (section === "2pc") {
      if (editingEffect.effectIdx < 0) {
        copy.effects2pc = [...copy.effects2pc, e];
      } else {
        copy.effects2pc = copy.effects2pc.map((x, i) => (i === editingEffect!.effectIdx ? e : x));
      }
    } else {
      if (editingEffect.effectIdx < 0) {
        copy.effects4pc = [...copy.effects4pc, e];
      } else {
        copy.effects4pc = copy.effects4pc.map((x, i) => (i === editingEffect!.effectIdx ? e : x));
      }
    }
    store.updateDiscSet(selectedSetIdx, copy);
    editingEffect = null;
  }

  let listItems = $derived(store.state.discSets.map((d) => ({ id: d.setId, label: d.name })));
</script>

<div class="disc-page">
  <div class="disc-left">
    <EntityList
      items={listItems}
      selectedId={selectedSetId}
      title="Disc Sets"
      onselect={(id) => { selectedSetId = id; editingEffect = null; }}
      onadd={addSet}
      onremove={removeSet}
    />
  </div>

  <div class="disc-right">
    {#if editingEffect}
      <EffectEditor
        bind:effect={editingEffect.effect}
        onsave={saveEffect}
        oncancel={() => (editingEffect = null)}
      />
    {:else if selectedSet}
      <div class="set-detail">
        <div class="detail-header">
          <div class="field-group">
            <label class="field-label">Set Name / ID</label>
            <select class="field-input" value={selectedSet.name} onchange={(e) => updateSetName((e.target as HTMLSelectElement).value)}>
              <option value={selectedSet.name}>{selectedSet.name}</option>
              {#each availableNames as name}
                {#if name !== selectedSet.name}
                  <option value={name}>{name}</option>
                {/if}
              {/each}
            </select>
          </div>
        </div>

        {#each ["2pc", "4pc"] as section}
          {@const effects = section === "2pc" ? selectedSet.effects2pc : selectedSet.effects4pc}
          <div class="section-block">
            <div class="section-header">
              <h4 class="section-title">{section} Effects</h4>
              <button class="btn-sm" onclick={() => addEffect(section as "2pc" | "4pc")}>＋ Add</button>
            </div>
            {#each effects as eff, i}
              <div class="effect-card" onclick={() => editEffect(section as "2pc" | "4pc", i)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && editEffect(section as "2pc" | "4pc", i)}>
                <div class="effect-card-info">
                  <span class="effect-card-label">{eff.label || eff.id}</span>
                  <span class="effect-card-meta">{eff.mods.length} mod(s) · {eff.target}</span>
                </div>
                <button class="btn-micro btn-danger" onclick={(e: MouseEvent) => { e.stopPropagation(); removeEffect(section as "2pc" | "4pc", i); }} title="Remove">✕</button>
              </div>
            {/each}
            {#if effects.length === 0}
              <p class="empty-hint">No {section} effects</p>
            {/if}
          </div>
        {/each}

        <JsonPreview data={selectedSet} title="Disc Set JSON" />
      </div>
    {:else}
      <div class="placeholder">
        <p>Select a disc set or create a new one</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .disc-page { display: flex; gap: 20px; height: 100%; }
  .disc-left { flex-shrink: 0; width: 280px; }
  .disc-right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
  .set-detail { display: flex; flex-direction: column; gap: 16px; }
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
