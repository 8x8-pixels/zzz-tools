<script lang="ts">
  type Item = { id: string; label?: string; name?: string };

  let {
    items,
    selectedId,
    title = "Items",
    onselect,
    onadd,
    onremove,
    onduplicate,
  }: {
    items: Item[];
    selectedId?: string;
    title?: string;
    onselect?: (id: string) => void;
    onadd?: () => void;
    onremove?: (id: string) => void;
    onduplicate?: (id: string) => void;
  } = $props();

  let search = $state("");

  let filtered = $derived(
    search.trim()
      ? items.filter((it) => {
          const q = search.toLowerCase();
          const name = (it.label ?? it.name ?? it.id).toLowerCase();
          return name.includes(q) || it.id.toLowerCase().includes(q);
        })
      : items
  );
</script>

<div class="entity-list">
  <div class="list-header">
    <h3 class="list-title">{title}</h3>
    {#if onadd}
      <button class="btn-icon btn-add" onclick={onadd} title="Add new">＋</button>
    {/if}
  </div>

  <div class="search-bar">
    <input type="text" class="search-input" placeholder="Search..." bind:value={search} />
  </div>

  <div class="list-body">
    {#each filtered as item (item.id)}
      <div
        class="list-item"
        class:selected={item.id === selectedId}
        onclick={() => onselect?.(item.id)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && onselect?.(item.id)}
      >
        <div class="item-info">
          <span class="item-name">{item.label ?? item.name ?? item.id}</span>
          <span class="item-id">{item.id}</span>
        </div>
        <div class="item-actions" onclick={(e) => e.stopPropagation()}>
          {#if onduplicate}
            <button class="btn-micro" onclick={() => onduplicate(item.id)} title="Duplicate">⧉</button>
          {/if}
          {#if onremove}
            <button class="btn-micro btn-danger" onclick={() => onremove(item.id)} title="Delete">✕</button>
          {/if}
        </div>
      </div>
    {/each}

    {#if filtered.length === 0}
      <p class="empty-hint">{search ? "No results" : "No items yet"}</p>
    {/if}
  </div>

  <div class="list-footer">
    <span class="count">{items.length} items</span>
  </div>
</div>

<style>
  .entity-list {
    display: flex; flex-direction: column;
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px;
    overflow: hidden; min-width: 260px;
  }
  .list-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid var(--border);
  }
  .list-title { margin: 0; font-size: 1rem; font-weight: 700; color: var(--text); }
  .btn-icon {
    background: none; border: none; cursor: pointer; font-size: 1.1rem;
    width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
    border-radius: 8px; transition: background 0.15s;
  }
  .btn-add { color: var(--accent); }
  .btn-add:hover { background: var(--accent-surface); }
  .search-bar { padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .search-input {
    width: 100%; background: var(--surface-2); color: var(--text); border: 1px solid var(--border);
    border-radius: 8px; padding: 7px 12px; font-size: 0.82rem; font-family: inherit;
    box-sizing: border-box;
  }
  .search-input:focus { outline: none; border-color: var(--accent); }
  .list-body { flex: 1; overflow-y: auto; max-height: 500px; }
  .list-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; cursor: pointer; transition: background 0.12s;
    border-left: 3px solid transparent;
  }
  .list-item:hover { background: var(--surface-2); }
  .list-item.selected { background: var(--accent-surface); border-left-color: var(--accent); }
  .item-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .item-name { font-size: 0.88rem; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-id { font-size: 0.7rem; color: var(--text-muted); font-family: "JetBrains Mono", monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.12s; }
  .list-item:hover .item-actions { opacity: 1; }
  .btn-micro {
    background: var(--surface-3); border: none; color: var(--text-secondary);
    cursor: pointer; font-size: 0.8rem; width: 26px; height: 26px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 6px; transition: all 0.15s;
  }
  .btn-micro:hover { background: var(--accent-surface); color: var(--accent); }
  .btn-danger:hover { background: var(--danger-surface); color: var(--danger); }
  .empty-hint { color: var(--text-secondary); font-size: 0.82rem; text-align: center; padding: 24px; font-style: italic; }
  .list-footer { padding: 8px 16px; border-top: 1px solid var(--border); }
  .count { font-size: 0.72rem; color: var(--text-muted); }
</style>
