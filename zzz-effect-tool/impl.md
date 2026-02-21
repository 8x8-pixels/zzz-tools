Implementation Plan
17 minutes ago

Review
Submit comment
Add a message...
Submit
Select text in the artifact to add a comment
Effect JSON Builder — 実装計画
仕様書 
effect_json_builder_spec.md
 に基づき、Svelte 5 + TypeScript + Vite で SPA を構築する。

Proposed Changes
プロジェクトセットアップ
[NEW] effect-json-builder/ (Vite プロジェクト)
c:\home\zzz-effect-tool\effect-json-builder\ に create-vite で Svelte + TS プロジェクトを作成。

型・ユーティリティ層
[NEW] 
types.ts
StatKey, Element, Target, ConditionMode のユニオン型
Mod, Condition, Effect, CharacterDef, WEngineDef, DiscSetDef, AppState 型
各 enum の配列定数（セレクトボックス用）
[NEW] 
slug.ts
toSlug(label) — ラベルを小文字英数＋_に変換
[NEW] 
validate.ts
validateEffect(e) — 必須項目・value 範囲・element 必須チェック
validateUniqueIds(effects) — ID 重複検知
エラーは { field, message }[] 形式で返す
[NEW] 
io.ts
importJson(file) — File → JSON パース + version 確認 + デフォルト補完
exportJson(data, filename) — Blob → DL
[NEW] 
store.ts
Svelte $state ベースの AppState ストア
localStorage 自動保存 / 起動時復元
Effect CRUD / DiscSet CRUD / Character CRUD / WEngine CRUD
コンポーネント
[NEW] 
EffectEditor.svelte
Effect 編集フォーム（id/label/target/enabledByDefault/condition/mods/notes/tags）
id は label から自動 slug 生成 + 手動編集可
condition.mode が uptime のとき uptime スライダー表示
element_dmg_bonus 選択時に element セレクト表示
[NEW] 
ModListEditor.svelte
mods[] の追加・削除・並べ替え
key セレクト / value 数値入力(%表示＋内部0..1変換)
[NEW] 
JsonPreview.svelte
選択中オブジェクトの JSON プレビュー（シンタックスハイライト付き）
[NEW] 
EntityList.svelte
汎用一覧（検索・追加・削除・複製ボタン付き）
画面
[NEW] 
App.svelte
タブナビゲーション: Effect Library / Disc Sets / Characters / W-Engines
Import / Export ボタン（ヘッダー）
各タブの内容を条件レンダリング
[NEW] 
main.ts
エントリポイント。App をマウント。
スタイリング
ダークテーマベースのモダンUI
グラスモーフィズム効果のカード
スムーズなトランジション・マイクロアニメーション
Google Fonts (Inter) 利用
Verification Plan
ブラウザ確認
cd c:\home\zzz-effect-tool\effect-json-builder && npm run dev で起動
ブラウザで以下を確認:
Effect Library タブで Effect を新規作成できる
mods を追加・値入力できる
JSON プレビューにリアルタイム反映される
Export で effect_library.json がDLされる
DLしたファイルを Import して復元される
Disc Sets タブで 2pc/4pc Effect を追加できる
バリデーション（ID 重複、必須項目未入力）が表示される


# Distinct keywords to map back to full names if fuzzy match fails
DISTINCT_KEYWORDS = {
    "White Water Ballad",
    "Astral Voice",
    "Branch & Blade Song",
    "Chaos Jazz",
    "Chaotic Metal",
    "Dawn's Bloom",
    "Fanged Metal",
    "Freedom Blues",
    "Hormone Punk",
    "Inferno Metal",
    "King of the Summit",
    "Moonlight Lullaby",
    "Moonlight Lullaby",
    "Phaethon's Melody",
    "Polar Metal",
    "Proto Punk",
    "Puffer Electro",
    "Shadow Harmony",
    "Shining Aria",
    "Shockstar Disco",
    "Soul Rock",
    "Swing Jazz",
    "Thunder Metal",
    "Woodpecker Electro",
    "Yunkui Tales",
}