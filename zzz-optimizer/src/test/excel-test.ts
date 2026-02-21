/**
 * Excel 突合テスト
 * zzz_calc_logic_report.md §4 初期値と比較し、許容誤差内であることを確認する。
 *
 * 実行:  npx tsx src/test/excel-test.ts
 */

import { calcCombatStats } from '../lib/calc/combat-stats.js';
import { calcDamage } from '../lib/calc/damage.js';
import type { BuffPool, OptimizerConfig } from '../lib/calc/types.js';

// ────────────────────────────────────────────────
// Excel テンプレ初期値から組み立てたバフプール
// ────────────────────────────────────────────────
//
// ■ atk_pct_base の内訳
//   B11*C11 = 0.30*1 = 0.30  (ディスクメイン ATK%)
//   B23*C23 = 0.03*7 = 0.21  (ディスクサブ  ATK%)
//   B35     = 0              (バフ ATK%)
//   計       = 0.51
//
// ■ discAtkFlat の内訳（bracket内・基礎外）
//   B22*C22 = 19*0   = 0     (ディスクサブ ATK_flat)
//   スロット2メイン ATK_flat  = +316
//   計       = 316
//
// ■ disc crit_dmg の内訳
//   B16*C16 = 0.48 * 1 = 0.48  (ディスクメイン 会心ダメ)
//   B27*C27 = 0.048*16 = 0.768 (ディスクサブ  会心ダメ)
//   計       = 1.248
//
// ■ bar = B43(バフ 会心率=0.47) / B44(バフ 会心ダメ=1.5) など
// ────────────────────────────────────────────────
const pool: BuffPool = {
  // ATK
  atk_pct_base:    0.51,   // B11*C11 + B23*C23
  atk_pct_bonus:   0.15,   // B38
  atk_flat:        1700,   // B37（戦闘時ATK加算バフ）
  // HP
  hp_pct_base:     0,
  hp_pct_bonus:    0,
  hp_flat:         0,
  // DEF
  def_pct:         0,
  def_flat:        0,
  // 会心
  crit_rate:       0.758,  // B26*C26 + B43 = 0.288 + 0.47
  crit_dmg:        2.748,  // B16*C16 + B27*C27 + B44 = 0.48 + 0.768 + 1.5
  // ダメボーナス
  dmg_bonus:       1.2,    // B14*C14 + B45 = 0.3 + 0.9
  element_dmg_bonus: 0,
  // 貫通
  pen_rate:        0,      // B13*C13 = 0.24*0 = 0
  pen_flat:        45,     // B28*C28 = 9*5
  // 異常
  anomaly_mastery:     0,
  anomaly_proficiency: 0,
  // その他
  impact:          0,
  energy_regen:    0,
  adrenaline_regen: 0,
  // 敵弱体
  def_down:        0.4,    // B46
  res_down:        0.4,    // B48
  break_vuln:      0.55,   // B52
};

// 基礎攻撃力: Excel B2 は W-Engine 加算済みなので
//   → base.atk = 1642, wEngineAtk = 0 と同義
const fakeConfig: OptimizerConfig = {
  character: {
    id: 'test', name: 'Test', element: 'physical', rarity: 'S',
    baseStats: { atk: 1642, hp: 7673, def: 0, critRate: 0.05, critDmg: 0.50,
                 anomalyMastery: 93, anomalyProficiency: 94 },
    effects: [],
  },
  wengine: {
    id: 'test-we', name: 'Test WE', rarity: 'S', specialty: 'attack',
    baseMods: [],   // atk_flat = 0 (B2 がすでに W-Engine 込み)
    effects: [],
  },
  sets: [],
  discSetDefs: [],
  additionalEffects: [],
  effectToggles: [],
  mindscapeLevel: 0,
  supportChars: [],
};

// ── calcCombatStats の呼び出し ──
const discMainHp   = 2200;   // スロット1メイン HP_flat
const discAtkFlat  = 316;    // スロット2メイン ATK_flat + サブATK_flat(=0)
const discSubHpFlat = 0;     // サブ HP_flat (B24*C24 = 0)

const cs = calcCombatStats(pool, fakeConfig, discMainHp, discAtkFlat, discSubHpFlat);

// ── calcDamage の呼び出し ──
const enemy = { enemyLevel: 60, enemyDef: 953, enemyResist: -0.2, enemyBreakVuln: 1.25 };
const dmg = calcDamage(cs, enemy, 0.3, 0.1);

// ────────────────────────────────────────────────
// 突合チェック
// ────────────────────────────────────────────────
type Check = { label: string; got: number; expected: number; tolerance: number };

const checks: Check[] = [
  { label: '戦闘時 ATK',        got: cs.atk,       expected: 4914.73, tolerance: 1   },
  { label: '戦闘時 HP',         got: cs.hp,        expected: 9873,    tolerance: 1   },
  { label: '会心率',            got: cs.critRate,   expected: 0.808,   tolerance: 0.001 },
  { label: '会心ダメ',          got: cs.critDmg,   expected: 3.248,   tolerance: 0.001 },
  { label: 'ダメバフ合計',      got: cs.dmgBonus,  expected: 1.2,     tolerance: 0.001 },
  { label: '通常:ダメ基礎値',   got: dmg.normal,   expected: 67847.3, tolerance: 10  },
  { label: '異常:ダメ基礎値',   got: dmg.anomaly,  expected: 34818.6, tolerance: 10  },
  { label: '透徹:ダメ基礎値',   got: dmg.penetration, expected: 56531.2, tolerance: 10 },
];

let passed = 0;
let failed = 0;

console.log('\n=== Excel 突合テスト ===\n');

for (const c of checks) {
  const diff = Math.abs(c.got - c.expected);
  const ok = diff <= c.tolerance;
  const mark = ok ? '✅' : '❌';
  const diffStr = diff.toFixed(diff < 1 ? 4 : 2);
  console.log(
    `${mark} ${c.label.padEnd(18)} got=${c.got.toFixed(3).padStart(10)}  expected=${c.expected}  diff=${diffStr}`
  );
  if (ok) passed++; else failed++;
}

console.log(`\n結果: ${passed} PASSED / ${failed} FAILED\n`);
if (failed > 0) process.exit(1);
