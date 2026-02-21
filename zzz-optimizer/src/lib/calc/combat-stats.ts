import type { BuffPool, CombatStats, OptimizerConfig } from './types';

/**
 * バフプールとキャラ基礎ステータスから戦闘時ステータスを算出する。
 *
 * 計算式（仕様 §3.2 および Excel ロジック §3.1 準拠）:
 *
 *   combatAtk = ((baseAtk + wEngineAtk) * (1 + atk_pct_base) + discAtkFlat)
 *               * (1 + atk_pct_bonus)
 *               + pool.atk_flat    ← 戦闘時ATK加算バフ
 *
 *   W-Engine の atk_flat はキャラ基礎ATKと合算したうえで atk_pct_base が乗算される。
 *   ディスクサブ/メインの ATK_flat (discAtkFlat) はブラケット内・基礎外の加算。
 *
 *   combatHp  = (baseHp  * (1 + hp_pct_base) + discSubHpFlat + discMainHp)
 *               * (1 + hp_pct_bonus)
 *               + pool.hp_flat
 */
export function calcCombatStats(
  pool: BuffPool,
  config: OptimizerConfig,
  discMainHp: number,
  discAtkFlat: number,
  discSubHpFlat: number = 0
): CombatStats {
  const base = config.character.baseStats;
  const wEngineAtk = config.wengine.baseMods.find((m) => m.key === 'atk_flat')?.value ?? 0;

  // ── ATK ──
  // (baseAtk + wEngineAtk) がまとめて atk_pct_base の乗算対象になる
  // discAtkFlat = スロット2メイン ATK_flat + サブ ATK_flat（bracket 内・基礎外）
  const combatAtk =
    ((base.atk + wEngineAtk) * (1 + pool.atk_pct_base) + discAtkFlat) *
      (1 + pool.atk_pct_bonus) +
    pool.atk_flat;

  // ── HP ──
  // discMainHp    = スロット1のメインHP（bracket 内）
  // discSubHpFlat = ディスクサブ HP実数（bracket 内、Excel B24*C24 相当）
  // pool.hp_flat  = バフによる HP_flat 加算（bracket 外）
  const combatHp =
    (base.hp * (1 + pool.hp_pct_base) + discSubHpFlat + discMainHp) *
      (1 + pool.hp_pct_bonus) +
    pool.hp_flat;

  // ── 会心 ──
  const combatCritRate = Math.min((base.critRate ?? 0.05) + pool.crit_rate, 1.0);
  const combatCritDmg = (base.critDmg ?? 0.5) + pool.crit_dmg;

  // ── ダメボーナス ──
  const combatDmgBonus = pool.dmg_bonus + pool.element_dmg_bonus;

  // ── 貫通 ──
  const combatPenRate = pool.pen_rate;
  const combatPenFlat = pool.pen_flat;

  // ── 異常 ──
  const combatAnomalyMastery = (base.anomalyMastery ?? 0) + pool.anomaly_mastery;
  const combatAnomalyProficiency = (base.anomalyProficiency ?? 0) + pool.anomaly_proficiency;
  // Lv補正: (1 + (Lv-1)/59)  Lv60 → 2.0 (anomaly_damage.md 準拠)
  const agentLevel = config.character.level ?? 60;
  const anomalyLevelCoeff = 1 + (agentLevel - 1) / 59;

  return {
    atk: combatAtk,
    hp: combatHp,
    def: base.def * (1 + pool.def_pct) + pool.def_flat,
    critRate: combatCritRate,
    critDmg: combatCritDmg,
    dmgBonus: combatDmgBonus,
    penRate: combatPenRate,
    penFlat: combatPenFlat,
    anomalyMastery: combatAnomalyMastery,
    anomalyProficiency: combatAnomalyProficiency,
    anomalyLevelCoeff,
    defDown: pool.def_down,
    resDown: pool.res_down,
    breakVuln: pool.break_vuln,
  };
}
