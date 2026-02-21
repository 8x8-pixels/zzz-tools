# ZZZ ディスク最適化ツール — 仕様・実装ドキュメント

## 1. 概要

### 1.1 目的
所持ディスク（OCR JSON）の中から、選択したキャラクター・音動機（W-Engine）・ディスクセット・エフェクトの構成において **最大ダメージを出すディスク組み合わせ** を自動で算出する。

### 1.2 ユーザーフロー
```
1. 構成を選択
   ├─ キャラクター（1体）
   ├─ 音動機（1本）
   ├─ ディスクセット構成（4+2 or 2+2+2）
   └─ 追加エフェクト（任意数、uptime 調整可）

2. 敵パラメータを入力
   ├─ 敵レベル
   ├─ 敵防御力
   ├─ 敵ダメージ耐性
   └─ 敵ブレイク弱体倍率

3. 最適化対象を選択
   └─ 通常ダメージ / 異常ダメージ / 透徹ダメージ

4. 実行 → 最適ディスク6枚を出力
```

---

## 2. 入力データ

### 2.1 構成選択

| 項目 | データソース | 選択数 |
|---|---|---|
| キャラクター | `characters.json` → `CharacterDef` | 1 |
| 音動機 | `wengines.json` → `WEngineDef` | 1 |
| ディスクセット | `disc_sets.json` → `DiscSetDef` | 1〜3セット（4+2 or 2+2+2） |
| 追加エフェクト | `effect_library.json` → `Effect[]` | 0〜N |

### 2.2 所持ディスク

OCR ツールが出力する JSON ファイル群。セット名ごとに1ファイル。  
OCR ツール側で **StatKey 変換・値の数値化は完了済み** の前提とする（変換仕様は `ocr_stat_key_mapping.md` 参照）。

```jsonc
// 例: white_water_ballad.json (変換済みフォーマット)
{
  "name": "White Water Ballad",  // セット名
  "slot": 1,                      // スロット番号 (1-6)
  "level": 15,
  "rarity": "S",
  "main_stat": {
    "stat_key": "hp_flat",          // 変換済み StatKey
    "value": 2200                   // 数値化済み
  },
  "sub_stats": [
    { "stat_key": "crit_rate",      "value": 0.024, "rolls": 0 },
    { "stat_key": "def_pct",        "value": 0.096, "rolls": 1 },
    { "stat_key": "atk_pct_base",   "value": 0.03,  "rolls": 0 },
    { "stat_key": "crit_dmg",       "value": 0.192, "rolls": 3 }
  ],
  "id": 0
}
```

### 2.3 敵パラメータ（ユーザー入力）

| パラメータ | 変数名 | デフォルト値 | 説明 |
|---|---|---|---|
| 敵レベル | `enemyLevel` | 60 | レベル係数算出に使用 |
| 敵防御力 | `enemyDef` | 953 | 防御係数算出に使用 |
| 敵ダメージ耐性 | `enemyResist` | -0.2 | 耐性係数に使用（負値 = 弱点） |
| 敵ブレイク弱体倍率 | `enemyBreakVuln` | 1.25 | ブレイク係数に使用 |

---

## 3. ダメージ計算ロジック

Excel「ダメ計シミュテンプレ」(zzz_calc_logic_report.md) のロジックを移植する。

### 3.1 ステータス集計フェーズ

全エフェクト（キャラ・音動機・ディスクセット・追加エフェクト）の Mod を集計し、**累積バフプール**を構築する。

#### 3.1.1 バフプール構造

```typescript
type BuffPool = {
  // ── 加算系（基礎値に乗算する %） ──
  atk_pct_base: number;     // 基礎ATKに対する%加算 (ディスク/一部バフ)
  hp_pct_base: number;      // 基礎HPに対する%加算

  // ── 加算系（装備込み値への追加%） ──
  atk_pct_bonus: number;    // 戦闘時ATK乗算 (セット効果等)
  hp_pct_bonus: number;     // 戦闘時HP乗算

  // ── フラット加算 ──
  atk_flat: number;         // ATK実数加算 (サブステ/バフ)
  hp_flat: number;          // HP実数加算
  def_flat: number;         // DEF実数加算

  // ── その他% ──
  def_pct: number;
  crit_rate: number;
  crit_dmg: number;
  dmg_bonus: number;        // ダメージボーナス合算
  pen_rate: number;
  pen_flat: number;
  impact: number;
  energy_regen: number;
  adrenaline_regen: number;
  anomaly_mastery: number;
  anomaly_proficiency: number;

  // ── 敵デバフ系 ──
  def_down: number;
  res_down: number;
  break_vuln: number;

  // ── 属性ダメボーナス ──
  element_dmg_bonus: number; // キャラ属性一致分のみ加算
};
```

#### 3.1.2 Mod 集計ルール

```
for each source in [character.effects, wengine.baseMods, wengine.effects,
                     discSet.effects2pc, discSet.effects4pc, effectLibrary]:
  for each effect:
    if effect.enabledByDefault == false → skip (unless user toggled ON)
    uptime = effect.condition?.mode == "uptime"
             ? effect.condition.defaultUptime ?? 1.0
             : 1.0
    for each mod in effect.mods:
      if mod.key == "element_dmg_bonus":
        if mod.element == character.element:
          pool.element_dmg_bonus += mod.value * uptime
      else:
        pool[mod.key] += mod.value * uptime
```

**target フィルタリング:**
- `target == "mainDps"` → メインDPSのステータスに加算
- `target == "team"` → メインDPSのステータスに加算（チーム全体バフ）
- `target == "enemy"` → `def_down`, `res_down`, `break_vuln` に加算

### 3.2 戦闘時ステータス算出

Excel の F列に対応する計算。

```typescript
// ── ATK ──
// 基礎ATK = キャラATK
// W-Engine ATK = baseMods の atk_flat (加算、式中の "+316" に相当)
const baseAtk = character.baseStats.atk;
const wEngineAtk = wengine.baseMods.find(m => m.key === "atk_flat")?.value ?? 0;

const combatAtk =
  (baseAtk * (1 + pool.atk_pct_base) + discSubAtk_flat + wEngineAtk)
  * (1 + pool.atk_pct_bonus)
  + pool.atk_flat;  // 戦闘時ATK加算バフ (例: 千夏core +1050)

// ── HP ──
const baseHp = character.baseStats.hp;
const discMainHp = /* スロット1メインのHP値 */;

const combatHp =
  (baseHp * (1 + pool.hp_pct_base) + discSubHp_flat + discMainHp)
  * (1 + pool.hp_pct_bonus)
  + pool.hp_flat;

// ── 会心 ──
const combatCritRate = Math.min(
  character.baseStats.critRate + pool.crit_rate,
  1.0
);
const combatCritDmg = character.baseStats.critDmg + pool.crit_dmg;

// ── ダメボーナス ──
const combatDmgBonus = pool.dmg_bonus + pool.element_dmg_bonus;

// ── 貫通 ──
const combatPenRate = pool.pen_rate;
const combatPenFlat = pool.pen_flat;

// ── 異常 ──
const combatAnomalyMastery =
  character.baseStats.anomalyMastery + pool.anomaly_mastery;
```

> **注**: Excel の式 `(B2 * (1 + B11*C11 + B23*C23 + B35) + B22*C22 + 316)` では ATK% が全て基礎ATKに乗算されている。effect-tool ではディスクの ATK% = `atk_pct_base`、セット効果等の ATK% = `atk_pct_bonus` と分離して計算する。

### 3.3 ディスクステータスの扱い

ディスクの寄与は以下に分解される：

| ディスク要素 | 集計先 | 備考 |
|---|---|---|
| メインステ: HP (slot 1) | `discMainHp` フラット加算 | 基礎HPの外側で加算 |
| メインステ: ATK (slot 2) | `discSubAtk_flat` フラット加算 | 基礎ATKの外側で加算 |
| メインステ: DEF (slot 3) | フラット加算 | |
| メインステ: ATK% | `atk_pct_base` | 基礎ATKに乗算 |
| メインステ: CRIT Rate | `crit_rate` | 加算 |
| メインステ: CRIT DMG | `crit_dmg` | 加算 |
| メインステ: PEN Ratio | `pen_rate` | 加算 |
| メインステ: DMG Bonus | `dmg_bonus` / `element_dmg_bonus` | 属性一致判定 |
| メインステ: Anomaly Mastery | `anomaly_mastery` | 加算 |
| サブステ: ATK (flat) | `discSubAtk_flat` | 基礎ATKの外側で加算 |
| サブステ: ATK% | `atk_pct_base` | 基礎ATKに乗算 |
| サブステ: HP (flat) | `discSubHp_flat` | |
| サブステ: HP% | `hp_pct_base` | 基礎HPに乗算 |
| サブステ: DEF (flat) | - | 最適化では通常無視 |
| サブステ: DEF% | - | 最適化では通常無視 |
| サブステ: CRIT Rate | `crit_rate` | 加算 |
| サブステ: CRIT DMG | `crit_dmg` | 加算 |
| サブステ: PEN (flat) | `pen_flat` | 加算 |
| サブステ: Anomaly Prof. | `anomaly_proficiency` | 加算 |

**メインステの注意:** Excel の式でスロット1 HP (2200) とスロット2 ATK (316) は定数加算。最適化ツールでは実際のディスクの `main_stat.value` を使用する。

### 3.4 ダメージ係数

```typescript
// ── 防御係数 ──
const DEF_CONSTANT = 794; // Lv60 定数
const effectiveDef = enemyDef * (1 - combatPenRate) * (1 - pool.def_down) - combatPenFlat;
const defCoeff = Math.min(DEF_CONSTANT / (DEF_CONSTANT + Math.max(effectiveDef, 0)), 1);

// ── 耐性係数 ──
const resCoeff = 1 - enemyResist + pool.res_down;

// ── ブレイク弱体係数 ──
const breakCoeff = enemyBreakVuln + pool.break_vuln;

// ── 会心係数（期待値） ──
const critCoeff = 1 + combatCritRate * combatCritDmg;

// ── ダメージボーナス係数 ──
const dmgBonusCoeff = 1 + combatDmgBonus;
```

### 3.5 ダメージ基礎値（倍率を掛ける前）

3系統のダメージを計算する。最適化の目的関数はこの中から1つを選択。

```typescript
// ── 通常ダメージ基礎値 ──
const normalDmg = combatAtk * critCoeff * dmgBonusCoeff * defCoeff * resCoeff * breakCoeff;

// ── 異常ダメージ基礎値 ──
// 異常ダメージは会心しない（一部キャラを除く）。
// 異常マスタリがベースで、ATKで倍率がかかる。
const anomalyDmg = combatAtk * combatAnomalyMastery * dmgBonusCoeff * defCoeff * resCoeff * breakCoeff;

// ── 透徹ダメージ基礎値 ──
// 透徹力 = ATK * atk→透徹変換効率 + HP * hp→透徹変換効率 (+加算)
// ※変換効率はキャラ依存定数（デフォルト: ATK 0.3, HP 0.1）
const penetration = combatAtk * atkToPenRatio + combatHp * hpToPenRatio;
const penDmg = penetration * critCoeff * dmgBonusCoeff * defCoeff * resCoeff * breakCoeff;
```

---

## 4. ディスク最適化アルゴリズム

### 4.1 制約条件

| 制約 | 説明 |
|---|---|
| スロット制約 | 各スロット (1-6) に1枚ずつ、計6枚 |
| セット制約 | 選択されたセット構成を満たすこと（例: 4+2 → セットA 4枚 + セットB 2枚） |
| 所持制約 | 所持ディスクの中からのみ選択 |

### 4.2 セット構成パターン

| パターン | 内訳 | セット効果 |
|---|---|---|
| 4+2 | セットA×4枚 + セットB×2枚 | A の 2pc + 4pc、B の 2pc |
| 2+2+2 | A×2 + B×2 + C×2 | A/B/C 各 2pc |

**スロット割り当て:** 4セット側はスロット 1,2,3 + (4 or 5 or 6 のいずれか) を優先、残りを2セット側に充てるが、最適化上は全パターンを探索する。

### 4.3 探索戦略

#### 探索対象

**ユーザーが選択したディスクセットに属するOCRディスクのみ** が探索対象となる。

```
例: 4+2 構成（White Water Ballad 4pc + Branch & Blade Song 2pc）の場合

  探索対象:
    ├─ OCR読込済み White Water Ballad のディスク一覧
    └─ OCR読込済み Branch & Blade Song のディスク一覧

  対象外:
    └─ 他セットのOCRディスク（読み込み済みでも無視）
```

#### 方式: 全探索 + 枝刈り

対象ディスクは選択セットのOCR分のみ（各セット・各スロットに数枚程度）のため、全組み合わせの列挙が可能。

```
1. セット構成からスロット割り当てパターンを列挙
   例 (4+2): セットAが占めるスロット4枠の組み合わせ = C(6,4) = 15 パターン
2. 各パターンについて:
   a. 各スロットに対応するセットのOCRディスクから候補リストを構築
   b. スロット1 → ... → スロット6 の順に組み合わせを生成
   c. ダメージ基礎値を計算し、最大値を保持
```

#### 計算量の推定

```
典型的なケース (4+2):
- スロット割り当てパターン: C(6,4) = 15
- 各セットの各スロット: 2〜5枚
- 1パターンあたりの組み合わせ: 最大 5^6 = 15,625
- 実際にはスロットに該当ディスクがない場合が多く大幅に削減
- 全パターン合計: 数百〜数千通り程度

→ ブラウザ上で十分リアルタイム計算可能
```

#### 枝刈り（オプション）

- スロット1 (HP), 2 (ATK), 3 (DEF) のメインステは固定のため、サブステのみで差がつく
- 会心率が 100% を超える組み合わせは、超過分が無駄 → 会心率上限に近い組み合わせを優先

### 4.4 出力

```typescript
type OptimizationResult = {
  // 選択されたディスク6枚
  discs: SelectedDisc[];
  // 戦闘時ステータス
  combatStats: CombatStats;
  // ダメージ基礎値
  damage: {
    normal: number;
    anomaly: number;
    penetration: number;
  };
  // 最適化対象のダメージ値
  optimizedValue: number;
  // 候補数
  totalCombinations: number;
};

type SelectedDisc = {
  id: number;
  setName: string;
  slot: number;
  mainStat: { key: StatKey; value: number };
  subStats: { key: StatKey; value: number }[];
};

type CombatStats = {
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
  defDown: number;
  resDown: number;
  breakVuln: number;
};
```

---

## 5. データパイプライン

### 5.1 全体フロー

```
┌─────────────────┐     ┌─────────────────┐
│  effect-json-   │     │   OCR ツール     │
│  builder (GUI)  │     │  (disc scanner)  │
│                 │     │                  │
│  characters.json│     │  white_water_    │
│  wengines.json  │     │  ballad.json     │
│  disc_sets.json │     │  branch_and_     │
│  effects.json   │     │  blade_song.json │
└───────┬─────────┘     └───────┬──────────┘
        │                       │
        ▼                       ▼
┌───────────────────────────────────────────┐
│         ディスク最適化エンジン             │
│                                           │
│ 1. Effect JSON をロード                    │
│ 2. 変換済みディスク JSON をロード            │
│ 3. ユーザーが構成 & 敵パラメータを選択      │
│ 4. バフプール構築                           │
│ 5. 全ディスク組合せを探索                   │
│ 6. 最適解を出力                            │
└───────────────────────────────────────────┘
```

### 5.2 ディスク JSON の読み込み

OCR ツール側で StatKey 変換・値の数値化は完了済みのため、Optimizer はそのまま読み込むだけでよい。

```typescript
// ディスク JSON はこの型で直接読み込める
type Disc = {
  id: number;
  name: string;            // セット名
  slot: number;            // 1-6
  level: number | null;
  rarity: string;
  main_stat: {
    stat_key: StatKey;
    value: number;          // 数値化済み (% は小数)
  };
  sub_stats: {
    stat_key: StatKey;
    value: number;          // 数値化済み
    rolls: number;
  }[];
};

// ファイル読み込み
function loadDiscs(json: Disc[]): Disc[] {
  return json; // 変換不要、そのまま使用
}
```

---

## 6. UI 設計

### 6.1 画面構成

```
┌─────────────────────────────────────────────────────────┐
│  ZZZ Disc Optimizer                                     │
├─────────────────────────┬───────────────────────────────┤
│  ■ 構成パネル (左)       │  ■ 結果パネル (右)           │
│                         │                               │
│  [キャラクター ▼]        │  ── 最適ディスク ──           │
│  [音動機 ▼]              │  Slot 1: ○○○ (HP 2200)      │
│                         │    CR 2.4% / CD 19.2% / ...  │
│  ── セット構成 ──        │  Slot 2: ○○○ (ATK 316)      │
│  パターン: [4+2 ▼]      │    ...                       │
│  4セット: [WWB ▼]       │  Slot 3: ...                 │
│  2セット: [B&BS ▼]      │  Slot 4: ...                 │
│                         │  Slot 5: ...                 │
│  ── 追加エフェクト ──    │  Slot 6: ...                 │
│  ☑ ride-the-current     │                               │
│  □ ...                  │  ── 戦闘時ステータス ──       │
│                         │  ATK:      4914              │
│  ── 敵パラメータ ──      │  HP:       9873              │
│  レベル:    [60  ]      │  CRIT:     80.8% / 324.8%   │
│  防御力:    [953 ]      │  DMG Bonus: 120%             │
│  耐性:      [-0.2]      │  PEN Rate:  24%              │
│  ブレイク:  [1.25]      │                               │
│                         │  ── ダメージ基礎値 ──         │
│  ── 最適化対象 ──        │  通常:   67,847              │
│  ◉ 通常ダメージ         │  異常:   34,818              │
│  ○ 異常ダメージ         │  透徹:   56,531              │
│  ○ 透徹ダメージ         │                               │
│                         │  ── Top 5 候補 ──            │
│  [▶ 最適化実行]          │  #1: 67,847 (current)       │
│                         │  #2: 67,210                  │
│                         │  #3: 66,985                  │
└─────────────────────────┴───────────────────────────────┘
```

### 6.2 ディスクデータ読み込み

- ファイル選択（複数ファイル対応）で OCR JSON を読み込む
- セット名ごとに自動グルーピング
- 読み込み済みディスク数をセット名と共に表示

---

## 7. 実装計画

### Phase 1: コアエンジン（計算ロジック）

| ファイル | 内容 |
|---|---|
| `src/lib/calc/types.ts` | `BuffPool`, `CombatStats`, `Disc`, `OptimizationResult` 型定義 |
| `src/lib/calc/buff-pool.ts` | Effect/Mod → BuffPool 集計 |
| `src/lib/calc/combat-stats.ts` | BuffPool + BaseStats → CombatStats 計算 |
| `src/lib/calc/damage.ts` | CombatStats + 敵パラメータ → ダメージ基礎値 |
| `src/lib/calc/optimizer.ts` | ディスク組み合わせ探索 + 最適解出力 |

### Phase 2: UI

| ファイル | 内容 |
|---|---|
| `src/components/OptimizerPage.svelte` | メイン画面（構成選択 + 結果表示） |
| `src/components/DiscLoader.svelte` | ディスク JSON 読み込み UI |
| `src/components/ResultPanel.svelte` | 最適結果表示 |

### Phase 3: 拡張

- Top N 候補の比較表示
- ディスク個別の寄与度分析（差し替えた場合のダメージ変化）
- 特定ステータスのロック（例: 会心率80%以上を保証）
- 複数キャラのディスク同時最適化（ディスク共有制約）

---

## 8. 定数・変換テーブル

### 8.1 防御係数定数

| エージェントLv | 定数 |
|---|---|
| 60 | 794 |

> 一般式: `定数 = Lv * 13 + 14` (要検証)

### 8.2 ディスクメインステ固定値 (Lv15, Sランク)

| スロット | メインステ | 固定値 |
|---|---|---|
| 1 | HP (flat) | 2,200 |
| 2 | ATK (flat) | 316 |
| 3 | DEF (flat) | 184 |
| 4 | 可変 | ATK% 30%, CRIT Rate 24%, CRIT DMG 48%, Anomaly Prof. 92 |
| 5 | 可変 | ATK% 30%, PEN Ratio 24%, 属性DMG 30% |
| 6 | 可変 | ATK% 30%, Impact 18%, Energy Regen 20%, Anomaly Mastery 30% |

### 8.3 ディスクサブステ基本値 (Sランク, 0 roll)

| ステータス | 基本値 | 1 roll あたり |
|---|---|---|
| ATK (flat) | 19 | +19 |
| ATK% | 3% | +3% |
| HP (flat) | 112 | +112 |
| HP% | 3% | +3% |
| DEF (flat) | 15 | +15 |
| DEF% | 4.8% | +4.8% |
| CRIT Rate | 2.4% | +2.4% |
| CRIT DMG | 4.8% | +4.8% |
| PEN (flat) | 9 | +9 |
| Anomaly Prof. | 9 | +9 |

> これらの値は OCR データから読み取るため、計算時に使用するのは OCR 出力の `value` の実測値。

---

## 9. Excel ロジックとの対応表

| Excel セル | 意味 | 本ツールの対応 |
|---|---|---|
| B2 | 基礎ATK | `character.baseStats.atk` |
| B3 | 基礎HP | `character.baseStats.hp` |
| B4 | 基礎会心率 | `character.baseStats.critRate` |
| B5 | 基礎会心ダメ | `character.baseStats.critDmg` |
| +316 (式内定数) | W-Engine ATK | `wengine.baseMods[atk_flat].value` |
| +2200 (式内定数) | Slot1 HP | `disc[slot=1].mainStat.value` |
| B11*C11 | ディスクメインATK% | `pool.atk_pct_base` (メインの寄与分) |
| B23*C23 | ディスクサブATK% | `pool.atk_pct_base` (サブの寄与分) |
| B35 | バフATK% | 各Effectの `atk_pct_base` / `atk_pct_bonus` mod |
| B37 | 戦闘時ATK加算 | Effectの `atk_flat` mod (target=team等) |
| B38 | 戦闘時ATK乗算 | `pool.atk_pct_bonus` |
| F17 | 敵防御力 | `enemyDef` (ユーザー入力) |
| F18 | 敵耐性 | `enemyResist` (ユーザー入力) |
| F19 | 敵ブレイク弱体倍率 | `enemyBreakVuln` (ユーザー入力) |
| I12 | 通常:ダメ基礎値 | `normalDmg` |
| L12 | 異常:ダメ基礎値 | `anomalyDmg` |
| O12 | 透徹:ダメ基礎値 | `penDmg` |

---

## 10. 検証

### 10.1 Excel との突合テスト

Excel テンプレの初期値（zzz_calc_logic_report.md §4）を入力し、同一の出力を得られることを確認する。

| 項目 | Excel 値 | ツール出力 | 許容誤差 |
|---|---|---|---|
| 戦闘時ATK | 4914.73 | - | ±1 |
| 会心率 | 0.808 | - | ±0.001 |
| 会心ダメ | 3.248 | - | ±0.001 |
| 通常:ダメ基礎値 | 67847.3 | - | ±10 |
| 異常:ダメ基礎値 | 34818.6 | - | ±10 |
| 透徹:ダメ基礎値 | 56531.2 | - | ±10 |

---

## 付録 A: ATK 計算式の詳細分解

```
戦闘時ATK
= (基礎ATK × (1 + atk_pct_base合計) + ATK_flat加算[ディスクサブ等] + W-EngineATK)
  × (1 + atk_pct_bonus合計)
  + ATK_flat加算[バフ]

ここで:
  atk_pct_base合計 = ディスクメインATK% + ディスクサブATK%×N + セット効果のbase%
  atk_pct_bonus合計 = セット効果/バフの bonus%
  ATK_flat加算[バフ] = キャラスキル等の戦闘時ATK加算 (例: 千夏core +1050)
```

## 付録 B: 透徹ダメージの変換効率

透徹力は ATK と HP から変換される。変換効率はキャラクター固有値。

```typescript
type PenetrationConfig = {
  atkToPenRatio: number;   // デフォルト: 0.3
  hpToPenRatio: number;    // デフォルト: 0.1
};
```

> 現行の effect-tool ではこの値は未管理。キャラクターデータに追加するか、最適化UI で直接入力する。
