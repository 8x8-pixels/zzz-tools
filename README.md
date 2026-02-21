# zzz-tools

ゼンレスゾーンゼロ（ZZZ）向けのツール群です。  
ディスクデータの収集・エフェクト定義の作成・ダメージ最適化を、3つのツールで分担しています。

```
zzz-tools/
├── zzz-disc-db/        ← OCRでゲーム画面からディスクをJSONに変換
├── zzz-effect-tool/    ← ダメージ計算に使う各要素のJSONを作成するGUIツール
└── zzz-optimizer/      ← ダメージ計算 & ディスク組み合わせの最適化
```

---

## ツール概要

### 1. zzz-disc-db

ゲーム画面をリアルタイムでキャプチャし、OCR（Tesseract）でディスクのステータスを読み取り、JSON ファイルとして保存するツールです。

**技術スタック:** Python / OpenCV / pytesseract / mss

**主な機能:**
- ゲーム画面を常時監視し、ディスク詳細パネルを自動検出
- OCR でメインステ・サブステを認識してJSONに出力
- `zzz-optimizer` の `data/discs/` にそのまま配置可能なフォーマットで出力

**セットアップ:**

```bash
cd zzz-disc-db
pip install -r requirements.txt
```

> Tesseract OCR のインストールも別途必要です。

**実行:**

```bash
# リアルタイムモニタリング
python disc_capture_v2.py --monitor

# 出力先を指定する場合
python disc_capture_v2.py --monitor --out result_live

# 終了: Ctrl+C
```

**出力ファイル:**

```
result_live/
└── discs.json    ← zzz-optimizer の data/discs/ にコピーして使用
```

> 出力ファイル名は常に `discs.json` です。`data/discs/` 内の既存ファイルと名前が被らなければ任意の名前にリネームして配置できます。  
> ファイル識別はファイル名ではなく JSON 内の `name` フィールドで行われます。
---

### 2. zzz-effect-tool

ダメージ計算で使用するキャラクター・音動機・ディスクセット効果の **Effect 定義 JSON** を Web UI で作成・編集・エクスポートするツールです。  

**技術スタック:** Svelte / TypeScript / Vite

**主な機能:**
- キャラクター / 音動機 / ディスクセットのバフ・デバフを GUI で編集
- ON/OFF・稼働率（uptime）・対象（mainDps / team / enemy）を設定
- 作成した Effect を JSON としてエクスポート
- 既存 JSON のインポートと差分更新
- 必須項目・値域・ID重複のバリデーション

**セットアップ & 起動:**

```bash
cd zzz-effect-tool/effect-json-builder
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。（ポートは適宜確認してください）

**エクスポートについて:**

Export はブラウザのダウンロードとして保存されます（ファイルシステムへの直接書き込みは不可）。  
ダウンロードしたファイルを `zzz-optimizer/data/` の対応ファイルに手動でコピーしてください。

| エクスポート対象 | コピー先 |
|---|---|
| キャラクター | `zzz-optimizer/data/characters.json` |
| 音動機 | `zzz-optimizer/data/wengines.json` |
| ディスクセット効果 | `zzz-optimizer/data/disc_sets.json` |
| 追加エフェクト | `zzz-optimizer/data/effect_library.json` |

**新しいキャラ・音動機を追加するときの流れ:**

1. 既存の JSON を Import して読み込む
2. GUI で追加・編集する
3. Export（ダウンロード）する
4. ダウンロードしたファイルを `zzz-optimizer/data/` にコピーする

---

### 3. zzz-optimizer

所持ディスクの中から、選択したキャラクター・音動機・ディスクセット構成において **最大ダメージを出すディスク6枚の組み合わせ** を自動で算出するツールです。

**技術スタック:** Svelte / TypeScript / Vite

**主な機能:**
- キャラクター・音動機・ディスクセットを選択してダメージ計算
- 全組み合わせを探索して最適なディスクセットを提示
- `data/discs/` に OCR 出力 JSON を置くだけで自動読み込み

**セットアップ & 起動:**

```bash
cd zzz-optimizer
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。（ポートは適宜確認してください）

**ディスクファイルの追加:**

`data/discs/` に OCR JSON を置くだけで自動的に読み込まれます。コードの変更は不要です。

```
data/discs/
└── my_new_set.json   ← ここに追加するだけ
```

---

## 典型的なワークフロー

```
1. zzz-disc-db
   ゲームを起動し disc_capture_v2.py を実行
   → ディスクを1枚ずつ確認しながら自動キャプチャ
   → result_live/discs.json が生成される
   → 必要に応じてリネームし、zzz-optimizer/data/discs/ にコピー
     （ファイル名の重複がなければOK。ディスク識別はJSON内のnameフィールドで行われる）

2. zzz-effect-tool（必要に応じて）
   新キャラ・新音動機追加時:
   既存 JSON を Import → GUI で編集 → Export（ダウンロード）
   → ダウンロードしたファイルを zzz-optimizer/data/ にコピー

3. zzz-optimizer
   キャラ / 音動機 / ディスクセット構成を選択
   → 最適なディスク6枚の組み合わせを確認
```
