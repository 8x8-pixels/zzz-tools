import type { CombatStats, DamageResult, EnemyParams } from './types';

const DEF_CONSTANT = 794; // Lv60 定数

/**
 * 戦闘時ステータスと敵パラメータからダメージ基礎値（倍率前）を算出する。
 *
 * 計算式（仕様 §3.4, §3.5 / Excel §3.2 / anomaly_damage.md / toutetu.md 準拠）:
 *
 *   防御係数   = MIN(794 / (794 + MAX(effectiveDef, 0)), 1)
 *   耐性係数   = 1 - enemyResist + resDown
 *   ブレイク係数 = enemyBreakVuln + breakVuln
 *   会心係数   = 1 + critRate * critDmg
 *   ダメボーナス係数 = 1 + dmgBonus
 *
 *   通常 = ATK * critCoeff * dmgBonusCoeff * defCoeff * resCoeff * breakCoeff
 *   異常 = ATK * (anomalyMastery/100) * anomalyLevelCoeff * dmgBonusCoeff * defCoeff * resCoeff * breakCoeff
 *          ※会心なし、/100 必須、Lv補正 (Lv60=×2)
 *   透徹 = penetration * critCoeff * dmgBonusCoeff * 1(防御無視) * resCoeff * breakCoeff
 *          ※透徹ダメージは敵防御力を100%無視 (defCoeff=1)
 */
export function calcDamage(
  cs: CombatStats,
  enemy: EnemyParams,
  atkToPenRatio: number,
  hpToPenRatio: number
): DamageResult {
  const { atk, hp, critRate, critDmg, dmgBonus, penRate, penFlat, anomalyMastery } = cs;
  const { enemyDef, enemyResist, enemyBreakVuln } = enemy;

  // ── 防御係数 ──
  const effectiveDef = enemyDef * (1 - penRate) * (1 - cs.defDown) - penFlat;
  const defCoeff = Math.min(DEF_CONSTANT / (DEF_CONSTANT + Math.max(effectiveDef, 0)), 1);

  // ── 耐性係数 ──
  const resCoeff = 1 - enemyResist + cs.resDown;

  // ── ブレイク係数 ──
  const breakCoeff = enemyBreakVuln + cs.breakVuln;

  // ── 会心係数（期待値） ──
  const critCoeff = 1 + critRate * critDmg;

  // ── ダメボーナス係数 ──
  const dmgBonusCoeff = 1 + dmgBonus;

  // ── 通常 ──
  const normalDmg = atk * critCoeff * dmgBonusCoeff * defCoeff * resCoeff * breakCoeff;

  // ── 異常 ──
  // /100 必須（anomalyMastery は実数値 e.g. 93）、Lv補正あり、会心なし
  const anomalyDmg =
    atk * (anomalyMastery / 100) * cs.anomalyLevelCoeff *
    dmgBonusCoeff * defCoeff * resCoeff * breakCoeff;

  // ── 透徹 ──
  // 透徹ダメージは敵の防御力を100%無視 → defCoeff = 1 (toutetu.md 準拠)
  const penetration = atk * atkToPenRatio + hp * hpToPenRatio;
  const penDmg =
    penetration > 0
      ? penetration * critCoeff * dmgBonusCoeff * 1 * resCoeff * breakCoeff
      : 0;

  return { normal: normalDmg, anomaly: anomalyDmg, penetration: penDmg };
}
