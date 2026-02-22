<script lang="ts">
  import type { Effect, ConditionMode } from "../lib/types";
  import { TARGETS, CONDITION_MODES } from "../lib/types";
  import { toSlug } from "../lib/slug";
  import { validateEffect, type ValidationError } from "../lib/validate";
  import ModListEditor from "./ModListEditor.svelte";

  let {
    effect = $bindable(),
    onsave,
    oncancel,
  }: {
    effect: Effect;
    onsave?: (e: Effect) => void;
    oncancel?: () => void;
  } = $props();

  let autoSlug = $state(true);
  let errors = $state<ValidationError[]>([]);
  let tagsInput = $state(effect.tags?.join(", ") ?? "");

  function handleLabelChange(val: string) {
    effect.label = val;
    if (autoSlug) {
      effect.id = toSlug(val);
    }
  }

  function handleIdChange(val: string) {
    effect.id = val;
    autoSlug = false;
  }

  function toggleCondition(checked: boolean) {
    if (checked) {
      effect.condition = { mode: "toggle" };
    } else {
      effect.condition = undefined;
    }
  }

  function setConditionMode(mode: ConditionMode) {
    if (!effect.condition) return;
    effect.condition = {
      mode,
      defaultUptime: mode === "uptime" ? (effect.condition.defaultUptime ?? 0.8) : undefined,
    };
  }

  function setUptime(raw: string) {
    if (!effect.condition) return;
    const v = parseFloat(raw);
    effect.condition = { ...effect.condition, defaultUptime: isNaN(v) ? 0 : v / 100 };
  }

  function handleSave() {
    effect.tags = tagsInput.trim()
      ? tagsInput.split(",").map((t) => t.trim()).filter(Boolean)
      : undefined;
    const errs = validateEffect(effect);
    errors = errs;
    if (errs.length === 0) {
      onsave?.(effect);
    }
  }

  function fieldHasError(field: string): boolean {
    return errors.some((e) => e.field === field);
  }
</script>

<div class="editor-panel">
  <h3 class="editor-title">Effect Editor</h3>

  <div class="field-group">
    <label class="field-label">Label <span class="required">*</span></label>
    <input
      type="text"
      class="field-input"
      class:has-error={fieldHasError("label")}
      value={effect.label}
      oninput={(e) => handleLabelChange((e.target as HTMLInputElement).value)}
      placeholder="e.g. 耐性ダウン -20%"
    />
  </div>

  <div class="field-group">
    <label class="field-label">
      ID <span class="required">*</span>
      {#if autoSlug}<span class="auto-badge">auto</span>{/if}
    </label>
    <input
      type="text"
      class="field-input mono"
      class:has-error={fieldHasError("id")}
      value={effect.id}
      oninput={(e) => handleIdChange((e.target as HTMLInputElement).value)}
      placeholder="auto-generated-slug"
    />
  </div>

  <div class="field-row">
    <div class="field-group flex-1">
      <label class="field-label">Target <span class="required">*</span></label>
      <select
        class="field-input"
        class:has-error={fieldHasError("target")}
        value={effect.target}
        onchange={(e) => effect.target = (e.target as HTMLSelectElement).value as any}
      >
        {#each TARGETS as t}
          <option value={t.value}>{t.label}</option>
        {/each}
      </select>
    </div>
    <div class="field-group">
      <label class="field-label">Enabled by default</label>
      <label class="toggle">
        <input type="checkbox" bind:checked={effect.enabledByDefault} />
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>

  <div class="field-group">
    <label class="field-label">
      <label class="inline-check">
        <input
          type="checkbox"
          checked={!!effect.condition}
          onchange={(e) => toggleCondition((e.target as HTMLInputElement).checked)}
        />
        Condition
      </label>
    </label>
    {#if effect.condition}
      <div class="condition-row">
        <select
          class="field-input compact"
          value={effect.condition.mode}
          onchange={(e) => setConditionMode((e.target as HTMLSelectElement).value as ConditionMode)}
        >
          {#each CONDITION_MODES as cm}
            <option value={cm.value}>{cm.label}</option>
          {/each}
        </select>
        {#if effect.condition.mode === "uptime"}
          <div class="uptime-group">
            <input
              type="number"
              class="field-input compact"
              class:has-error={fieldHasError("condition.defaultUptime")}
              value={((effect.condition.defaultUptime ?? 0) * 100).toFixed(0)}
              onchange={(e) => setUptime((e.target as HTMLInputElement).value)}
              min="0" max="100" step="1"
            />
            <span class="mod-unit">%</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <ModListEditor bind:mods={effect.mods} />

  <div class="field-group">
    <label class="field-label">Notes</label>
    <textarea
      class="field-input field-textarea"
      bind:value={effect.notes}
      placeholder="Optional memo..."
      rows="2"
    ></textarea>
  </div>

  <div class="field-group">
    <label class="field-label">Tags <span class="hint">(comma separated)</span></label>
    <input
      type="text"
      class="field-input"
      bind:value={tagsInput}
      placeholder="e.g. support, debuff"
    />
  </div>

  {#if errors.length > 0}
    <div class="error-panel">
      {#each errors as err}
        <div class="error-item">⚠ <b>{err.field}</b>: {err.message}</div>
      {/each}
    </div>
  {/if}

  <div class="editor-actions">
    <button class="btn btn-primary" onclick={handleSave}>Save</button>
    {#if oncancel}
      <button class="btn btn-ghost" onclick={oncancel}>Cancel</button>
    {/if}
  </div>
</div>

<style>
  .editor-panel {
    display: flex; flex-direction: column; gap: 14px;
    padding: 20px;
    background: var(--surface-1);
    border-radius: 12px;
    border: 1px solid var(--border);
  }
  .editor-title { margin: 0 0 4px; font-size: 1.1rem; font-weight: 700; color: var(--text); }
  .field-group { display: flex; flex-direction: column; gap: 4px; }
  .field-label { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; display: flex; align-items: center; gap: 6px; }
  .required { color: var(--danger); }
  .auto-badge { font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; background: var(--accent-surface); color: var(--accent); text-transform: none; font-weight: 500; }
  .hint { font-size: 0.7rem; color: var(--text-muted); font-weight: 400; text-transform: none; }
  .field-input {
    background: var(--surface-2); color: var(--text); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 12px; font-size: 0.88rem; font-family: inherit;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .field-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-surface); }
  .field-input.has-error { border-color: var(--danger); }
  .field-input.mono { font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 0.82rem; }
  .field-input.compact { max-width: 140px; }
  .field-textarea { resize: vertical; min-height: 50px; }
  .field-row { display: flex; gap: 14px; align-items: flex-start; }
  .flex-1 { flex: 1; }
  .condition-row { display: flex; gap: 8px; align-items: center; }
  .uptime-group { display: flex; align-items: center; gap: 4px; }
  .mod-unit { color: var(--text-secondary); font-size: 0.8rem; }
  .inline-check { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .inline-check input { accent-color: var(--accent); }

  /* Toggle switch */
  .toggle { position: relative; display: inline-block; width: 40px; height: 22px; cursor: pointer; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-slider {
    position: absolute; inset: 0; background: var(--surface-3); border-radius: 22px;
    transition: background 0.2s;
  }
  .toggle-slider::before {
    content: ""; position: absolute; width: 16px; height: 16px; left: 3px; top: 3px;
    background: var(--text-secondary); border-radius: 50%; transition: transform 0.2s, background 0.2s;
  }
  .toggle input:checked + .toggle-slider { background: var(--accent); }
  .toggle input:checked + .toggle-slider::before { transform: translateX(18px); background: #fff; }

  .error-panel {
    background: var(--danger-surface); border: 1px solid var(--danger); border-radius: 8px;
    padding: 10px 14px; display: flex; flex-direction: column; gap: 4px;
  }
  .error-item { font-size: 0.8rem; color: var(--danger); }

  .editor-actions { display: flex; gap: 10px; padding-top: 6px; }
  .btn {
    padding: 8px 20px; border: none; border-radius: 8px; font-size: 0.88rem;
    font-weight: 600; cursor: pointer; transition: all 0.15s;
  }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { filter: brightness(1.15); }
  .btn-ghost { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); }
  .btn-ghost:hover { background: var(--surface-2); }
</style>
