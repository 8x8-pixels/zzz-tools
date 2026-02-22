<script lang="ts">
  import type { Mod, StatKey, Element } from "../lib/types";
  import { STAT_KEYS, ELEMENTS, PERCENT_STAT_KEYS } from "../lib/types";

  let { mods = $bindable(), onchange }: { mods: Mod[]; onchange?: () => void } = $props();

  function addMod() {
    mods = [...mods, { key: "atk_pct" as StatKey, op: "add" as const, value: 0 }];
    onchange?.();
  }

  function removeMod(i: number) {
    mods = mods.filter((_, idx) => idx !== i);
    onchange?.();
  }

  function moveMod(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= mods.length) return;
    const copy = [...mods];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    mods = copy;
    onchange?.();
  }

  function updateKey(i: number, key: StatKey) {
    const copy = [...mods];
    copy[i] = { ...copy[i], key };
    if (key !== "element_dmg_bonus") {
      delete copy[i].element;
    } else if (!copy[i].element) {
      copy[i].element = "ice";
    }
    mods = copy;
    onchange?.();
  }

  function updateValue(i: number, raw: string) {
    const copy = [...mods];
    const num = parseFloat(raw);
    if (PERCENT_STAT_KEYS.has(copy[i].key)) {
      copy[i] = { ...copy[i], value: isNaN(num) ? 0 : num / 100 };
    } else {
      copy[i] = { ...copy[i], value: isNaN(num) ? 0 : num };
    }
    mods = copy;
    onchange?.();
  }

  function updateElement(i: number, el: Element) {
    const copy = [...mods];
    copy[i] = { ...copy[i], element: el };
    mods = copy;
    onchange?.();
  }

  function displayValue(m: Mod): string {
    if (PERCENT_STAT_KEYS.has(m.key)) {
      return (m.value * 100).toFixed(1);
    }
    return String(m.value);
  }
</script>

<div class="mod-list">
  <div class="mod-list-header">
    <span class="mod-list-title">Mods</span>
    <button class="btn-icon btn-add" onclick={addMod} title="Add mod">＋</button>
  </div>

  {#each mods as mod, i (i)}
    <div class="mod-row">
      <div class="mod-controls-left">
        <button class="btn-micro" onclick={() => moveMod(i, -1)} disabled={i === 0} title="Move up">▲</button>
        <button class="btn-micro" onclick={() => moveMod(i, 1)} disabled={i === mods.length - 1} title="Move down">▼</button>
      </div>

      <select class="mod-select" value={mod.key} onchange={(e) => updateKey(i, (e.target as HTMLSelectElement).value as StatKey)}>
        {#each STAT_KEYS as sk}
          <option value={sk.value}>{sk.label}</option>
        {/each}
      </select>

      <div class="mod-value-group">
        <input
          type="number"
          class="mod-value"
          value={displayValue(mod)}
          onchange={(e) => updateValue(i, (e.target as HTMLInputElement).value)}
          step="any"
        />
        {#if PERCENT_STAT_KEYS.has(mod.key)}
          <span class="mod-unit">%</span>
        {/if}
      </div>

      {#if mod.key === "element_dmg_bonus"}
        <select class="mod-element" value={mod.element ?? "ice"} onchange={(e) => updateElement(i, (e.target as HTMLSelectElement).value as Element)}>
          {#each ELEMENTS as el}
            <option value={el.value}>{el.label}</option>
          {/each}
        </select>
      {/if}

      <button class="btn-icon btn-remove" onclick={() => removeMod(i)} title="Remove">✕</button>
    </div>
  {/each}

  {#if mods.length === 0}
    <p class="empty-hint">No mods. Click ＋ to add one.</p>
  {/if}
</div>

<style>
  .mod-list { display: flex; flex-direction: column; gap: 8px; }
  .mod-list-header { display: flex; align-items: center; justify-content: space-between; }
  .mod-list-title { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); }
  .mod-row {
    display: flex; align-items: center; gap: 6px;
    background: var(--surface-2); border-radius: 8px; padding: 8px 10px;
    border: 1px solid var(--border);
    transition: border-color 0.15s;
  }
  .mod-row:hover { border-color: var(--accent); }
  .mod-controls-left { display: flex; flex-direction: column; gap: 2px; }
  .btn-micro {
    background: none; border: none; color: var(--text-secondary); cursor: pointer;
    font-size: 0.6rem; padding: 0; line-height: 1; opacity: 0.6;
  }
  .btn-micro:hover:not(:disabled) { opacity: 1; color: var(--accent); }
  .btn-micro:disabled { opacity: 0.2; cursor: default; }
  .mod-select, .mod-element {
    background: var(--surface-3); color: var(--text); border: 1px solid var(--border);
    border-radius: 6px; padding: 5px 8px; font-size: 0.82rem; flex-shrink: 0;
  }
  .mod-select { min-width: 150px; }
  .mod-element { min-width: 90px; }
  .mod-value-group { display: flex; align-items: center; gap: 2px; }
  .mod-value {
    background: var(--surface-3); color: var(--text); border: 1px solid var(--border);
    border-radius: 6px; padding: 5px 8px; font-size: 0.82rem; width: 80px; text-align: right;
  }
  .mod-unit { color: var(--text-secondary); font-size: 0.8rem; }
  .btn-icon {
    background: none; border: none; cursor: pointer; font-size: 1rem;
    width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
    border-radius: 6px; transition: background 0.15s, color 0.15s;
  }
  .btn-add { color: var(--accent); }
  .btn-add:hover { background: var(--accent-surface); }
  .btn-remove { color: var(--danger); }
  .btn-remove:hover { background: var(--danger-surface); }
  .empty-hint { color: var(--text-secondary); font-size: 0.8rem; font-style: italic; text-align: center; padding: 12px; }
</style>
