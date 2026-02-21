# OCR → Effect-Tool Stat Key マッピング

OCR ツールが出力する `name` フィールドを、effect-tool の `StatKey` に変換するためのリファレンス。

---

## サブステータス (sub_stats)

OCR の `name` は **フラット値とパーセント値を名前で区別** している。

| OCR `name` | 値の例 | effect-tool `StatKey` | 備考 |
|---|---|---|---|
| `"ATK"` | `"38"`, `"76"` | `atk_flat` | フラット値 |
| `"ATK%"` | `"3%"`, `"9%"` | `atk_pct_base` | ディスクのATK%は基礎ATKに乗算 |
| `"HP"` | `"112"`, `"336"` | `hp_flat` | フラット値 |
| `"HP%"` | `"3%"`, `"9%"` | `hp_pct_base` | ディスクのHP%は基礎HPに乗算 |
| `"DEF"` | `"30"` | `def_flat` | フラット値 |
| `"DEF%"` | `"4.8%"`, `"9.6%"` | `def_pct` | |
| `"CRIT Rate"` | `"2.4%"`, `"7.2%"` | `crit_rate` | |
| `"CRIT DMG"` | `"4.8%"`, `"19.2%"` | `crit_dmg` | |
| `"PEN"` | `"9"`, `"27"`, `"36"` | `pen_flat` | フラット値 |
| `"Anomaly Proficiency"` | `"9"`, `"18"`, `"27"` | `anomaly_proficiency` | フラット値 |

---

## メインステータス (main_stat)

OCR の `main_stat.name` は **フラットもパーセントも同じ名前** を使い、値の形式で判別する必要がある。

| OCR `name` | 値の例 | effect-tool `StatKey` | 判別方法 |
|---|---|---|---|
| `"HP"` | `"2,200"` | `hp_flat` | スロット1固定、フラット値 |
| `"ATK"` | `"316"` | `atk_flat` | スロット2固定、フラット値 |
| `"ATK"` | `"30%"` | `atk_pct_base` | 値に `%` を含む |
| `"DEF"` | `"184"` | `def_flat` | スロット3固定、フラット値 |
| `"CRIT Rate"` | `"24%"` | `crit_rate` | |
| `"CRIT DMG"` | `"48%"` | `crit_dmg` | |
| `"PEN Ratio"` | `"24%"` | `pen_rate` | |
| `"Impact"` | `"18%"` | `impact` | スロット6 |
| `"Anomaly Mastery"` | `"30%"` | `anomaly_mastery` | スロット6 |
| `"Anomaly Proficiency"` | `"92"` | `anomaly_proficiency` | スロット4、フラット値 |
| `"Energy Regen"` | `"20%"` | `energy_regen` | スロット6 |
| `"Physical DMG Bonus"` | `"30%"` | `element_dmg_bonus` | element = `physical` |
| `"Fire DMG Bonus"` | `"30%"` | `element_dmg_bonus` | element = `fire` |
| `"Ice DMG Bonus"` | `"30%"` | `element_dmg_bonus` | element = `ice` |
| `"Electric DMG Bonus"` | `"30%"` | `element_dmg_bonus` | element = `electric` |
| `"Ether DMG Bonus"` | `"30%"` | `element_dmg_bonus` | element = `ether` |

---

## メインステータスの判別ロジック

`main_stat.name` が `"ATK"` の場合、フラット or パーセントの区別は **値の末尾** で行う：

```
if value.endsWith("%"):
    stat_key = "atk_pct_base"
else:
    stat_key = "atk_flat"
```

同様に `"HP"`, `"DEF"` も値の末尾で判別可能だが、現状のゲーム仕様ではメインステータスのHP/DEFは常にフラット値（スロット1/3固定）。スロット5に `HP%` `DEF%` が存在するがその場合 OCR name にも `%` が含まれるか確認が必要。

---

## 値の変換ルール

OCR 出力の `value` 文字列を数値に変換する際：

| パターン | 例 | 変換 |
|---|---|---|
| カンマ区切り整数 | `"2,200"` | カンマ除去 → `2200` |
| パーセント | `"30%"` | `%` 除去 → `30` (小数として扱う場合は `0.30`) |
| 小数パーセント | `"2.4%"` | `%` 除去 → `2.4` (小数として `0.024`) |
| 整数 | `"38"` | そのまま → `38` |

> **注意**: effect-tool 内部ではパーセント値を **小数 (0–1)** として保持する（例: 30% → `0.30`）。
> OCR 出力は **表示値** (例: `"30%"`) なので `÷ 100` の変換が必要。

---

## OCR 修正時の推奨変更

OCR ツール側で以下の変更を行うと、effect-tool との連携がスムーズになる：

### 1. `name` → `stat_key` への置換

出力 JSON の `name` フィールドを effect-tool 互換の `stat_key` に変換する、または `stat_key` フィールドを追加する。

```jsonc
// 変更前 (現在の OCR 出力)
{ "name": "ATK%", "value": "9%" }

// 変更後 案A: name を stat_key に置換
{ "stat_key": "atk_pct_base", "value": 0.09 }

// 変更後 案B: stat_key を追加 (name は残す)
{ "name": "ATK%", "stat_key": "atk_pct_base", "value": "9%", "value_num": 0.09 }
```

### 2. 値の数値化

`value` フィールドを文字列から数値に変換する。パーセント値は `÷ 100` して小数化。

```jsonc
// 変更前
{ "name": "CRIT Rate", "value": "2.4%" }

// 変更後
{ "stat_key": "crit_rate", "value": 0.024 }
```

### 3. メインステータスのフラット/パーセント判別

メインステータスの `"ATK"` は値に基づいて `atk_flat` / `atk_pct_bonus` を自動判別する。

```python
# Python 変換例
def ocr_name_to_stat_key(name: str, value: str, is_main: bool = False) -> str:
    MAPPING = {
        # サブステータス用 (名前で一意に決まる)
        "ATK":                  "atk_flat",
        "ATK%":                 "atk_pct_base",
        "HP":                   "hp_flat",
        "HP%":                  "hp_pct_base",
        "DEF":                  "def_flat",
        "DEF%":                 "def_pct",
        "CRIT Rate":            "crit_rate",
        "CRIT DMG":             "crit_dmg",
        "PEN":                  "pen_flat",
        "PEN Ratio":            "pen_rate",
        "Impact":               "impact",
        "Anomaly Mastery":      "anomaly_mastery",
        "Anomaly Proficiency":  "anomaly_proficiency",
        "Energy Regen":         "energy_regen",
        "Physical DMG Bonus":   "element_dmg_bonus",
        "Fire DMG Bonus":       "element_dmg_bonus",
        "Ice DMG Bonus":        "element_dmg_bonus",
        "Electric DMG Bonus":   "element_dmg_bonus",
        "Ether DMG Bonus":      "element_dmg_bonus",
    }

    # メインステータスで "ATK" かつ値が % → atk_pct_base
    if is_main and name == "ATK" and value.endswith("%"):
        return "atk_pct_base"

    return MAPPING.get(name, name)


def parse_value(value: str) -> float:
    """OCR の value 文字列を数値に変換"""
    clean = value.replace(",", "").strip()
    if clean.endswith("%"):
        return float(clean[:-1]) / 100
    return float(clean)


# 属性抽出 (element_dmg_bonus の場合)
def extract_element(name: str) -> str | None:
    ELEMENT_MAP = {
        "Physical DMG Bonus": "physical",
        "Fire DMG Bonus":     "fire",
        "Ice DMG Bonus":      "ice",
        "Electric DMG Bonus": "electric",
        "Ether DMG Bonus":    "ether",
    }
    return ELEMENT_MAP.get(name)
```

---

## effect-tool の全 StatKey 一覧 (参考)

| StatKey | 表示名 | パーセント値 |
|---|---|---|
| `atk_flat` | ATK (flat) | No |
| `atk_pct_base` | ATK % (base) | Yes |
| `atk_pct_bonus` | ATK % (bonus) | Yes |
| `hp_flat` | HP (flat) | No |
| `hp_pct_base` | HP % (base) | Yes |
| `hp_pct_bonus` | HP % (bonus) | Yes |
| `def_flat` | DEF (flat) | No |
| `def_pct` | DEF % | Yes |
| `crit_rate` | Crit Rate | Yes |
| `crit_dmg` | Crit DMG | Yes |
| `dmg_bonus` | DMG Bonus | Yes |
| `pen_rate` | PEN Rate | Yes |
| `pen_flat` | PEN (flat) | No |
| `impact` | Impact | No |
| `energy_regen` | Energy Regen | Yes |
| `adrenaline_regen` | Adrenaline Regen | Yes |
| `def_down` | DEF Down | Yes |
| `res_down` | RES Down | Yes |
| `anomaly_mastery` | Anomaly Mastery | No |
| `anomaly_proficiency` | Anomaly Proficiency | No |
| `break_vuln` | Break Vuln | Yes |
| `element_dmg_bonus` | Element DMG Bonus | Yes |

> **`atk_pct_base` vs `atk_pct_bonus`**: base はキャラ基礎ATKに対する乗算、bonus は装備込みATKへの加算。  
> ディスクのメイン/サブステータスの ATK% は全て **`atk_pct_base`** にマッピングする。  
> `atk_pct_bonus` はセット効果やW-Engineパッシブ等の特殊バフで使用される。HP% も同様。
