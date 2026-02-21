<script lang="ts">
  let { data, title = "JSON Preview" }: { data: unknown; title?: string } = $props();

  let jsonStr = $derived(JSON.stringify(data, null, 2));

  async function copy() {
    await navigator.clipboard.writeText(jsonStr);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  let copied = $state(false);
</script>

<div class="json-preview">
  <div class="preview-header">
    <span class="preview-title">{title}</span>
    <button class="btn-copy" onclick={copy}>
      {copied ? "✓ Copied" : "📋 Copy"}
    </button>
  </div>
  <pre class="preview-code"><code>{jsonStr}</code></pre>
</div>

<style>
  .json-preview {
    display: flex; flex-direction: column;
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px;
    overflow: hidden;
  }
  .preview-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; background: var(--surface-2); border-bottom: 1px solid var(--border);
  }
  .preview-title { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
  .btn-copy {
    background: var(--surface-3); color: var(--text-secondary); border: 1px solid var(--border);
    border-radius: 6px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer;
    transition: all 0.15s;
  }
  .btn-copy:hover { background: var(--accent-surface); color: var(--accent); border-color: var(--accent); }
  .preview-code {
    margin: 0; padding: 16px; overflow: auto; max-height: 400px;
    font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 0.78rem;
    color: var(--text); line-height: 1.5; white-space: pre; tab-size: 2;
  }
</style>
