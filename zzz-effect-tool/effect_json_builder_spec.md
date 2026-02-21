# Effect JSON Builder（Svelte + TS + Vite）仕様 / 実装ドキュメント

## 0. 目的
ディスク最適化ツール本体に入力するための **Effect 定義 JSON** を、手書きせずにWeb UIで作成・編集・検証・書き出しできるツールを作る。

### 解決したい課題
- キャラ/音動機/ディスクセット効果の「バフ/デバフ」を手でJSON編集するとミスりやすい
- ON/OFF、稼働率（uptime）、対象（mainDps / team / enemy）などの表現が増えてきた
- 効果は増える前提なので、**構造を統一**して増やしやすくする

---

## 1. スコープ

### 1.1 このツールがやること
- **Effect**（共通フォーマット）をGUIで作成・編集・削除
- 1つ以上の Effect をまとめて **JSONとしてエクスポート**
- 既存JSONを **インポートして編集**（差分更新を含む）
- JSONの **バリデーション（必須項目・値域・ID重複）**
- 4セット効果など条件付きのための **toggle/uptime** 入力
- `mods[]`（複数ステ加算）の編集

### 1.2 このツールがやらないこと（Non-goals）
- ダメージ計算・最適化の実行
- OCRディスクJSONの生成・編集（別ツール）
- 画像/スクショ管理

---

## 2. データモデル（共通）

> 重要：**キャラ/音動機/ディスクセット**すべての効果を同一の `Effect` 型で表現する。  
> これにより、ツール側は「Effectを編集する」だけでよくなる。

### 2.1 Enum/Key

```ts
// ダメ計側が理解する内部キー
export type StatKey =
  | "atk_flat" | "atk_pct"
  | "hp_flat"  | "hp_pct"
  | "crit_rate" | "crit_dmg"
  | "dmg_bonus"
  | "pen_rate" | "pen_flat"
  | "def_down" | "res_down"
  | "anomaly_mastery" | "anomaly_proficiency"
  | "break_vuln"
  | "element_dmg_bonus"; // 属性ダメ（内部ではelement付き）

export type Element = "ice" | "fire" | "electric" | "physical" | "ether";

// 効果の対象
export type Target = "mainDps" | "team" | "enemy";

// 条件の表現（最小）
export type ConditionMode = "toggle" | "uptime";
```

### 2.2 Mod / Effect

```ts
export type Mod = {
  key: StatKey;
  op: "add";          // 現状 add のみで十分（将来 mul/override も可）
  value: number;      // %は 0.30 のように 0..1 表現（UI入力は30→0.30に変換してもOK）
  element?: Element;  // key==="element_dmg_bonus" の時のみ
};

export type Condition = {
  mode: ConditionMode;
  defaultUptime?: number; // mode==="uptime" のとき 0..1
};

export type Effect = {
  id: string;              // 一意。slug推奨
  label: string;           // UI表示名
  target: Target;
  enabledByDefault?: boolean;

  // 条件つき（4セット/条件パッシブなど）
  condition?: Condition;

  mods: Mod[];             // ステ加算の配列
  notes?: string;          // メモ（任意）
  tags?: string[];         // 検索用（任意）
};
```

---

## 3. エクスポートJSON（用途別）

ツールは最初に **Effectライブラリ** として保存できるようにし、そこから用途別（キャラ/音動機/ディスクセット）へ“箱詰め”する。

### 3.1 Effect Library（最小）
```json
{
  "version": 1,
  "effects": [ /* Effect[] */ ]
}
```

### 3.2 Characters（推奨構造）
> 「最適化対象はメインDPSのみ」だが、編成バフとして support の効果も必要。  
> そのためキャラは **「効果の集合」**として保持する。

```ts
export type CharacterDef = {
  id: string;
  name: string;
  element: Element;

  // 常時/条件付き/トグルを含む効果
  effects: Effect[];

  // 凸（Mindscape）ごとの追加効果（最大値固定でよい）
  mindscape?: Record<number /*level*/, Effect[]>;
};
```

出力JSON例：
```json
{
  "version": 1,
  "characters": [
    {
      "id": "ellen",
      "name": "Ellen",
      "element": "ice",
      "effects": [ /* Effect[] */ ],
      "mindscape": {
        "1": [ /* Effect[] */ ],
        "2": [ /* Effect[] */ ]
      }
    }
  ]
}
```

### 3.3 W-Engine（音動機）
```ts
export type WEngineDef = {
  id: string;
  name: string;
  effects: Effect[];
};
```

### 3.4 Disc Sets（2pc/4pc）
> 2pcは自動適用、4pcは編成単位でON/OFF（またはuptime）前提。  
> セット効果定義はここに持ち、編成側は「どの4pcを有効にするか」だけ保持する。

```ts
export type DiscSetDef = {
  setId: string;     // OCR JSONのnameと一致推奨
  name: string;
  effects2pc: Effect[]; // targetはmainDps/team/enemy どれでもOK
  effects4pc: Effect[]; // conditionはtoggle/uptimeを使う
};
```

出力JSON例：
```json
{
  "version": 1,
  "discSets": [
    {
      "setId": "White Water Ballad",
      "name": "White Water Ballad",
      "effects2pc": [ /* Effect[] */ ],
      "effects4pc": [ /* Effect[] */ ]
    }
  ]
}
```

---

## 4. UI要件

### 4.1 画面構成（SPA）
- **Home**
  - プロジェクトの新規作成 / 既存JSONのインポート
  - エクスポート（まとめてDL）
- **Effect Library**
  - Effect一覧（検索・タグ・targetフィルタ）
  - 追加/複製/削除
  - Effect編集（右ペイン or モーダル）
  - JSONプレビュー（即時反映）
- **Characters**
  - キャラ一覧
  - キャラ詳細：基本情報（id/name/element）
  - effect追加（ライブラリから追加 or 新規作成）
  - mindscapeレベルごとのEffect追加
- **W-Engines**
  - 音動機一覧/編集（Characterと同様）
- **Disc Sets**
  - セット一覧/編集
  - 2pc/4pc別にEffectを追加

> 最初は **Effect Library + Disc Sets** だけ実装してもOK。  
> Characters/W-Enginesは後から同パターンで増やせる。

### 4.2 Effect編集フォーム（必須項目）
- `id`：自動生成（labelからslug生成）＋手編集可
- `label`
- `target`（mainDps/team/enemy）
- `enabledByDefault`（checkbox）
- `condition`（optional）
  - mode：toggle / uptime
  - uptime：0..100%（内部0..1）
- `mods[]`
  - key（select）
  - value（number、%ならUIで%入力→内部0..1）
  - element（keyがelement_dmg_bonusのときのみ表示）
  - 追加/削除/並べ替え

### 4.3 便利機能（優先度順）
- 重複ID検知（保存時/入力時）
- “複製して作成”
- タグ付け（検索が楽になる）
- JSONの差分表示（任意）
- localStorage自動保存（クラッシュ耐性）

---

## 5. バリデーション仕様

### 5.1 Effect単体
- `id`：必須、英数字＋`_` `-`推奨（UIで制限）
- `label`：必須
- `target`：必須（enum）
- `mods.length >= 1`：必須
- `mods[].value`：
  - addのvalueは **数値**、NaN不可
  - uptimeは 0..1
- `element_dmg_bonus` のとき `element` 必須

### 5.2 コレクション
- EffectのIDは **同一スコープ内で一意**
  - Effect Library 内
  - CharacterDef 内（effects + mindscape）
  - DiscSetDef 内（2pc/4pc）
- `version` は number

---

## 6. ファイル入出力

### 6.1 インポート
- `effect_library.json`
- `characters.json`
- `wengines.json`
- `disc_sets.json`

読み込み時：
- version確認
- 足りないフィールドはデフォルト補完（enabledByDefault=false 等）
- 不正はエラーパネルに表示（どのID/どのフィールドか）

### 6.2 エクスポート
- 「用途別に分けてDL」
  - `effect_library.json`
  - `characters.json`
  - `wengines.json`
  - `disc_sets.json`
- もしくは「全部まとめて1ファイル」も可能
  - `effects_bundle.json`（後で最適化ツール側で分割して読んでも良い）

---

## 7. 実装（Svelte + TS + Vite）

### 7.1 推奨ディレクトリ
```
effect-json-builder/
  src/
    lib/
      types.ts
      validate.ts
      io.ts
      slug.ts
      store.ts
    components/
      EffectEditor.svelte
      ModListEditor.svelte
      JsonPreview.svelte
      EntityList.svelte
    App.svelte
    main.ts
  public/
  package.json
  vite.config.ts
```

### 7.2 Store設計（例）
```ts
type AppState = {
  version: 1;
  effectLibrary: Effect[];
  characters: CharacterDef[];
  wengines: WEngineDef[];
  discSets: DiscSetDef[];

  // UI状態
  selectedTab: "library" | "characters" | "wengines" | "discSets";
  selectedId?: string;
  dirty: boolean;
};
```

### 7.3 入出力（ブラウザ）
- Import：`<input type="file" accept="application/json">`
- Export：`Blob` + `URL.createObjectURL` でダウンロード
- Auto-save：`localStorage` に `AppState` を保存
  - 起動時に復元
  - Import時は上書き/マージを選べる（最初は上書きのみでOK）

### 7.4 バリデーション
- 依存なしで `validate.ts` に自前実装でOK
- もし楽したいなら `zod` を入れても良い（任意）

---

## 8. UIの最小実装ステップ（おすすめ順）

### Step 1：Effect Libraryだけ作る
- 一覧（検索/追加/削除/複製）
- EffectEditor（mods編集含む）
- JSONプレビュー
- Import/Export（libraryのみ）
- localStorage保存

### Step 2：Disc Setsを追加
- セット一覧
- 2pc/4pcでEffectを紐付け
- Export/Importで `disc_sets.json` を出す

### Step 3：Characters / W-Engines
- 同じパターンで増やす（フォームは使い回し）

---

## 9. 仕様メモ（最適化ツール側との接続点）
- 最適化側は「編成設定」から
  - mainDpsキャラ/音動機/凸
  - supportキャラ/音動機/凸
  - 4pcセットのON/OFF（またはuptime）
  を決める
- このビルダーが出力するJSONは、その参照先になる
- 属性ダメ（element_dmg_bonus）は **メインDPS属性一致時のみ** dmg_bonusに合流する（評価関数側で処理）

---

## 10. 受け入れ基準（Definition of Done）
- EffectをGUIで作成し、`effect_library.json` をDLできる
- DiscSetDefを作成し、`disc_sets.json` をDLできる
- 不正入力（ID重複、uptime範囲外、element不足）をUIで検知できる
- Import→編集→Export が往復で壊れない（最低限）

---

## 11. 付録：サンプルEffect
```json
{
  "id": "support_res_down",
  "label": "耐性ダウン -20%",
  "target": "enemy",
  "enabledByDefault": true,
  "mods": [
    { "key": "res_down", "op": "add", "value": 0.20 }
  ],
  "notes": "サポ由来。常時最大値固定。"
}
```

```json
{
  "id": "disc4pc_team_dmg",
  "label": "4セット：チーム与ダメ+15%",
  "target": "team",
  "enabledByDefault": false,
  "condition": { "mode": "toggle" },
  "mods": [
    { "key": "dmg_bonus", "op": "add", "value": 0.15 }
  ]
}
```

```json
{
  "id": "ice_dmg_bonus",
  "label": "氷属性与ダメ +30%",
  "target": "mainDps",
  "enabledByDefault": true,
  "mods": [
    { "key": "element_dmg_bonus", "op": "add", "value": 0.30, "element": "ice" }
  ]
}
```
