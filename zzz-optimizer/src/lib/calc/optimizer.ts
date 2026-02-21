/**
 * ディスク最適化エンジン
 *
 * 仕様 §4 に基づく全探索 + ディスクセット制約付き組み合わせ探索。
 *
 * 1. sets 設定からスロット割り当てパターンを列挙  (C(6, count) の全組み合わせ)
 * 2. 各パターンでスロット×セットの対応を確定
 * 3. 各スロットの候補ディスクを絞り込み → カルテシアン積で全組み合わせを探索
 * 4. ダメージ基礎値を計算し上位 topN を保持
 */
import type {
  Disc,
  DamageType,
  OptimizationResult,
  OptimizerConfig,
  SelectedDisc,
} from './types';
import { buildBuffPool } from './buff-pool';
import { calcCombatStats } from './combat-stats';
import { calcDamage } from './damage';

// ─────────────────────────────────────────────
// ユーティリティ: C(n, k) の組み合わせ列挙
// ─────────────────────────────────────────────
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...tail] = arr;
  const withHead = combinations(tail, k - 1).map((c) => [head, ...c]);
  const withoutHead = combinations(tail, k);
  return [...withHead, ...withoutHead];
}

// ─────────────────────────────────────────────
// スロット割り当てパターンの列挙
// returns: 長さ 6 の配列 → 各スロット(index=slot-1)のセットID
// ─────────────────────────────────────────────
function enumerateSlotAssignments(sets: { setId: string; count: number }[]): string[][] {
  const results: string[][] = [];

  function recurse(
    slotIdx: number,
    remaining: { setId: string; count: number }[],
    current: string[]
  ): void {
    if (slotIdx === 6) {
      results.push([...current]);
      return;
    }
    for (const s of remaining) {
      if (s.count > 0) {
        current[slotIdx] = s.setId;
        s.count--;
        recurse(slotIdx + 1, remaining, current);
        s.count++;
      }
    }
  }

  recurse(0, sets.map((s) => ({ ...s })), new Array(6).fill(''));
  return results;
}

// ─────────────────────────────────────────────
// SelectedDisc に変換
// ─────────────────────────────────────────────
function toSelected(d: Disc): SelectedDisc {
  return {
    id: d.id,
    setName: d.name,
    slot: d.slot,
    mainStat: { key: d.main_stat.stat_key, value: d.main_stat.value },
    subStats: d.sub_stats.map((s) => ({ key: s.stat_key, value: s.value })),
  };
}

// ─────────────────────────────────────────────
// メイン最適化関数
// ─────────────────────────────────────────────
export function optimize(
  config: OptimizerConfig,
  allDiscs: Map<string, Disc[]>,  // setId → Disc[]
  topN: number = 5
): OptimizationResult[] {
  const { damageType, sets, atkToPenRatio, hpToPenRatio, enemy } = config;

  // セット別・スロット別にディスクを整理
  const discsBySetAndSlot = new Map<string, Map<number, Disc[]>>();
  for (const [setId, discs] of allDiscs) {
    const slotMap = new Map<number, Disc[]>();
    for (const disc of discs) {
      if (!slotMap.has(disc.slot)) slotMap.set(disc.slot, []);
      slotMap.get(disc.slot)!.push(disc);
    }
    discsBySetAndSlot.set(setId, slotMap);
  }

  // スロット割り当てパターンを列挙
  const slotAssignments = enumerateSlotAssignments(sets.map((s) => ({ ...s })));

  let totalCombinations = 0;
  const topResults: { value: number; discs: Disc[] }[] = [];

  const scoreResult = (value: number, discs: Disc[]) => {
    if (topResults.length < topN) {
      topResults.push({ value, discs: [...discs] });
      topResults.sort((a, b) => b.value - a.value);
    } else if (value > topResults[topResults.length - 1].value) {
      topResults[topResults.length - 1] = { value, discs: [...discs] };
      topResults.sort((a, b) => b.value - a.value);
    }
  };

  for (const assignment of slotAssignments) {
    // assignment[i] = slot (i+1) に割り当てるセットID
    // 各スロットの候補ディスクを取得
    const slotCandidates: Disc[][] = [];
    let valid = true;
    for (let slot = 1; slot <= 6; slot++) {
      const setId = assignment[slot - 1];
      const candidates = discsBySetAndSlot.get(setId)?.get(slot) ?? [];
      if (candidates.length === 0) {
        valid = false;
        break;
      }
      slotCandidates.push(candidates);
    }
    if (!valid) continue;

    // カルテシアン積で全組み合わせを探索
    const counts = slotCandidates.map((c) => c.length);
    const total = counts.reduce((a, b) => a * b, 1);
    totalCombinations += total;

    // イテレーティブなカルテシアン積
    for (let idx = 0; idx < total; idx++) {
      const chosen: Disc[] = [];
      let rem = idx;
      for (let s = 0; s < 6; s++) {
        const len = slotCandidates[s].length;
        chosen.push(slotCandidates[s][rem % len]);
        rem = Math.floor(rem / len);
      }

      // バフプール → 戦闘時ステータス → ダメージ
      const { pool, discMainHp, discAtkFlat, discSubHpFlat } = buildBuffPool(config, chosen);
      const cs = calcCombatStats(pool, config, discMainHp, discAtkFlat, discSubHpFlat);
      const dmg = calcDamage(cs, enemy, atkToPenRatio, hpToPenRatio);

      const value =
        damageType === 'normal'
          ? dmg.normal
          : damageType === 'anomaly'
          ? dmg.anomaly
          : dmg.penetration;

      scoreResult(value, chosen);
    }
  }

  // 結果を OptimizationResult[] に変換
  return topResults.map(({ value, discs }) => {
    const { pool, discMainHp, discAtkFlat, discSubHpFlat } = buildBuffPool(config, discs);
    const cs = calcCombatStats(pool, config, discMainHp, discAtkFlat, discSubHpFlat);
    const dmg = calcDamage(cs, enemy, atkToPenRatio, hpToPenRatio);
    return {
      discs: discs.map(toSelected),
      combatStats: cs,
      damage: dmg,
      optimizedValue: value,
      totalCombinations,
    };
  });
}
