import type {
  BuffPool,
  Disc,
  Effect,
  EffectToggle,
  Mod,
  OptimizerConfig,
} from './types';

// ─────────────────────────────────────────────
// 空のバフプールを生成
// ─────────────────────────────────────────────
export function emptyBuffPool(): BuffPool {
  return {
    atk_pct_base: 0,
    hp_pct_base: 0,
    atk_pct_bonus: 0,
    hp_pct_bonus: 0,
    atk_flat: 0,
    hp_flat: 0,
    def_flat: 0,
    def_pct: 0,
    crit_rate: 0,
    crit_dmg: 0,
    dmg_bonus: 0,
    element_dmg_bonus: 0,
    pen_rate: 0,
    pen_flat: 0,
    impact: 0,
    energy_regen: 0,
    adrenaline_regen: 0,
    anomaly_mastery: 0,
    anomaly_proficiency: 0,
    def_down: 0,
    res_down: 0,
    break_vuln: 0,
  };
}

// ─────────────────────────────────────────────
// 単一 Mod をプールに加算
// ─────────────────────────────────────────────
function applyMod(pool: BuffPool, mod: Mod, uptime: number, characterElement: string): void {
  const v = mod.value * uptime;
  if (mod.key === 'element_dmg_bonus') {
    // 属性一致のみ加算
    if (mod.element === characterElement) {
      pool.element_dmg_bonus += v;
    }
    return;
  }
  const key = mod.key as keyof BuffPool;
  if (key in pool) {
    (pool[key] as number) += v;
  }
}

// ─────────────────────────────────────────────
// Effect を評価してプールに加算
// ─────────────────────────────────────────────
function applyEffect(
  pool: BuffPool,
  effect: Effect,
  characterElement: string,
  toggles: Map<string, EffectToggle>
): void {
  const toggle = toggles.get(effect.id);

  // 有効/無効の判定
  const enabled = toggle ? toggle.enabled : effect.enabledByDefault;
  if (!enabled) return;

  // uptime 算出
  let uptime = 1.0;
  if (effect.condition?.mode === 'uptime') {
    uptime = toggle?.uptime ?? effect.condition.defaultUptime ?? 1.0;
  }

  for (const mod of effect.mods) {
    applyMod(pool, mod, uptime, characterElement);
  }
}


// ─────────────────────────────────────────────────────────
// バフプール構築
// キャラ / Wエンジン / ディスクセット効果 / 追加エフェクト
// (ディスク自体の寄与は別途 applyDiscStats で扱う)
// ─────────────────────────────────────────────────────────
export function buildBuffPool(
  config: OptimizerConfig,
  discs: Disc[]
): {
  pool: BuffPool;
  discMainHp: number;
  discAtkFlat: number;    // disc main slot2 ATK + disc sub ATK flat
  discSubHpFlat: number; // disc sub HP flat (bracket 内加算)
} {
  const pool = emptyBuffPool();
  const { character, wengine, sets, discSetDefs, additionalEffects, effectToggles } = config;
  const element = character.element;

  // トグルマップ構築
  const toggleMap = new Map<string, EffectToggle>();
  for (const t of effectToggles) {
    toggleMap.set(t.effectId, t);
  }

  // ── キャラクターエフェクト ──
  for (const eff of character.effects) {
    applyEffect(pool, eff, element, toggleMap);
  }

  // マインドスケープ
  const ml = config.mindscapeLevel ?? 0;
  if (ml > 0 && character.mindscape) {
    for (let i = 1; i <= ml; i++) {
      const msEffects = character.mindscape[String(i)];
      if (msEffects) {
        for (const eff of msEffects) {
          applyEffect(pool, eff, element, toggleMap);
        }
      }
    }
  }

  // ── W-Engine base mods（ATK_flat 以外）──
  // ATK_flat は wEngineAtk として別途扱う
  for (const mod of wengine.baseMods) {
    if (mod.key !== 'atk_flat') {
      applyMod(pool, mod, 1.0, element);
    }
  }

  // ── W-Engine エフェクト ──
  for (const eff of wengine.effects) {
    applyEffect(pool, eff, element, toggleMap);
  }

  // ── ディスクセット効果 ──
  for (const setConfig of sets) {
    const def = discSetDefs.find((d) => d.setId === setConfig.setId);
    if (!def) continue;

    // 2pc は常に適用
    for (const eff of def.effects2pc) {
      applyEffect(pool, eff, element, toggleMap);
    }

    // 4pc は count==4 のときのみ
    if (setConfig.count === 4) {
      for (const eff of def.effects4pc) {
        applyEffect(pool, eff, element, toggleMap);
      }
    }
  }

  // ── 追加エフェクト ──
  for (const eff of additionalEffects) {
    applyEffect(pool, eff, element, toggleMap);
  }

  // ── サポートキャラクターのチーム/敵デバフ効果 ──
  // target == "mainDps" はサポート自身のステータスへの効果なので除外する
  for (const sc of config.supportChars ?? []) {
    const scToggleMap = new Map<string, EffectToggle>();
    for (const t of sc.effectToggles) {
      scToggleMap.set(t.effectId, t);
    }

    const applyTeamEnemy = (eff: Effect) => {
      if (eff.target === 'team' || eff.target === 'enemy') {
        applyEffect(pool, eff, element, scToggleMap);
      }
    };

    // キャラクターエフェクト
    for (const eff of sc.character.effects) applyTeamEnemy(eff);

    // マインドスケープ
    if (sc.mindscapeLevel > 0 && sc.character.mindscape) {
      for (let i = 1; i <= sc.mindscapeLevel; i++) {
        for (const eff of sc.character.mindscape[String(i)] ?? []) {
          applyTeamEnemy(eff);
        }
      }
    }

    // W-Engine エフェクト（baseMods はサポート自身のATKなので除外）
    if (sc.wengine) {
      for (const eff of sc.wengine.effects) applyTeamEnemy(eff);
    }

    // ディスクセット効果
    // - 2pc：team/enemy エフェクトを常時適用（toggle 不要・常有効）
    // - 4pc：SupportCharPanel が "${setId}:${effId}" で名前空間化したキーで参照
    for (const setConf of sc.sets) {
      const def = config.discSetDefs.find((d) => d.setId === setConf.setId);
      if (!def) continue;

      // 2pc は常時有効
      for (const eff of def.effects2pc) {
        if (eff.target !== 'team' && eff.target !== 'enemy') continue;
        let uptime = 1.0;
        if (eff.condition?.mode === 'uptime') {
          uptime = eff.condition.defaultUptime ?? 1.0;
        }
        for (const mod of eff.mods) applyMod(pool, mod, uptime, element);
      }

      // 4pc は名前空間キー "${setId}:${effId}" でトグル参照
      if (setConf.count === 4) {
        for (const eff of def.effects4pc) {
          if (eff.target !== 'team' && eff.target !== 'enemy') continue;
          const namespacedKey = `${setConf.setId}:${eff.id}`;
          const toggle = scToggleMap.get(namespacedKey);
          const enabled = toggle ? toggle.enabled : eff.enabledByDefault;
          if (!enabled) continue;
          let uptime = 1.0;
          if (eff.condition?.mode === 'uptime') {
            uptime = toggle?.uptime ?? eff.condition.defaultUptime ?? 1.0;
          }
          for (const mod of eff.mods) applyMod(pool, mod, uptime, element);
        }
      }
    }
  }

  let discMainHp = 0;
  let discAtkFlat = 0;    // slot2 main ATK flat + sub ATK flat
  let discSubHpFlat = 0; // disc sub HP flat (bracket 内)

  for (const disc of discs) {
    const ms = disc.main_stat;
    switch (ms.stat_key) {
      case 'hp_flat':
        discMainHp += ms.value;
        break;
      case 'atk_flat':
        discAtkFlat += ms.value;
        break;
      case 'def_flat':
        pool.def_flat += ms.value;
        break;
      case 'atk_pct_base':
        pool.atk_pct_base += ms.value;
        break;
      case 'crit_rate':
        pool.crit_rate += ms.value;
        break;
      case 'crit_dmg':
        pool.crit_dmg += ms.value;
        break;
      case 'pen_rate':
        pool.pen_rate += ms.value;
        break;
      case 'dmg_bonus':
        pool.dmg_bonus += ms.value;
        break;
      case 'anomaly_mastery':
        pool.anomaly_mastery += ms.value;
        break;
      case 'anomaly_proficiency':
        pool.anomaly_proficiency += ms.value;
        break;
      default:
        break;
    }

    for (const sub of disc.sub_stats) {
      switch (sub.stat_key) {
        case 'atk_flat':
          discAtkFlat += sub.value;
          break;
        case 'atk_pct_base':
          pool.atk_pct_base += sub.value;
          break;
        case 'hp_flat':
          // sub hp_flat は base HP の bracket 内に入る
          discSubHpFlat += sub.value;
          break;
        case 'hp_pct_base':
          pool.hp_pct_base += sub.value;
          break;
        case 'def_flat':
          pool.def_flat += sub.value;
          break;
        case 'def_pct':
          pool.def_pct += sub.value;
          break;
        case 'crit_rate':
          pool.crit_rate += sub.value;
          break;
        case 'crit_dmg':
          pool.crit_dmg += sub.value;
          break;
        case 'pen_flat':
          pool.pen_flat += sub.value;
          break;
        case 'anomaly_proficiency':
          pool.anomaly_proficiency += sub.value;
          break;
        case 'anomaly_mastery':
          pool.anomaly_mastery += sub.value;
          break;
        default:
          break;
      }
    }
  }

  return { pool, discMainHp, discAtkFlat, discSubHpFlat };
}
