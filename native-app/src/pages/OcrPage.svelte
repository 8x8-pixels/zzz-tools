<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import { invoke } from '@tauri-apps/api/core';
  import { availableMonitors, type Monitor } from '@tauri-apps/api/window';
  import { open } from '@tauri-apps/plugin-dialog';
  import { loadSettings, saveSettings, type AppSettings } from '../lib/settings';
  import { saveJsonFile, saveJsonToDiscsDir } from '../lib/tauri';

  let running = false;
  let captured: any[] = [];
  let monitorNum = 0;
  let monitors: Monitor[] = [];

  let settings: AppSettings = { tesseractDir: '' };
  let tesseractDir = '';
  let statusMsg = '';
  let errorMsg = '';
  let lastSavedPath = '';
  let duplicateIndexes = new Set<number>();
  let duplicateCount = 0;

  let unlistenCaptured: (() => void) | null = null;
  let unlistenStopped: (() => void) | null = null;
  let seenCaptureSigs = new Set<string>();

  $: tesseractExe = tesseractDir ? `${tesseractDir}\\tesseract.exe` : '';

  function normValue(value: unknown): string {
    if (typeof value === 'number') return Number(value.toFixed(6)).toString();
    return String(value ?? '');
  }

  function makeDiscSignature(disc: any): string {
    const main = disc?.main_stat ?? {};
    const subs = Array.isArray(disc?.sub_stats) ? disc.sub_stats : [];
    const mainSig = `${main.stat_key ?? ''}:${normValue(main.value)}:${main.element ?? ''}`;
    const subsSig = subs
      .map(
        (sub: any) =>
          `${sub?.stat_key ?? ''}:${normValue(sub?.value)}:${sub?.rolls ?? 0}:${sub?.element ?? ''}`
      )
      .sort()
      .join('|');
    return `${mainSig}::${subsSig}`;
  }

  function syncSeenSigs() {
    seenCaptureSigs = new Set(captured.map((disc) => makeDiscSignature(disc)));
  }

  function makeDuplicateIndexSet(list: any[]): Set<number> {
    const seen = new Map<string, number>();
    const duplicates = new Set<number>();
    list.forEach((disc, index) => {
      const sig = makeDiscSignature(disc);
      const first = seen.get(sig);
      if (first === undefined) {
        seen.set(sig, index);
        return;
      }
      duplicates.add(first);
      duplicates.add(index);
    });
    return duplicates;
  }

  $: duplicateIndexes = makeDuplicateIndexSet(captured);
  $: duplicateCount = duplicateIndexes.size;

  function monitorLabel(monitor: Monitor, index: number): string {
    const size = monitor.size;
    const pos = monitor.position;
    const primaryTag = monitor === monitors[0] ? '' : '';
    return `${index}: ${monitor.name ?? 'Monitor'} (${size.width}x${size.height} @ ${pos.x},${pos.y})${primaryTag}`;
  }

  async function loadMonitorList() {
    try {
      monitors = await availableMonitors();
    } catch {
      monitors = [];
    }
  }

  function setStatus(msg: string) {
    statusMsg = msg;
    setTimeout(() => {
      if (statusMsg === msg) statusMsg = '';
    }, 2000);
  }

  onMount(async () => {
    settings = await loadSettings();
    tesseractDir = settings.tesseractDir ?? '';
    await loadMonitorList();
    try {
      running = await invoke<boolean>('is_ocr_running');
    } catch {
      running = false;
    }
    unlistenCaptured = await listen<string>('disc-captured', (event) => {
      if (!running) return;
      const line = String(event.payload ?? '').trim();
      if (!line.startsWith('{')) return;
      try {
        const disc = JSON.parse(line);
        const sig = makeDiscSignature(disc);
        if (seenCaptureSigs.has(sig)) return;
        seenCaptureSigs.add(sig);
        captured = [...captured, disc];
      } catch {
        // ignore parse errors
      }
    });

    unlistenStopped = await listen('ocr-stopped', () => {
      running = false;
    });
  });

  onDestroy(() => {
    unlistenCaptured?.();
    unlistenStopped?.();
  });

  async function persistSettings() {
    errorMsg = '';
    try {
      settings = { ...settings, tesseractDir };
      await saveSettings(settings);
      setStatus('Settings saved.');
    } catch (err) {
      errorMsg = `Settings save failed: ${String(err)}`;
    }
  }

  async function chooseTesseractDir() {
    errorMsg = '';
    try {
      const dir = await open({ directory: true, multiple: false });
      if (!dir || typeof dir !== 'string') return;
      tesseractDir = dir;
      await persistSettings();
    } catch (err) {
      errorMsg = `Folder dialog failed: ${String(err)}`;
    }
  }

  async function startOcr() {
    errorMsg = '';
    lastSavedPath = '';
    if (running) return;
    try {
      running = true;
      await invoke('start_ocr', {
        tesseract_path: tesseractExe || null,
        monitor_num: monitorNum,
      });
    } catch (err) {
      running = false;
      errorMsg = String(err);
    }
  }

  async function stopOcr() {
    if (!running) return;
    try {
      await invoke('stop_ocr');
    } catch (err) {
      errorMsg = String(err);
    } finally {
      running = false;
    }
  }

  async function exportDiscs() {
    if (captured.length === 0) return;
    await saveJsonFile('discs.json', JSON.stringify(captured, null, 2));
  }

  async function saveToAppData() {
    if (captured.length === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `discs_${stamp}.json`;
    const path = await saveJsonToDiscsDir(fileName, JSON.stringify(captured, null, 2));
    lastSavedPath = path;
    setStatus('Saved to app data.');
  }

  function clearCaptured() {
    captured = [];
    seenCaptureSigs = new Set();
  }

  function removeDiscAt(index: number) {
    captured = captured.filter((_, i) => i !== index);
    syncSeenSigs();
  }

  function removeDuplicates() {
    if (captured.length === 0) return;
    const seen = new Set<string>();
    const next: any[] = [];
    let removed = 0;
    for (const disc of captured) {
      const sig = makeDiscSignature(disc);
      if (seen.has(sig)) {
        removed += 1;
        continue;
      }
      seen.add(sig);
      next.push(disc);
    }
    captured = next;
    syncSeenSigs();
    setStatus(removed > 0 ? `Removed ${removed} duplicate disc(s).` : 'No duplicates found.');
  }

  function handleMonitorSelect(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    monitorNum = Number.isFinite(value) ? value : 0;
  }
</script>

<div class="ocr-page">
  <div class="header">
    <div>
      <h2>Disc OCR キャプチャ</h2>
      <p class="note">ゲームの言語設定を英語にしてから開始してください。</p>
    </div>
    <div class="status">
      {#if statusMsg}
        <span class="status-msg">{statusMsg}</span>
      {/if}
      {#if errorMsg}
        <span class="status-msg error">{errorMsg}</span>
      {/if}
    </div>
  </div>

  <section class="settings">
    <h3>OCR Settings</h3>
    <div class="field">
      <label>Tesseract インストールディレクトリ</label>
      <div class="row">
        <input
          type="text"
          placeholder="C:\\Program Files\\Tesseract-OCR"
          bind:value={tesseractDir}
        />
        <button class="btn" on:click={chooseTesseractDir}>参照</button>
        <button class="btn ghost" on:click={persistSettings}>保存</button>
      </div>
      <p class="hint">exe のフルパス: {tesseractExe || '未設定'}</p>
      <p class="hint">Tesseract は別途インストールしてください。</p>
    </div>

    <div class="field">
      <label>Monitor Number</label>
      {#if monitors.length > 0}
        <select class="monitor-select" value={monitorNum} on:change={handleMonitorSelect}>
          {#each monitors as monitor, idx}
            <option value={idx}>{monitorLabel(monitor, idx)}</option>
          {/each}
        </select>
      {:else}
        <input type="number" min="0" bind:value={monitorNum} />
      {/if}
      <p class="hint">0 = primary monitor</p>
    </div>
  </section>

  <section class="controls">
    <button class="btn primary" on:click={startOcr} disabled={running}>▶ 開始</button>
    <button class="btn danger" on:click={stopOcr} disabled={!running}>■ 停止</button>
    <button class="btn" on:click={exportDiscs} disabled={captured.length === 0}>💾 保存</button>
    <button class="btn" on:click={saveToAppData} disabled={captured.length === 0}>
      📂 アプリデータへ保存
    </button>
    <button class="btn" on:click={removeDuplicates} disabled={captured.length === 0}>
      重複削除{duplicateCount > 0 ? ` (${duplicateCount})` : ''}
    </button>
    <button class="btn ghost" on:click={clearCaptured} disabled={captured.length === 0}>
      クリア
    </button>
  </section>

  {#if lastSavedPath}
    <div class="saved-path">Saved: {lastSavedPath}</div>
  {/if}

  <section class="disc-list">
    <div class="disc-header">
      <h3>Captured Discs</h3>
      <span class="count">{captured.length} 枚 / 重複候補 {duplicateCount}</span>
    </div>
    <div class="disc-grid">
      {#each captured as disc, i}
        <div class="disc-card" class:duplicate={duplicateIndexes.has(i)}>
          <div class="disc-title">
            <span class="slot">Slot {disc.slot ?? '?'}</span>
            <span class="name">{disc.name ?? 'Unknown'}</span>
          </div>
          <div class="disc-main">
            {#if disc.main_stat}
              <span>{disc.main_stat.stat_key}: {disc.main_stat.value}</span>
            {:else}
              <span>main stat: n/a</span>
            {/if}
          </div>
          <div class="disc-subs">
            {#if disc.sub_stats?.length}
              {#each disc.sub_stats as sub}
                <span>{sub.stat_key}: {sub.value}</span>
              {/each}
            {:else}
              <span class="muted">sub stats: n/a</span>
            {/if}
          </div>
          <div class="disc-actions">
            {#if duplicateIndexes.has(i)}
              <span class="dup-badge">duplicate?</span>
            {/if}
            <button class="mini-btn" on:click={() => removeDiscAt(i)}>削除</button>
          </div>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .ocr-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  .note {
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .status {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }

  .status-msg {
    font-size: 0.8rem;
    color: var(--success);
  }

  .status-msg.error {
    color: var(--danger);
  }

  .settings {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .settings h3 {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field label {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .row input[type="text"] {
    flex: 1;
    min-width: 220px;
  }

  input[type="text"],
  input[type="number"],
  .monitor-select {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
    font-size: 0.85rem;
  }

  .hint {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .btn {
    background: var(--surface-2);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 14px;
    font-size: 0.82rem;
    font-weight: 600;
    transition: all var(--transition);
  }

  .btn:hover:enabled {
    background: var(--surface-3);
    color: var(--text);
    border-color: var(--border-hover);
  }

  .btn.primary {
    background: rgba(108, 138, 255, 0.2);
    border-color: rgba(108, 138, 255, 0.5);
    color: var(--accent);
  }

  .btn.danger {
    background: rgba(255, 107, 107, 0.12);
    border-color: rgba(255, 107, 107, 0.4);
    color: var(--danger);
  }

  .btn.ghost {
    background: transparent;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .saved-path {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .disc-list {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 16px;
  }

  .disc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .disc-header h3 {
    margin: 0;
  }

  .count {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .disc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }

  .disc-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .disc-card.duplicate {
    border-color: rgba(255, 184, 77, 0.55);
    box-shadow: inset 0 0 0 1px rgba(255, 184, 77, 0.2);
  }

  .disc-title {
    display: flex;
    justify-content: space-between;
    font-size: 0.82rem;
  }

  .slot {
    color: var(--text-muted);
  }

  .name {
    font-weight: 600;
  }

  .disc-main {
    font-size: 0.78rem;
    color: var(--accent);
  }

  .disc-subs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 0.74rem;
    color: var(--text-secondary);
  }

  .disc-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
  }

  .dup-badge {
    font-size: 0.7rem;
    color: #ffbf6b;
  }

  .mini-btn {
    margin-left: auto;
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 0.72rem;
  }

  .mini-btn:hover {
    color: var(--text);
    border-color: var(--border-hover);
    background: var(--surface-3);
  }

  .muted {
    color: var(--text-muted);
  }
</style>
