<script lang="ts">
  import { onMount } from 'svelte';
  import {
    characters,
    wengines,
    discSets,
    effectLibrary,
    bundledDiscs,
    parseDiscJson,
    getDiscSetName,
  } from '../lib/data';
  import { openJsonFiles, loadDiscsDir } from '../lib/tauri';
  import { optimize } from '../lib/calc/optimizer';
  import SupportCharPanel from '../components/SupportCharPanel.svelte';
  import type {
    Disc,
    EffectToggle,
    EnemyParams,
    OptimizationResult,
    OptimizerConfig,
    SetConfig,
    SupportCharConfig,
    DamageType,
    StatKey,
  } from '../lib/calc/types';

  // ─── 選択状態 ───────────────────────────────────
  let selectedCharId = characters[0]?.id ?? '';
  let selectedWEngineId = wengines[0]?.id ?? '';
  let setPattern: '4+2' | '2+2+2' = '4+2';

  // セット選択（4+2 → [set4, set2], 2+2+2 → [set2a, set2b, set2c]）
  let set4Id = discSets[0]?.setId ?? '';
  let set2Id = discSets[1]?.setId ?? '';
  let set2aId = discSets[0]?.setId ?? '';
  let set2bId = discSets[1]?.setId ?? '';
  let set2cId = discSets[2]?.setId ?? discSets[0]?.setId ?? '';

  // 敵パラメータ
  let enemy: EnemyParams = {
    enemyLevel: 60,
    enemyDef: 953,
    enemyResist: -0.2,
    enemyBreakVuln: 1.25,
  };

  // 透徹変換効率
  let atkToPenRatio = 0.3;
  let hpToPenRatio = 0.1;

  // マインドスケープレベル
  let mindscapeLevel = 0;

  // 最適化対象
  let damageType: DamageType = 'normal';

  // スロット6メインステ絞り込み
  const slot6MainStatOptions: { label: string; value: StatKey | '' }[] = [
    { label: '指定なし', value: '' },
    { label: 'ATK%', value: 'atk_pct_base' },
    { label: 'HP%', value: 'hp_pct_base' },
    { label: 'DEF%', value: 'def_pct' },
    { label: 'Energy Regen%', value: 'energy_regen' },
    { label: 'Anomaly Mastery%', value: 'anomaly_mastery' },
    { label: 'Impact%', value: 'impact' },
  ];
  let slot6MainStat: StatKey | '' = '';

  // 追加エフェクトのトグル
  let effectToggles: Record<string, boolean> = {};
  $: {
    for (const eff of effectLibrary) {
      if (!(eff.id in effectToggles)) {
        effectToggles[eff.id] = eff.enabledByDefault;
      }
    }
  }

  // ディスクセットエフェクトのトグル
  let discSetEffectToggles: Record<string, boolean> = {};
  $: {
    for (const ds of discSets) {
      for (const eff of [...ds.effects2pc, ...ds.effects4pc]) {
        if (!(eff.id in discSetEffectToggles)) {
          discSetEffectToggles[eff.id] = eff.enabledByDefault;
        }
      }
    }
  }

  // キャラエフェクトのトグル
  let charEffectToggles: Record<string, boolean> = {};
  $: {
    const char = characters.find((c) => c.id === selectedCharId);
    if (char) {
      for (const eff of char.effects) {
        if (!(eff.id in charEffectToggles)) {
          charEffectToggles[eff.id] = eff.enabledByDefault;
        }
      }
      if (char.mindscape) {
        for (const effs of Object.values(char.mindscape)) {
          for (const eff of effs) {
            if (!(eff.id in charEffectToggles)) {
              charEffectToggles[eff.id] = eff.enabledByDefault;
            }
          }
        }
      }
    }
  }

  // W-Engine エフェクトのトグル
  let wEngineEffectToggles: Record<string, boolean> = {};
  $: {
    const weng = wengines.find((w) => w.id === selectedWEngineId);
    if (weng) {
      for (const eff of weng.effects) {
        if (!(eff.id in wEngineEffectToggles)) {
          wEngineEffectToggles[eff.id] = eff.enabledByDefault;
        }
      }
    }
  }

  // ─── サポートキャラクター (最大2体) ─────────────────────────────────
  let supportConfig1: SupportCharConfig | null = null;
  let supportConfig2: SupportCharConfig | null = null;

  // ─── ロード済みディスク（事前バンドル分で初期化）──────────────────────
  let loadedDiscs: Map<string, Disc[]> = new Map(bundledDiscs);
  let loadStatus: string = '';

  async function handleFiles() {
    const files = await openJsonFiles();
    for (const file of files) {
      try {
        const discs = parseDiscJson(file.content, file.name);
        if (discs.length > 0) {
          const setName = getDiscSetName(discs);
          loadedDiscs.set(setName, discs);
          loadedDiscs = new Map(loadedDiscs);
          loadStatus += `✓ ${setName}: ${discs.length} 枚\n`;
        }
      } catch (e) {
        loadStatus += `✗ ${file.name}: ${(e as Error).message}\n`;
      }
    }
  }

  async function loadFromAppData() {
    try {
      const files = await loadDiscsDir();
      if (files.length === 0) return;
      for (const file of files) {
        try {
          const discs = parseDiscJson(file.content, file.name);
          if (discs.length > 0) {
            const setName = getDiscSetName(discs);
            loadedDiscs.set(setName, discs);
            loadedDiscs = new Map(loadedDiscs);
            loadStatus += `✓ (app) ${setName}: ${discs.length} 枚\n`;
          }
        } catch (e) {
          loadStatus += `✗ (app) ${file.name}: ${(e as Error).message}\n`;
        }
      }
    } catch (e) {
      loadStatus += `✗ (app) 読み込みエラー: ${(e as Error).message}\n`;
    }
  }

  onMount(async () => {
    await loadFromAppData();
  });

  // ─── 最適化実行 ────────────────────────────────
  let results: OptimizationResult[] = [];
  let isRunning = false;
  let errorMsg = '';

  function runOptimize() {
    const char = characters.find((c) => c.id === selectedCharId);
    const weng = wengines.find((w) => w.id === selectedWEngineId);
    if (!char || !weng) return;

    // セット構成
    let setConfigs: SetConfig[];
    if (setPattern === '4+2') {
      setConfigs = [
        { setId: set4Id, count: 4 },
        { setId: set2Id, count: 2 },
      ];
    } else {
      setConfigs = [
        { setId: set2aId, count: 2 },
        { setId: set2bId, count: 2 },
        { setId: set2cId, count: 2 },
      ];
    }

    // 選択セットのディスクが存在するか確認
    for (const sc of setConfigs) {
      if (!loadedDiscs.has(sc.setId)) {
        errorMsg = `ディスクがロードされていません: ${sc.setId}\nJSONファイルを読み込んでください。`;
        return;
      }
    }
    errorMsg = '';

    // トグルの集約
    const allToggles: EffectToggle[] = [];

    const pushToggles = (record: Record<string, boolean>) => {
      for (const [effectId, enabled] of Object.entries(record)) {
        allToggles.push({ effectId, enabled });
      }
    };
    pushToggles(charEffectToggles);
    pushToggles(wEngineEffectToggles);
    pushToggles(discSetEffectToggles);
    pushToggles(effectToggles);

    const config: OptimizerConfig = {
      character: char,
      wengine: weng,
      sets: setConfigs,
      discSetDefs: discSets,
      additionalEffects: effectLibrary,
      enemy,
      damageType,
      effectToggles: allToggles,
      atkToPenRatio,
      hpToPenRatio,
      mindscapeLevel,
      slot6MainStat: slot6MainStat || null,
      supportChars: [supportConfig1, supportConfig2].filter(
        (c): c is SupportCharConfig => c !== null
      ),
    };

    isRunning = true;
    results = [];
    // setTimeout でレンダリングを1フレーム挟んでから実行
    setTimeout(() => {
      try {
        const allDiscs = new Map<string, Disc[]>();
        for (const sc of setConfigs) {
          allDiscs.set(sc.setId, loadedDiscs.get(sc.setId) ?? []);
        }
        results = optimize(config, allDiscs, 5);
      } catch (e) {
        errorMsg = `最適化エラー: ${(e as Error).message}`;
      } finally {
        isRunning = false;
      }
    }, 0);
  }

  // ─── ヘルパー関数 ─────────────────────────────────
  function pct(v: number, digits = 1): string {
    return (v * 100).toFixed(digits) + '%';
  }
  function fmt(v: number, digits = 0): string {
    return v.toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // 選択キャラのエフェクト一覧（トグル対象）
  $: currentChar = characters.find((c) => c.id === selectedCharId);
  $: currentWEngine = wengines.find((w) => w.id === selectedWEngineId);
  $: selectedSetIds = setPattern === '4+2' ? [set4Id, set2Id] : [set2aId, set2bId, set2cId];
  $: relevantDiscSets = discSets.filter((ds) => selectedSetIds.includes(ds.setId));
</script>

<!-- ══════════════════════════════════════════ -->
<div class="page">
  <header>
    <h1>ZZZ Disc Optimizer</h1>
  </header>

  <div class="layout">
    <!-- ───────── 左パネル：構成選択 ───────── -->
    <aside class="config-panel">

      <!-- キャラクター選択 -->
      <section>
        <h2>キャラクター</h2>
        <select bind:value={selectedCharId}>
          {#each characters as ch}
            <option value={ch.id}>{ch.name} ({ch.element})</option>
          {/each}
        </select>

        {#if currentChar}
          <div class="effect-list">
            {#each currentChar.effects as eff}
              <label>
                <input type="checkbox" bind:checked={charEffectToggles[eff.id]} />
                {eff.label}
              </label>
            {/each}
            {#if currentChar.mindscape}
              <div class="sub-section">
                <span class="label-sm">マインドスケープ Lv:</span>
                <input type="number" min="0" max="6" bind:value={mindscapeLevel} class="num-sm" />
              </div>
              {#each Object.entries(currentChar.mindscape) as [lvl, effs]}
                {#if Number(lvl) <= mindscapeLevel}
                  {#each effs as eff}
                    <label>
                      <input type="checkbox" bind:checked={charEffectToggles[eff.id]} />
                      M{lvl}: {eff.label}
                    </label>
                  {/each}
                {/if}
              {/each}
            {/if}
          </div>
        {/if}
      </section>

      <!-- 音動機選択 -->
      <section>
        <h2>音動機（W-Engine）</h2>
        <select bind:value={selectedWEngineId}>
          {#each wengines as w}
            <option value={w.id}>{w.name}</option>
          {/each}
        </select>
        {#if currentWEngine}
          <div class="effect-list">
            {#each currentWEngine.effects as eff}
              <label>
                <input type="checkbox" bind:checked={wEngineEffectToggles[eff.id]} />
                {eff.label}
              </label>
            {/each}
          </div>
        {/if}
      </section>

      <!-- セット構成 -->
      <section>
        <h2>セット構成</h2>
        <div class="row">
          <label><input type="radio" bind:group={setPattern} value="4+2" /> 4+2</label>
          <label><input type="radio" bind:group={setPattern} value="2+2+2" /> 2+2+2</label>
        </div>

        {#if setPattern === '4+2'}
          <div class="set-row">
            <span>4セット:</span>
            <select bind:value={set4Id}>
              {#each discSets as ds}
                <option value={ds.setId}>{ds.name}</option>
              {/each}
            </select>
          </div>
          <div class="set-row">
            <span>2セット:</span>
            <select bind:value={set2Id}>
              {#each discSets as ds}
                <option value={ds.setId}>{ds.name}</option>
              {/each}
            </select>
          </div>
        {:else}
          {#each [['set2aId', set2aId], ['set2bId', set2bId], ['set2cId', set2cId]] as [, val], i}
            <div class="set-row">
              <span>2セット {i + 1}:</span>
              <select
                value={val}
                on:change={(e) => {
                  if (i === 0) set2aId = e.currentTarget.value;
                  else if (i === 1) set2bId = e.currentTarget.value;
                  else set2cId = e.currentTarget.value;
                }}
              >
                {#each discSets as ds}
                  <option value={ds.setId}>{ds.name}</option>
                {/each}
              </select>
            </div>
          {/each}
        {/if}

        <!-- セット効果トグル -->
        <div class="effect-list">
          {#each relevantDiscSets as ds}
            {#each [...ds.effects2pc, ...ds.effects4pc] as eff}
              <label>
                <input type="checkbox" bind:checked={discSetEffectToggles[eff.id]} />
                [{ds.name.substring(0, 4)}] {eff.label}
              </label>
            {/each}
          {/each}
        </div>
      </section>

      <!-- サポートキャラクター -->
      <section>
        <h2>サポートキャラ（チームバフ用）</h2>
        <p class="support-note">team / enemy エフェクトのみ最適化対象に反映</p>
        <SupportCharPanel slotIndex={0} bind:config={supportConfig1} />
        <SupportCharPanel slotIndex={1} bind:config={supportConfig2} />
      </section>

      <!-- 追加エフェクト -->
      <section>
        <h2>追加エフェクト</h2>
        <div class="effect-list">
          {#each effectLibrary as eff}
            <label>
              <input type="checkbox" bind:checked={effectToggles[eff.id]} />
              {eff.label}
            </label>
          {/each}
        </div>
      </section>

      <!-- 透徹変換効率 -->
      <section>
        <h2>透徹変換効率</h2>
        <div class="param-row">
          <span>ATK→透徹:</span>
          <input type="number" step="0.01" bind:value={atkToPenRatio} class="num-input" />
        </div>
        <div class="param-row">
          <span>HP→透徹:</span>
          <input type="number" step="0.01" bind:value={hpToPenRatio} class="num-input" />
        </div>
      </section>

      <!-- 敵パラメータ -->
      <section>
        <h2>敵パラメータ</h2>
        <div class="param-row"><span>レベル:</span><input type="number" bind:value={enemy.enemyLevel} class="num-input" /></div>
        <div class="param-row"><span>防御力:</span><input type="number" bind:value={enemy.enemyDef} class="num-input" /></div>
        <div class="param-row"><span>耐性:</span><input type="number" step="0.01" bind:value={enemy.enemyResist} class="num-input" /></div>
        <div class="param-row"><span>ブレイク:</span><input type="number" step="0.01" bind:value={enemy.enemyBreakVuln} class="num-input" /></div>
      </section>

      <!-- 最適化対象 -->
      <section>
        <h2>最適化対象</h2>
        <label><input type="radio" bind:group={damageType} value="normal" /> 通常ダメージ</label>
        <label><input type="radio" bind:group={damageType} value="anomaly" /> 異常ダメージ</label>
        <label><input type="radio" bind:group={damageType} value="penetration" /> 透徹ダメージ</label>
        <div class="param-row" style="margin-top: 0.5rem;">
          <span>6番メインステ:</span>
          <select bind:value={slot6MainStat}>
            {#each slot6MainStatOptions as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>
      </section>

      <!-- ディスクファイル読み込み -->
      <section>
        <h2>ディスク JSON 読み込み</h2>
        <div class="file-actions">
          <button class="file-btn" on:click={handleFiles}>ファイル選択</button>
          <button class="file-btn secondary" on:click={loadFromAppData}>
            アプリデータから再読込
          </button>
        </div>
        {#if loadedDiscs.size > 0}
          <div class="load-info">
            {#each loadedDiscs as [name, discs]}
              <div>✓ {name}: {discs.length} 枚</div>
            {/each}
          </div>
        {/if}
        {#if loadStatus}
          <pre class="load-log">{loadStatus}</pre>
        {/if}
      </section>

      <!-- 実行ボタン -->
      <button class="run-btn" on:click={runOptimize} disabled={isRunning}>
        {isRunning ? '計算中...' : '▶ 最適化実行'}
      </button>

      {#if errorMsg}
        <div class="error">{errorMsg}</div>
      {/if}
    </aside>

    <!-- ───────── 右パネル：結果表示 ───────── -->
    <main class="result-panel">
      {#if results.length === 0 && !isRunning}
        <div class="placeholder">
          ディスク JSON を読み込み、「最適化実行」を押してください。
        </div>
      {:else if isRunning}
        <div class="placeholder">計算中...</div>
      {:else}
        {#each results as result, rank}
          <div class="result-card" class:top={rank === 0}>
            <h3>#{rank + 1} — {fmt(result.optimizedValue)} ({damageType})</h3>

            <!-- 選択ディスク -->
            <div class="disc-grid">
              {#each result.discs as disc}
                <div class="disc-item">
                  <div class="disc-header">
                    <span class="slot-badge">S{disc.slot}</span>
                    <span class="disc-set">{disc.setName}</span>
                    <span class="main-stat">{disc.mainStat.key}: {
                      disc.mainStat.key.includes('pct') || disc.mainStat.key === 'crit_rate' || disc.mainStat.key === 'crit_dmg' || disc.mainStat.key === 'pen_rate'
                        ? pct(disc.mainStat.value)
                        : fmt(disc.mainStat.value)
                    }</span>
                  </div>
                  <div class="sub-stats">
                    {#each disc.subStats as sub}
                      <span class="sub-stat">
                        {sub.key}:{
                          sub.key.includes('pct') || sub.key === 'crit_rate' || sub.key === 'crit_dmg' || sub.key === 'pen_rate'
                            ? pct(sub.value)
                            : fmt(sub.value)
                        }
                      </span>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>

            <!-- 戦闘時ステータス -->
            <div class="stats-section">
              <h4>戦闘時ステータス</h4>
              <div class="stats-grid">
                <div><span>ATK</span><span>{fmt(result.combatStats.atk, 1)}</span></div>
                <div><span>HP</span><span>{fmt(result.combatStats.hp, 0)}</span></div>
                <div><span>会心率</span><span>{pct(result.combatStats.critRate)}</span></div>
                <div><span>会心ダメ</span><span>{pct(result.combatStats.critDmg)}</span></div>
                <div><span>ダメボーナス</span><span>{pct(result.combatStats.dmgBonus)}</span></div>
                <div><span>貫通率</span><span>{pct(result.combatStats.penRate)}</span></div>
                <div><span>貫通値</span><span>{fmt(result.combatStats.penFlat, 0)}</span></div>
                <div><span>異常マスタリ</span><span>{fmt(result.combatStats.anomalyMastery, 0)}</span></div>
                <div><span>異常熟練</span><span>{fmt(result.combatStats.anomalyProficiency, 0)}</span></div>
              </div>
            </div>

            <!-- ダメージ基礎値 -->
            <div class="dmg-section">
              <h4>ダメージ基礎値</h4>
              <div class="dmg-row"><span>通常</span><strong>{fmt(result.damage.normal, 1)}</strong></div>
              <div class="dmg-row"><span>異常</span><strong>{fmt(result.damage.anomaly, 1)}</strong></div>
              <div class="dmg-row"><span>透徹</span><strong>{fmt(result.damage.penetration, 1)}</strong></div>
            </div>

            {#if rank === 0}
              <div class="combo-info">探索組み合わせ数: {fmt(result.totalCombinations)}</div>
            {/if}
          </div>
        {/each}
      {/if}
    </main>
  </div>
</div>

<style>
  .page { max-width: 1400px; margin: 0 auto; }
  header h1 { font-size: 1.4rem; margin-bottom: 16px; color: #a0cfff; }

  .layout { display: grid; grid-template-columns: 320px 1fr; gap: 16px; }

  .config-panel {
    background: #16213e;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
  }

  section { border-bottom: 1px solid #2a2a4a; padding-bottom: 10px; }
  section h2 { font-size: 0.8rem; color: #88aadd; text-transform: uppercase; margin-bottom: 6px; }

  select, input[type="number"] {
    width: 100%;
    background: #0f3460;
    border: 1px solid #2a4a8a;
    color: #e0e0e0;
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .effect-list { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
  .effect-list label { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; cursor: pointer; }

  .row { display: flex; gap: 12px; margin-bottom: 6px; }
  .row label { font-size: 0.85rem; cursor: pointer; }

  .set-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .set-row span { font-size: 0.8rem; min-width: 60px; }

  .param-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .param-row span { font-size: 0.8rem; min-width: 70px; }
  .num-input { width: 80px; }
  .num-sm { width: 50px; }
  .label-sm { font-size: 0.75rem; }
  .sub-section { display: flex; align-items: center; gap: 6px; margin-top: 4px; }

  .support-note { font-size: 0.72rem; color: #6a7a9a; margin-bottom: 6px; }

  .file-btn {
    display: inline-block;
    padding: 6px 12px;
    background: #0f3460;
    border: 1px solid #2a4a8a;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .file-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .file-btn.secondary {
    background: #12284a;
    border-color: #2a3f72;
  }
  .hidden { display: none; }
  .load-info { margin-top: 6px; font-size: 0.75rem; color: #88dd88; }
  .load-log { font-size: 0.7rem; margin-top: 4px; white-space: pre-wrap; color: #aaaaaa; }

  .run-btn {
    padding: 10px;
    background: #533483;
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 1rem;
    cursor: pointer;
    font-weight: bold;
  }
  .run-btn:hover:not(:disabled) { background: #6644aa; }
  .run-btn:disabled { opacity: 0.5; cursor: default; }

  .error { background: #3a1010; color: #ff9999; padding: 8px; border-radius: 4px; font-size: 0.8rem; white-space: pre-wrap; }

  /* 結果パネル */
  .result-panel { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: calc(100vh - 80px); }
  .placeholder { color: #666; padding: 40px; text-align: center; }

  .result-card {
    background: #16213e;
    border-radius: 8px;
    padding: 12px;
    border: 1px solid #2a2a4a;
  }
  .result-card.top { border-color: #aa8833; box-shadow: 0 0 8px #aa883344; }
  .result-card h3 { font-size: 1rem; margin-bottom: 10px; color: #ffcc55; }

  .disc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; }
  .disc-item {
    background: #0f3460;
    border-radius: 6px;
    padding: 6px;
    font-size: 0.75rem;
  }
  .disc-header { display: flex; flex-wrap: wrap; gap: 4px; align-items: baseline; margin-bottom: 4px; }
  .slot-badge { background: #533483; padding: 1px 5px; border-radius: 3px; font-weight: bold; }
  .disc-set { color: #88aadd; font-size: 0.7rem; }
  .main-stat { color: #ffcc55; font-size: 0.75rem; white-space: nowrap; }
  .sub-stats { display: flex; flex-wrap: wrap; gap: 3px; }
  .sub-stat { background: #1a3a5a; padding: 1px 4px; border-radius: 2px; font-size: 0.68rem; color: #ccddff; white-space: nowrap; }

  .stats-section { margin-bottom: 10px; }
  .stats-section h4, .dmg-section h4 { font-size: 0.8rem; color: #88aadd; margin-bottom: 6px; }
  .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .stats-grid div { display: flex; justify-content: space-between; font-size: 0.8rem; padding: 2px 6px; background: #0f2040; border-radius: 3px; }
  .stats-grid div span:first-child { color: #aabbcc; }

  .dmg-section { margin-bottom: 8px; }
  .dmg-row { display: flex; justify-content: space-between; padding: 3px 8px; font-size: 0.85rem; }
  .dmg-row strong { color: #ffcc55; }

  .combo-info { font-size: 0.7rem; color: #666; text-align: right; }
</style>
