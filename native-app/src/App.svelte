<script lang="ts">
  import OptimizerPage from './pages/OptimizerPage.svelte';
  import EffectEditorPage from './pages/EffectEditorPage.svelte';
  import OcrPage from './pages/OcrPage.svelte';

  type Tab = 'optimizer' | 'effect-editor' | 'ocr';
  let activeTab: Tab = 'optimizer';
</script>

<div class="app-root">
  <header class="app-topbar">
    <div class="brand">
      <span class="brand-title">ZZZ Tools</span>
      <span class="brand-sub">Native Suite</span>
    </div>
    <nav class="app-tabs">
      <button
        class:active={activeTab === 'optimizer'}
        on:click={() => (activeTab = 'optimizer')}
      >
        Optimizer
      </button>
      <button
        class:active={activeTab === 'effect-editor'}
        on:click={() => (activeTab = 'effect-editor')}
      >
        Effect Editor
      </button>
      <button
        class:active={activeTab === 'ocr'}
        on:click={() => (activeTab = 'ocr')}
      >
        Disc OCR
      </button>
    </nav>
  </header>

  <main class="app-content">
    {#if activeTab === 'optimizer'}
      <OptimizerPage />
    {:else if activeTab === 'effect-editor'}
      <EffectEditorPage />
    {:else}
      <OcrPage />
    {/if}
  </main>
</div>

<style>
  .app-root {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .app-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 22px;
    background: linear-gradient(120deg, #121826, #0f1420 55%, #151b2a);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 200;
  }

  .brand {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .brand-title {
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--text);
  }

  .brand-sub {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--text-muted);
  }

  .app-tabs {
    display: flex;
    gap: 10px;
  }

  .app-tabs button {
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: rgba(255, 255, 255, 0.02);
    color: var(--text-secondary);
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    transition: all 0.15s ease;
  }

  .app-tabs button:hover {
    border-color: var(--border-hover);
    color: var(--text);
  }

  .app-tabs button.active {
    background: rgba(108, 138, 255, 0.12);
    border-color: rgba(108, 138, 255, 0.45);
    color: var(--accent);
    box-shadow: 0 0 0 1px rgba(108, 138, 255, 0.2);
  }

  .app-content {
    flex: 1;
    padding: 18px 22px 28px;
  }

  @media (max-width: 900px) {
    .app-topbar {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }

    .app-tabs {
      width: 100%;
      flex-wrap: wrap;
    }

    .app-content {
      padding: 16px;
    }
  }
</style>
