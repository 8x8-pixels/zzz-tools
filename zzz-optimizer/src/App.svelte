<script lang="ts">
  import OptimizerPage from './components/OptimizerPage.svelte';
</script>

<main>
  <OptimizerPage />
</main>

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  :global(body) {
    font-family: 'Segoe UI', sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    min-height: 100vh;
  }
  main {
    padding: 16px;
  }
</style>
