<script lang="ts">
  import type { Effect, TabId } from "../lib/types";
  import { store } from "../lib/store.svelte";
  import {
    parseEffectLibrary,
    parseDiscSets,
    parseCharacters,
    parseWEngines,
    exportEffectLibrary,
    exportDiscSets,
    exportCharacters,
    exportWEngines,
    exportBundle,
  } from "../lib/io";
  import { openJsonFile } from "../lib/tauri";
  import EntityList from "../components/EntityList.svelte";
  import EffectEditor from "../components/EffectEditor.svelte";
  import JsonPreview from "../components/JsonPreview.svelte";
  import DiscSetsPage from "../components/DiscSetsPage.svelte";
  import CharactersPage from "../components/CharactersPage.svelte";
  import WEnginesPage from "../components/WEnginesPage.svelte";

  // ── Tab config ──
  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: "library",    label: "Effect Library", icon: "⚡" },
    { id: "discSets",   label: "Disc Sets",      icon: "💿" },
    { id: "characters", label: "Characters",     icon: "👤" },
    { id: "wengines",   label: "W-Engines",      icon: "🔧" },
  ];

  // ── Effect Library ──
  let editingEffect = $state<{ idx: number; effect: Effect } | null>(null);

  let libraryItems = $derived(
    store.state.effectLibrary.map((e) => ({ id: e.id, label: e.label || e.id }))
  );

  let selectedEffectIdx = $derived(
    store.state.selectedId != null
      ? store.state.effectLibrary.findIndex((e) => e.id === store.state.selectedId)
      : -1
  );

  let selectedEffect = $derived(
    selectedEffectIdx >= 0 ? store.state.effectLibrary[selectedEffectIdx] : null
  );

  function addEffect() {
    const newEffect: Effect = {
      id: `effect_${Date.now()}`,
      label: "",
      target: "mainDps",
      enabledByDefault: false,
      mods: [],
    };
    store.addEffect(newEffect);
    store.selectId(newEffect.id);
    editingEffect = {
      idx: store.state.effectLibrary.length - 1,
      effect: JSON.parse(JSON.stringify(newEffect)),
    };
  }

  function removeEffect(id: string) {
    const idx = store.state.effectLibrary.findIndex((e) => e.id === id);
    if (idx >= 0) store.removeEffect(idx);
    editingEffect = null;
  }

  function duplicateEffect(id: string) {
    const idx = store.state.effectLibrary.findIndex((e) => e.id === id);
    if (idx >= 0) store.duplicateEffect(idx);
  }

  function selectEffect(id: string) {
    store.selectId(id);
    const idx = store.state.effectLibrary.findIndex((e) => e.id === id);
    if (idx >= 0) {
      editingEffect = {
        idx,
        effect: JSON.parse(JSON.stringify(store.state.effectLibrary[idx])),
      };
    }
  }

  function saveEffect(e: Effect) {
    if (!editingEffect) return;
    store.updateEffect(editingEffect.idx, e);
    store.selectId(e.id);
    editingEffect = null;
  }

  // ── Import ──
  async function handleImport() {
    const file = await openJsonFile();
    if (!file) return;
    try {
      const json = JSON.parse(file.content);
      // Detect type by content
      if (json.effects) {
        const parsed = parseEffectLibrary(json);
        store.replaceEffectLibrary(parsed.effects);
        store.selectTab("library");
        importMessage = `Imported ${parsed.effects.length} effect(s)`;
      } else if (json.discSets) {
        const parsed = parseDiscSets(json);
        store.replaceDiscSets(parsed.discSets);
        store.selectTab("discSets");
        importMessage = `Imported ${parsed.discSets.length} disc set(s)`;
      } else if (json.characters) {
        const parsed = parseCharacters(json);
        store.replaceCharacters(parsed.characters);
        store.selectTab("characters");
        importMessage = `Imported ${parsed.characters.length} character(s)`;
      } else if (json.wengines) {
        const parsed = parseWEngines(json);
        store.replaceWEngines(parsed.wengines);
        store.selectTab("wengines");
        importMessage = `Imported ${parsed.wengines.length} W-Engine(s)`;
      } else {
        importMessage = "⚠ Unrecognized JSON format";
      }
    } catch (err) {
      importMessage = `⚠ ${(err as Error).message}`;
    }
    setTimeout(() => (importMessage = ""), 4000);
  }

  let importMessage = $state("");

  // ── Export ──
  let showExportMenu = $state(false);

  async function handleExport(type: "library" | "discSets" | "characters" | "wengines" | "bundle") {
    switch (type) {
      case "library":
        await exportEffectLibrary(store.state.effectLibrary);
        break;
      case "discSets":
        await exportDiscSets(store.state.discSets);
        break;
      case "characters":
        await exportCharacters(store.state.characters);
        break;
      case "wengines":
        await exportWEngines(store.state.wengines);
        break;
      case "bundle":
        await exportBundle(
          store.state.effectLibrary,
          store.state.characters,
          store.state.wengines,
          store.state.discSets,
        );
        break;
    }
    showExportMenu = false;
  }
</script>

<div class="app-shell">
  <!-- Header -->
  <header class="app-header">
    <div class="header-left">
      <h1 class="app-title">⚡ Effect JSON Builder</h1>
    </div>
    <div class="header-right">
      {#if importMessage}
        <span class="import-msg" class:error={importMessage.startsWith("⚠")}>{importMessage}</span>
      {/if}

      <button class="header-btn" onclick={handleImport}>📥 Import</button>

      <div class="export-wrapper">
        <button class="header-btn" onclick={() => (showExportMenu = !showExportMenu)}>
          📤 Export
        </button>
        {#if showExportMenu}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div class="export-overlay" onclick={() => (showExportMenu = false)}></div>
          <div class="export-menu">
            <button class="export-item" onclick={() => handleExport("library")}>
              Effect Library
              <span class="export-count">{store.state.effectLibrary.length}</span>
            </button>
            <button class="export-item" onclick={() => handleExport("discSets")}>
              Disc Sets
              <span class="export-count">{store.state.discSets.length}</span>
            </button>
            <button class="export-item" onclick={() => handleExport("characters")}>
              Characters
              <span class="export-count">{store.state.characters.length}</span>
            </button>
            <button class="export-item" onclick={() => handleExport("wengines")}>
              W-Engines
              <span class="export-count">{store.state.wengines.length}</span>
            </button>
            <hr class="export-divider" />
            <button class="export-item" onclick={() => handleExport("bundle")}>
              📦 All (Bundle)
            </button>
          </div>
        {/if}
      </div>

      {#if store.state.dirty}
        <span class="dirty-badge" title="Unsaved changes">●</span>
      {/if}
    </div>
  </header>

  <!-- Tabs -->
  <nav class="tab-bar">
    {#each TABS as tab}
      <button
        class="tab-btn"
        class:active={store.state.selectedTab === tab.id}
        onclick={() => { store.selectTab(tab.id); editingEffect = null; }}
      >
        <span class="tab-icon">{tab.icon}</span>
        <span class="tab-label">{tab.label}</span>
      </button>
    {/each}
  </nav>

  <!-- Tab Content -->
  <main class="tab-content">
    {#if store.state.selectedTab === "library"}
      <div class="library-page">
        <div class="library-left">
          <EntityList
            items={libraryItems}
            selectedId={store.state.selectedId}
            title="Effect Library"
            onselect={selectEffect}
            onadd={addEffect}
            onremove={removeEffect}
            onduplicate={duplicateEffect}
          />
        </div>
        <div class="library-right">
          {#if editingEffect}
            <EffectEditor
              bind:effect={editingEffect.effect}
              onsave={saveEffect}
              oncancel={() => (editingEffect = null)}
            />
          {:else if selectedEffect}
            <div class="preview-only">
              <div class="preview-actions">
                <button class="btn btn-primary" onclick={() => selectEffect(selectedEffect!.id)}>
                  ✏️ Edit
                </button>
              </div>
              <JsonPreview data={selectedEffect} title="Effect JSON" />
            </div>
          {:else}
            <div class="placeholder">
              <div class="placeholder-icon">⚡</div>
              <p>Select an effect or create a new one</p>
            </div>
          {/if}
        </div>
      </div>

    {:else if store.state.selectedTab === "discSets"}
      <DiscSetsPage />

    {:else if store.state.selectedTab === "characters"}
      <CharactersPage />

    {:else if store.state.selectedTab === "wengines"}
      <WEnginesPage />
    {/if}
  </main>
</div>

<style>
  /* ── Shell ── */
  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  /* ── Header ── */
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    background: var(--surface-1);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(12px);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .app-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.01em;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-btn {
    background: var(--surface-2);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 6px 14px;
    font-size: 0.82rem;
    font-weight: 500;
    transition: all var(--transition);
  }

  .header-btn:hover {
    background: var(--surface-3);
    color: var(--text);
    border-color: var(--border-hover);
  }

  .hidden { display: none; }

  .import-msg {
    font-size: 0.78rem;
    color: var(--success);
    animation: fadeIn 0.2s ease;
  }

  .import-msg.error {
    color: var(--danger);
  }

  .dirty-badge {
    color: var(--accent);
    font-size: 0.7rem;
    animation: pulse 1.5s infinite;
  }

  /* ── Export menu ── */
  .export-wrapper {
    position: relative;
  }

  .export-overlay {
    position: fixed;
    inset: 0;
    z-index: 199;
  }

  .export-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    min-width: 200px;
    z-index: 200;
    overflow: hidden;
    animation: slideDown 0.12s ease;
  }

  .export-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 16px;
    background: none;
    border: none;
    color: var(--text);
    font-size: 0.84rem;
    text-align: left;
    transition: background var(--transition);
  }

  .export-item:hover {
    background: var(--accent-surface);
    color: var(--accent);
  }

  .export-count {
    font-size: 0.72rem;
    color: var(--text-muted);
    background: var(--surface-3);
    padding: 1px 7px;
    border-radius: 10px;
  }

  .export-divider {
    border: none;
    border-top: 1px solid var(--border);
    margin: 0;
  }

  /* ── Tabs ── */
  .tab-bar {
    display: flex;
    gap: 0;
    padding: 0 24px;
    background: var(--surface-1);
    border-bottom: 1px solid var(--border);
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 20px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    font-size: 0.85rem;
    font-weight: 500;
    transition: all var(--transition);
    position: relative;
  }

  .tab-btn:hover {
    color: var(--text);
    background: var(--surface-2);
  }

  .tab-btn.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .tab-icon {
    font-size: 1rem;
  }

  /* ── Content ── */
  .tab-content {
    flex: 1;
    padding: 20px 24px;
    overflow: hidden;
  }

  /* Library page */
  .library-page {
    display: flex;
    gap: 20px;
    height: calc(100vh - 130px);
  }

  .library-left {
    flex-shrink: 0;
    width: 300px;
  }

  .library-right {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }

  .preview-only {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .preview-actions {
    display: flex;
    gap: 8px;
  }

  .btn {
    padding: 8px 20px;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition);
  }

  .btn-primary {
    background: var(--accent);
    color: #fff;
  }

  .btn-primary:hover {
    filter: brightness(1.15);
  }

  /* Placeholder */
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: calc(100vh - 160px);
    color: var(--text-muted);
    gap: 8px;
  }

  .placeholder-icon {
    font-size: 3rem;
    opacity: 0.3;
  }

  .placeholder p {
    font-size: 0.92rem;
  }

  /* ── Animations ── */
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
