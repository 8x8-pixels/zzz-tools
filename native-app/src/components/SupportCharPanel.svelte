<script lang="ts">
  import { characters, wengines, discSets } from '../lib/data';
  import type {
    CharacterDef,
    DiscSetDef,
    Effect,
    EffectToggle,
    SetConfig,
    SupportCharConfig,
    WEngineDef,
  } from '../lib/calc/types';

  export let slotIndex: number;
  /** 親コンポーネントが bind:config で参照するサポートキャラ設定 (null = 未選択) */
  export let config: SupportCharConfig | null = null;

  // ── 内部状態 ────────────────────────────────
  let charId = '';
  let wengineId = wengines[0]?.id ?? '';
  let mindscapeLevel = 0;

  let setPattern: '4+2' | '2+2+2' = '4+2';
  let set4Id = discSets[0]?.setId ?? '';
  let set2Id = discSets[1]?.setId ?? '';
  let set2aId = discSets[0]?.setId ?? '';
  let set2bId = discSets[1]?.setId ?? '';
  let set2cId = discSets[2]?.setId ?? discSets[0]?.setId ?? '';

  /** ディスクセット効果のトグルキーを名前空間化 (ID重複回避) */
  function dsEffKey(setId: string, effId: string): string {
    return `${setId}:${effId}`;
  }

  /** エフェクトトグル (team / enemy のみ表示・管理) */
  let effToggles: Record<string, boolean> = {};

  // ── 派生値 ──────────────────────────────────
  $: currentChar = characters.find((c) => c.id === charId);
  $: currentWEngine = charId ? (wengines.find((w) => w.id === wengineId) ?? null) : null;
  $: selectedSetIds =
    setPattern === '4+2' ? [set4Id, set2Id] : [set2aId, set2bId, set2cId];
  $: relevantDiscSets = discSets.filter((ds) => selectedSetIds.includes(ds.setId));

  // ── キャラ・Wエンジン・セットが変わったらトグルを初期化（未登録分のみ）──
  $: if (currentChar) {
    // キャラクター・ Wエンジンエフェクト → 通常の eff.id で管理
    const charWEffects: Effect[] = [];
    const isTE = (e: Effect) => e.target === 'team' || e.target === 'enemy';
    charWEffects.push(...currentChar.effects.filter(isTE));
    if (mindscapeLevel > 0 && currentChar.mindscape) {
      for (let i = 1; i <= mindscapeLevel; i++) {
        charWEffects.push(...(currentChar.mindscape[String(i)] ?? []).filter(isTE));
      }
    }
    if (currentWEngine) charWEffects.push(...currentWEngine.effects.filter(isTE));
    for (const eff of charWEffects) {
      if (!(eff.id in effToggles)) effToggles[eff.id] = eff.enabledByDefault;
    }

    // ディスクセット 4pcエフェクト（team/enemy）→ 名前空間キーで管理
    // 2pc は常時有効なのでトグル不要
    for (const ds of relevantDiscSets) {
      for (const eff of ds.effects4pc.filter(isTE)) {
        const key = dsEffKey(ds.setId, eff.id);
        if (!(key in effToggles)) effToggles[key] = eff.enabledByDefault;
      }
    }

    effToggles = { ...effToggles };
  }

  // ── config を reactively 構築して親へ伝播 ────
  $: {
    if (!charId || !currentChar) {
      config = null;
    } else {
      const setConfigs: SetConfig[] =
        setPattern === '4+2'
          ? [
              { setId: set4Id, count: 4 },
              { setId: set2Id, count: 2 },
            ]
          : [
              { setId: set2aId, count: 2 },
              { setId: set2bId, count: 2 },
              { setId: set2cId, count: 2 },
            ];

      const toggleList: EffectToggle[] = Object.entries(effToggles).map(
        ([effectId, enabled]) => ({ effectId, enabled })
      );

      config = {
        character: currentChar,
        wengine: currentWEngine ?? null,
        sets: setConfigs,
        mindscapeLevel,
        effectToggles: toggleList,
      };
    }
  }

  // ── ヘルパー ─────────────────────────────────
  function msEffectsInRange(char: CharacterDef, upTo: number): { lvl: string; eff: Effect }[] {
    if (!char.mindscape) return [];
    const result: { lvl: string; eff: Effect }[] = [];
    for (const [lvl, effs] of Object.entries(char.mindscape)) {
      if (Number(lvl) <= upTo) {
        for (const eff of effs.filter((e) => e.target === 'team' || e.target === 'enemy')) {
          result.push({ lvl, eff });
        }
      }
    }
    return result;
  }
</script>

<!-- ══════════════════════════════════════════ -->
<div class="support-card">
  <h3 class="slot-title">サポート {slotIndex + 1}</h3>

  <!-- キャラ選択 -->
  <select bind:value={charId}>
    <option value="">── なし ──</option>
    {#each characters as ch}
      <option value={ch.id}>{ch.name} ({ch.element})</option>
    {/each}
  </select>

  {#if currentChar}
    <!-- マインドスケープ Lv -->
    <div class="param-row">
      <span>M.Lv</span>
      <input type="number" min="0" max="6" bind:value={mindscapeLevel} class="num-sm" />
    </div>

    <!-- W-Engine -->
    <div class="field-label">W-Engine</div>
    <select bind:value={wengineId}>
      {#each wengines as w}
        <option value={w.id}>{w.name}</option>
      {/each}
    </select>

    <!-- ディスクセット構成 -->
    <div class="field-label">ディスクセット</div>
    <div class="row">
      <label><input type="radio" bind:group={setPattern} value="4+2" /> 4+2</label>
      <label><input type="radio" bind:group={setPattern} value="2+2+2" /> 2+2+2</label>
    </div>

    {#if setPattern === '4+2'}
      <div class="set-row">
        <span>4set:</span>
        <select bind:value={set4Id}>
          {#each discSets as ds}
            <option value={ds.setId}>{ds.name}</option>
          {/each}
        </select>
      </div>
      <div class="set-row">
        <span>2set:</span>
        <select bind:value={set2Id}>
          {#each discSets as ds}
            <option value={ds.setId}>{ds.name}</option>
          {/each}
        </select>
      </div>
    {:else}
      {#each [set2aId, set2bId, set2cId] as _val, i}
        <div class="set-row">
          <span>2set {i + 1}:</span>
          <select
            value={i === 0 ? set2aId : i === 1 ? set2bId : set2cId}
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

    <!-- チーム/デバフ効果トグル -->
    <div class="field-label">チーム / デバフ効果</div>
    <div class="effect-list">
      <!-- キャラ自身の team/enemy エフェクト -->
      {#each currentChar.effects.filter((e) => e.target === 'team' || e.target === 'enemy') as eff}
        <label>
          <input type="checkbox" bind:checked={effToggles[eff.id]} />
          <span class="tag tag-{eff.target}">{eff.target}</span>
          {eff.label}
        </label>
      {/each}

      <!-- マインドスケープ (team/enemy のみ) -->
      {#each msEffectsInRange(currentChar, mindscapeLevel) as { lvl, eff }}
        <label>
          <input type="checkbox" bind:checked={effToggles[eff.id]} />
          <span class="tag tag-{eff.target}">{eff.target}</span>
          M{lvl}: {eff.label}
        </label>
      {/each}

      <!-- W-Engine エフェクト (team/enemy) -->
      {#if currentWEngine}
        {#each currentWEngine.effects.filter((e) => e.target === 'team' || e.target === 'enemy') as eff}
          <label>
            <input type="checkbox" bind:checked={effToggles[eff.id]} />
            <span class="tag tag-{eff.target}">{eff.target}</span>
            W: {eff.label}
          </label>
        {/each}
      {/if}

      <!-- ディスクセット 4pc 効果のみ (team/enemy) -->
      <!-- 2pc は常時有効なのでトグル不要 -->
      {#each relevantDiscSets as ds}
        {#each ds.effects4pc.filter((e) => e.target === 'team' || e.target === 'enemy') as eff}
          <label>
            <input type="checkbox" bind:checked={effToggles[dsEffKey(ds.setId, eff.id)]} />
            <span class="tag tag-{eff.target}">{eff.target}</span>
            [{ds.name.substring(0, 4)}] {eff.label} (4pc)
          </label>
        {/each}
      {/each}
    </div>
  {/if}
</div>

<style>
  .support-card {
    border: 1px solid #2a4a7a;
    border-radius: 6px;
    padding: 8px;
    margin-bottom: 8px;
  }
  .slot-title {
    font-size: 0.78rem;
    color: #aaccff;
    text-transform: uppercase;
    margin-bottom: 6px;
    letter-spacing: 0.05em;
  }
  select {
    width: 100%;
    background: #0f3460;
    border: 1px solid #2a4a8a;
    color: #e0e0e0;
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 0.82rem;
    margin-bottom: 4px;
  }
  .field-label {
    font-size: 0.7rem;
    color: #6a8aaa;
    text-transform: uppercase;
    margin: 6px 0 3px;
  }
  .param-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .param-row span {
    font-size: 0.8rem;
    min-width: 40px;
  }
  .num-sm {
    width: 50px;
    background: #0f3460;
    border: 1px solid #2a4a8a;
    color: #e0e0e0;
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 0.82rem;
  }
  .row {
    display: flex;
    gap: 12px;
    margin-bottom: 4px;
  }
  .row label {
    font-size: 0.82rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .set-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .set-row span {
    font-size: 0.75rem;
    min-width: 50px;
    color: #aaaaaa;
  }
  .effect-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .effect-list label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .tag {
    font-size: 0.62rem;
    padding: 1px 4px;
    border-radius: 2px;
    font-weight: bold;
    flex-shrink: 0;
  }
  .tag-team {
    background: #1a3a1a;
    color: #88dd88;
  }
  .tag-enemy {
    background: #3a1a1a;
    color: #dd8888;
  }
</style>
