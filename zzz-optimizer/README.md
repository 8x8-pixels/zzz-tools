# ZZZ ディスク最適化ツール

所持ディスクの中から、選択したキャラクター・音動機・ディスクセット構成において **最大ダメージを出すディスク6枚の組み合わせ** を自動で算出するツールです。

---

## 起動方法

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。

---

## ディレクトリ構成

```
zzz-optimizer/
├── data/                        ← ユーザーが編集・追加するファイル群
│   ├── characters.json          　キャラクター定義
│   ├── wengines.json            　音動機定義
│   ├── disc_sets.json           　ディスクセット効果定義
│   ├── effect_library.json      　追加エフェクト定義
│   └── discs/                   　所持ディスク（OCR出力JSON）
│       ├── white_water_ballad.json
│       └── branch_and_blade_song.json
├── src/                         ← アプリ本体（通常は編集不要）
│   └── lib/calc/
│       ├── types.ts             　型定義
│       ├── buff-pool.ts         　バフ集計エンジン
│       ├── combat-stats.ts      　戦闘ステータス算出
│       ├── damage.ts            　ダメージ基礎値算出
│       └── optimizer.ts         　全探索エンジン
├── context/                     　仕様書・計算ロジック解説
└── README.md
```

---

## ディスクファイルの追加方法

`data/discs/` に OCR JSON を置くだけで自動的に読み込まれます。コードの変更は不要です。

```
data/discs/
└── my_new_set.json   ← ここに追加するだけ
```

### ディスク JSON フォーマット

```json
[
  {
    "name": "セット名",
    "slot": 1,
    "level": 15,
    "rarity": "S",
    "id": 0,
    "main_stat": {
      "stat_key": "hp_flat",
      "value": 2200.0
    },
    "sub_stats": [
      { "stat_key": "crit_rate",    "value": 0.024, "rolls": 0 },
      { "stat_key": "crit_dmg",     "value": 0.048, "rolls": 1 },
      { "stat_key": "atk_pct_base", "value": 0.03,  "rolls": 0 },
      { "stat_key": "pen_flat",     "value": 9,     "rolls": 0 }
    ]
  }
]
```

`name` はそのまま `disc_sets.json` の `setId` と照合されます。

### 使用できる StatKey 一覧

| StatKey | 意味 |
|---|---|
| `hp_flat` / `hp_pct_base` | HP実数 / HP% |
| `atk_flat` / `atk_pct_base` | ATK実数 / 基礎ATK% |
| `atk_pct_bonus` | 戦闘時ATK乗算% |
| `def_flat` / `def_pct` | DEF実数 / DEF% |
| `crit_rate` / `crit_dmg` | 会心率 / 会心ダメ |
| `dmg_bonus` | ダメージボーナス% |
| `element_dmg_bonus` | 属性ダメージ% |
| `pen_rate` / `pen_flat` | 貫通率 / 貫通値 |
| `anomaly_mastery` / `anomaly_proficiency` | 異常マスタリ / 異常掌握 |
| `impact` / `energy_regen` | 衝撃力 / エネルギー回復 |

---

## ダメージ計算式

Excel「ダメ計シミュテンプレ」と突合テスト（8項目全PASS）で検証済み。

### 戦闘時ATK

```
combatAtk = ((baseAtk + wEngineAtk) × (1 + atk_pct_base) + discAtkFlat)
              × (1 + atk_pct_bonus)
              + atk_flat[バフ]
```

- `wEngineAtk`：音動機の基礎ATK（`atk_pct_base` の乗算対象）
- `discAtkFlat`：スロット2メイン ATK_flat + サブ ATK_flat
- `atk_pct_bonus`：戦闘時ATK乗算バフ（ディスクセット4pc等）

### 通常ダメージ基礎値

```
normalDmg = ATK × critCoeff × dmgBonusCoeff × defCoeff × resCoeff × breakCoeff

critCoeff     = 1 + 会心率 × 会心ダメ
dmgBonusCoeff = 1 + dmgBonus
defCoeff      = MIN(794 / (794 + MAX(実効防御, 0)), 1)
resCoeff      = 1 - 敵耐性 + 耐性ダウン
breakCoeff    = 敵ブレイク弱体倍率 + ブレイク弱体バフ
```

### 異常ダメージ基礎値

```
anomalyDmg = ATK × (異常マスタリ / 100) × (1 + (Lv-1)/59)
               × dmgBonusCoeff × defCoeff × resCoeff × breakCoeff
```

- 会心なし
- Lv60で係数×2

### 透徹ダメージ基礎値

```
透徹力     = ATK × atkToPenRatio + HP × hpToPenRatio
penDmg     = 透徹力 × critCoeff × dmgBonusCoeff × resCoeff × breakCoeff
```

- **防御力を100%無視**（defCoeff = 1 固定）

---

## データファイルの編集

### キャラクターを追加する（characters.json）

```jsonc
{
  "characters": [
    {
      "id": "char_id",
      "name": "キャラ名",
      "element": "fire",       // fire / ice / electric / physical / ether / chaos
      "level": 60,
      "baseStats": {
        "atk": 1642,           // W-Engine を含まない基礎ATK
        "hp": 7673,
        "def": 500,
        "critRate": 0.05,
        "critDmg": 0.50,
        "anomalyMastery": 93,
        "anomalyProficiency": 94
      },
      "effects": [],
      "mindscape": {}
    }
  ]
}
```

> `baseStats.atk` は W-Engine を**含まない**キャラ固有の基礎ATKです。

### 音動機を追加する（wengines.json）

```jsonc
{
  "wengines": [
    {
      "id": "we_id",
      "name": "音動機名",
      "baseMods": [
        { "key": "atk_flat", "op": "add", "value": 316 }
      ],
      "effects": []
    }
  ]
}
```

`baseMods` の `atk_flat` が W-Engine の基礎ATKです（`baseAtk` と合算して `atk_pct_base` が乗算されます）。

### ディスクセット効果を追加する（disc_sets.json）

```jsonc
{
  "discSets": [
    {
      "setId": "セット名（discs/*.json の name と一致させる）",
      "name": "セット名",
      "effects2pc": [
        {
          "id": "setid_2set",
          "label": "2セット効果",
          "target": "mainDps",
          "enabledByDefault": true,
          "mods": [
            { "key": "atk_pct_base", "op": "add", "value": 0.10 }
          ]
        }
      ],
      "effects4pc": [
        {
          "id": "4set",
          "label": "4セット効果",
          "target": "mainDps",
          "enabledByDefault": false,
          "condition": { "mode": "toggle" },
          "mods": [
            { "key": "atk_pct_bonus", "op": "add", "value": 0.10 }
          ]
        }
      ]
    }
  ]
}
```

**`atk_pct_base` vs `atk_pct_bonus` の使い分け：**

| キー | 意味 | 対応するバフ例 |
|---|---|---|
| `atk_pct_base` | 基礎ATKへの乗算（内側ブラケット） | 2pcの「ATK+10%」 |
| `atk_pct_bonus` | 戦闘時ATKへの乗算（外側ブラケット） | 4pcの「戦闘開幕時ATK+10%」 |

### エフェクトの target について

| target | 効果の適用先 |
|---|---|
| `mainDps` | メインDPSのみ |
| `team` | チーム全員（サポートキャラが持つ場合にメインDPSへ反映） |
| `enemy` | 敵へのデバフ（サポートキャラが持つ場合もメインDPSの計算に反映） |

---

## Excelとの突合テスト

`zzz_calc_logic_report.md` に記載のテンプレ初期値を使った自動テストを実行できます。

```bash
npx tsx src/test/excel-test.ts
```

| 項目 | Excel値 | 許容誤差 |
|---|---|---|
| 戦闘時ATK | 4914.73 | ±1 |
| 戦闘時HP | 9873 | ±1 |
| 会心率 | 0.808 | ±0.001 |
| 会心ダメ | 3.248 | ±0.001 |
| 通常:ダメ基礎値 | 67847.3 | ±10 |
| 異常:ダメ基礎値 | 34818.6 | ±10 |
| 透徹:ダメ基礎値 | 56531.2 | ±10 |
