// ─────────────────────────────────────────────
// StatKey
// ─────────────────────────────────────────────
export type StatKey =
  | 'atk_flat'
  | 'atk_pct_base'
  | 'atk_pct_bonus'
  | 'hp_flat'
  | 'hp_pct_base'
  | 'hp_pct_bonus'
  | 'def_flat'
  | 'def_pct'
  | 'crit_rate'
  | 'crit_dmg'
  | 'dmg_bonus'
  | 'element_dmg_bonus'
  | 'pen_rate'
  | 'pen_flat'
  | 'impact'
  | 'energy_regen'
  | 'adrenaline_regen'
  | 'anomaly_mastery'
  | 'anomaly_proficiency'
  | 'def_down'
  | 'res_down'
  | 'break_vuln';

// ─────────────────────────────────────────────
// Mod / Effect
// ─────────────────────────────────────────────
export interface Mod {
  key: StatKey | string;
  op: 'add';
  value: number;
  /** element_dmg_bonus の属性絞り込み */
  element?: string;
}

export interface EffectCondition {
  mode: 'toggle' | 'uptime';
  defaultUptime?: number;
}

export interface Effect {
  id: string;
  label: string;
  target: 'mainDps' | 'team' | 'enemy';
  enabledByDefault: boolean;
  mods: Mod[];
  condition?: EffectCondition;
}

// ─────────────────────────────────────────────
// Character
// ─────────────────────────────────────────────
export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  impact?: number;
  anomalyMastery?: number;
  anomalyProficiency?: number;
  critRate: number;
  critDmg: number;
  adrenalineRegen?: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  element: string;
  class?: string;
  /** エージェントレベル（省略時 60 扱い）*/
  level?: number;
  baseStats: BaseStats;
  effects: Effect[];
  mindscape?: Record<string, Effect[]>;
}

// ─────────────────────────────────────────────
// W-Engine
// ─────────────────────────────────────────────
export interface WEngineDef {
  id: string;
  name: string;
  baseMods: Mod[];
  effects: Effect[];
}

// ─────────────────────────────────────────────
// Disc Set
// ─────────────────────────────────────────────
export interface DiscSetDef {
  setId: string;
  name: string;
  effects2pc: Effect[];
  effects4pc: Effect[];
}

// ─────────────────────────────────────────────
// Disc (OCR フォーマット)
// ─────────────────────────────────────────────
export interface DiscSubStat {
  stat_key: StatKey;
  value: number;
  rolls: number;
}

export interface Disc {
  id: number;
  name: string;
  slot: number;
  level: number | null;
  rarity: string;
  main_stat: { stat_key: StatKey; value: number };
  sub_stats: DiscSubStat[];
}

// ─────────────────────────────────────────────
// バフプール
// ─────────────────────────────────────────────
export interface BuffPool {
  // 基礎ATK/HPへの% (基礎値 × (1 + この値))
  atk_pct_base: number;
  hp_pct_base: number;

  // 戦闘時ATK/HPへの乗算% ((combatAtk_before_bonus) * (1 + この値))
  atk_pct_bonus: number;
  hp_pct_bonus: number;

  // フラット加算
  atk_flat: number;   // 戦闘時ATK加算バフ (base外側)
  hp_flat: number;    // 戦闘時HP加算バフ
  def_flat: number;

  // その他%
  def_pct: number;
  crit_rate: number;
  crit_dmg: number;
  dmg_bonus: number;
  element_dmg_bonus: number;
  pen_rate: number;
  pen_flat: number;
  impact: number;
  energy_regen: number;
  adrenaline_regen: number;
  anomaly_mastery: number;
  anomaly_proficiency: number;

  // 敵デバフ系
  def_down: number;
  res_down: number;
  break_vuln: number;
}

// ─────────────────────────────────────────────
// 戦闘時ステータス
// ─────────────────────────────────────────────
export interface CombatStats {
  atk: number;
  hp: number;
  def: number;
  critRate: number;
  critDmg: number;
  dmgBonus: number;
  penRate: number;
  penFlat: number;
  anomalyMastery: number;
  anomalyProficiency: number;
  /** 異常ダメージ用レベル補正係数 = 1 + (Lv-1)/59  (Lv60 → 2.0) */
  anomalyLevelCoeff: number;
  defDown: number;
  resDown: number;
  breakVuln: number;
}

// ─────────────────────────────────────────────
// ダメージ基礎値
// ─────────────────────────────────────────────
export interface DamageResult {
  normal: number;
  anomaly: number;
  penetration: number;
}

// ─────────────────────────────────────────────
// 敵パラメータ
// ─────────────────────────────────────────────
export interface EnemyParams {
  enemyLevel: number;
  enemyDef: number;
  enemyResist: number;
  enemyBreakVuln: number;
}

// ─────────────────────────────────────────────
// 最適化設定
// ─────────────────────────────────────────────
export type DamageType = 'normal' | 'anomaly' | 'penetration';

export interface SetConfig {
  setId: string;
  count: 2 | 4;
}

/** ユーザーが選択したエフェクトの有効/無効とuptime */
export interface EffectToggle {
  effectId: string;
  enabled: boolean;
  uptime?: number;
}

export interface OptimizerConfig {
  character: CharacterDef;
  wengine: WEngineDef;
  /** 例: [{setId: "White Water Ballad", count:4}, {setId:"Branch & Blade Song", count:2}] */
  sets: SetConfig[];
  discSetDefs: DiscSetDef[];
  additionalEffects: Effect[];
  enemy: EnemyParams;
  damageType: DamageType;
  effectToggles: EffectToggle[];
  /** 透徹変換効率（キャラ依存） */
  atkToPenRatio: number;
  hpToPenRatio: number;
  /** Mindscape マインドスケープ有効レベル (0=無効, 最大6) */
  mindscapeLevel?: number;
  /** 編成サポートキャラクター（最大2体）*/
  supportChars: SupportCharConfig[];
}

// ─────────────────────────────────────────────
// サポートキャラクター設定
// target == "team" / "enemy" のエフェクトのみ最適化対象キャラのプールへ加算される
// ─────────────────────────────────────────────
export interface SupportCharConfig {
  character: CharacterDef;
  wengine: WEngineDef | null;
  /** 装備しているディスクセット構成（2pc/4pc効果のために使用） */
  sets: SetConfig[];
  mindscapeLevel: number;
  /** このキャラ固有のエフェクトトグル（ID衝突を避けるため独立管理） */
  effectToggles: EffectToggle[];
}

// ─────────────────────────────────────────────
// 最適化結果
// ─────────────────────────────────────────────
export interface SelectedDisc {
  id: number;
  setName: string;
  slot: number;
  mainStat: { key: StatKey; value: number };
  subStats: { key: StatKey; value: number }[];
}

export interface OptimizationResult {
  discs: SelectedDisc[];
  combatStats: CombatStats;
  damage: DamageResult;
  optimizedValue: number;
  totalCombinations: number;
}
