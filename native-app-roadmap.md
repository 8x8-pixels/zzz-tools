# ネイティブアプリ化 ロードマップ & 実装骸子

## 方針

**Tauri v2 + PyInstaller サイドカー方式**

- Svelte/TS の既存UIはそのまま流用
- OCR（Python）は PyInstaller で exe 化してサイドカーとしてバンドル
- ファイルI/O・ウィンドウ間通信は Tauri API に移行
- 最終成果物：Windows 用インストーラ（`.msi` / `.exe`）1つ

---

## フェーズ概要

```
Phase 1  Tauriシェル構築 & 3ツール統合         2〜3日
Phase 2  ファイルI/O の Tauri API 移行          1〜2日
Phase 3  Python OCR のサイドカー化              2〜3日
Phase 4  OCR キャプチャUI の統合                1〜2日
Phase 5  パッケージング & インストーラ           1〜2日
─────────────────────────────────────────────
合計                                            7〜12日
```

---

## Phase 1 — Tauri シェル構築 & 3ツール統合

### ゴール
- `zzz-optimizer` と `zzz-effect-tool` を1つの Tauri アプリ内の「ページ」として統合
- タブ or サイドバーで切り替えられる UI 構造を作る

### ディレクトリ構成（目標）

```
zzz-app/
├── src-tauri/               ← Tauri (Rust) バックエンド
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       └── commands/
│           ├── disc_io.rs   ← JSON 読み書き
│           └── ocr.rs       ← Python サイドカー呼び出し
├── src/                     ← Svelte フロントエンド（統合版）
│   ├── App.svelte           ← タブナビゲーション
│   ├── main.ts
│   ├── pages/
│   │   ├── OptimizerPage.svelte     ← zzz-optimizer から移植
│   │   ├── EffectEditorPage.svelte  ← zzz-effect-tool から移植
│   │   └── OcrPage.svelte           ← zzz-disc-db の新UI
│   └── lib/
│       ├── calc/            ← zzz-optimizer/src/lib/calc をそのままコピー
│       └── tauri.ts         ← Tauri invoke ラッパー
├── sidecar/
│   └── disc_capture/        ← PyInstaller でビルドした exe を配置
├── package.json
└── vite.config.ts
```

### 手順

```bash
# 1. Tauri CLI インストール
npm install -D @tauri-apps/cli @tauri-apps/api

# 2. Tauri 初期化（既存 Svelte プロジェクトに追加する形）
npx tauri init

# 3. tauri.conf.json の基本設定
#    - identifier: "dev.zzz-tools"
#    - productName: "ZZZ Tools"
#    - bundle > active: true
```

**`tauri.conf.json` の要点:**

```jsonc
{
  "app": {
    "windows": [
      {
        "title": "ZZZ Tools",
        "width": 1400,
        "height": 900,
        "resizable": true
      }
    ]
  },
  "bundle": {
    "identifier": "dev.zzz-tools",
    "active": true,
    "targets": ["msi", "nsis"],
    "resources": ["sidecar/*"]   // サイドカー exe を同梱
  },
  "plugins": {
    "shell": {
      "open": true,
      "sidecar": true            // サイドカー実行を許可
    },
    "fs": {
      "all": true,
      "scope": ["$APPDATA/zzz-tools/**", "$DOCUMENT/**"]
    }
  }
}
```

**`App.svelte` のタブ構造（骸子）:**

```svelte
<script lang="ts">
  import OptimizerPage from './pages/OptimizerPage.svelte';
  import EffectEditorPage from './pages/EffectEditorPage.svelte';
  import OcrPage from './pages/OcrPage.svelte';

  type Tab = 'optimizer' | 'effect-editor' | 'ocr';
  let activeTab: Tab = 'optimizer';
</script>

<nav class="tab-bar">
  <button class:active={activeTab === 'optimizer'}    on:click={() => activeTab = 'optimizer'}>
    Optimizer
  </button>
  <button class:active={activeTab === 'effect-editor'} on:click={() => activeTab = 'effect-editor'}>
    Effect Editor
  </button>
  <button class:active={activeTab === 'ocr'}           on:click={() => activeTab = 'ocr'}>
    Disc OCR
  </button>
</nav>

<main>
  {#if activeTab === 'optimizer'}    <OptimizerPage />
  {:else if activeTab === 'effect-editor'} <EffectEditorPage />
  {:else} <OcrPage />
  {/if}
</main>
```

---

## Phase 2 — ファイルI/O の Tauri API 移行

### ゴール
- ブラウザ向けの `<input type="file">` ダウンロードを、ネイティブのファイルダイアログ・直接書き込みに変更

### 変更対象

| 現状 | 移行後 |
|---|---|
| `<input type="file" multiple>` でJSON読み込み | `dialog.open()` でネイティブファイル選択 |
| `<a download>` でJSONエクスポート | `fs.writeTextFile()` で直接保存 |
| `data/discs/` をバンドルリソースとして読む | `fs.readTextFile()` でアプリデータから読む |

### Tauri ラッパー (`src/lib/tauri.ts` の骸子)

```typescript
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

/** JSON ファイルを選択して読み込む */
export async function openJsonFile(): Promise<{ name: string; content: string } | null> {
  const path = await open({
    filters: [{ name: 'JSON', extensions: ['json'] }],
    multiple: false,
  });
  if (!path || typeof path !== 'string') return null;
  const content = await readTextFile(path);
  const name = path.split(/[/\\]/).pop() ?? path;
  return { name, content };
}

/** JSON ファイルを保存する */
export async function saveJsonFile(defaultName: string, content: string): Promise<void> {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!path) return;
  await writeTextFile(path, content);
}

/** discs ディレクトリ内の全JSONを読み込む */
export async function loadDiscsDir(dir: string): Promise<string[]> {
  const { readDir } = await import('@tauri-apps/plugin-fs');
  const entries = await readDir(dir);
  const jsons: string[] = [];
  for (const e of entries) {
    if (e.name?.endsWith('.json')) {
      jsons.push(await readTextFile(`${dir}/${e.name}`));
    }
  }
  return jsons;
}
```

---

## Phase 3 — Python OCR のサイドカー化

### ゴール
- `disc_capture_v2.py` を PyInstaller で単一 exe にビルド
- Tauri のサイドカー機能で起動・停止・stdout受信

### PyInstaller ビルド

```bash
cd zzz-disc-db
pip install pyinstaller

# --onefile: 単一exeに固める
# --noconsole: コンソールウィンドウを非表示（UI側で制御）
pyinstaller disc_capture_v2.py --onefile --noconsole --name disc_capture
```

出力: `dist/disc_capture.exe` → `zzz-app/sidecar/disc_capture-x86_64-pc-windows-msvc.exe` にリネームして配置

> Tauri のサイドカーはプラットフォームサフィックスが必要:
> `{name}-{target_triple}.exe`

### Python 側: stdout を JSON ストリームに変更

`disc_capture_v2.py` の出力部分を以下のように変更し、検出のたびに1行JSONを stdout に出力する:

```python
import json, sys

def emit_disc(disc: dict):
    """1枚検出したら JSON を 1行 stdout に流す"""
    print(json.dumps(disc, ensure_ascii=False), flush=True)

# 既存の保存処理を emit_disc() に置き換える
```

### Rust コマンド (`src-tauri/src/commands/ocr.rs` の骸子)

```rust
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn start_ocr(app: tauri::AppHandle) -> Result<(), String> {
    let sidecar = app
        .shell()
        .sidecar("disc_capture")
        .map_err(|e| e.to_string())?
        .args(["--monitor", "--stdout"]);

    let (mut rx, _child) = sidecar.spawn().map_err(|e| e.to_string())?;

    // stdout を受信してフロントエンドにイベント送信
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let tauri_plugin_shell::process::CommandEvent::Stdout(line) = event {
                let line_str = String::from_utf8_lossy(&line);
                let _ = app.emit("disc-captured", line_str.trim().to_string());
            }
        }
    });

    Ok(())
}
```

### Svelte OCR ページ (`src/pages/OcrPage.svelte` の骸子)

```svelte
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { onMount, onDestroy } from 'svelte';

  let running = false;
  let captured: any[] = [];
  let unlisten: () => void;

  onMount(async () => {
    unlisten = await listen<string>('disc-captured', (event) => {
      try {
        const disc = JSON.parse(event.payload);
        captured = [...captured, disc];
      } catch { /* パース失敗は無視 */ }
    });
  });

  onDestroy(() => unlisten?.());

  async function startOcr() {
    running = true;
    await invoke('start_ocr');
  }

  async function stopOcr() {
    running = false;
    await invoke('stop_ocr');
  }

  async function exportDiscs() {
    // Phase 2 の saveJsonFile() を使って保存
    const { saveJsonFile } = await import('../lib/tauri');
    await saveJsonFile('discs.json', JSON.stringify(captured, null, 2));
  }
</script>

<div class="ocr-page">
  <h2>Disc OCR キャプチャ</h2>
  <p class="note">ゲームの言語設定を英語にしてから開始してください</p>

  <div class="controls">
    <button on:click={startOcr} disabled={running}>▶ 開始</button>
    <button on:click={stopOcr}  disabled={!running}>■ 停止</button>
    <button on:click={exportDiscs} disabled={captured.length === 0}>
      💾 保存 ({captured.length} 枚)
    </button>
  </div>

  <div class="disc-list">
    {#each captured as disc}
      <div class="disc-card">
        <span class="slot">Slot {disc.slot}</span>
        <span class="name">{disc.name}</span>
        <span class="main">{disc.main_stat.stat_key}: {disc.main_stat.value}</span>
      </div>
    {/each}
  </div>
</div>
```

---

## Phase 4 — OCRキャプチャUI の統合強化

- [ ] キャプチャ対象ウィンドウの選択（`tauri-plugin-fs` + Win32 API）
- [ ] 検出済みディスクの重複チェック・削除UI
- [ ] キャプチャ中のプレビュー表示（既存の `debug_frames/` に相当）
- [ ] 保存先を Optimizer の data/discs/ と連携（アプリ内パス共有）

---

## Phase 5 — パッケージング & インストーラ

```bash
# リリースビルド
npm run tauri build

# 出力先
# src-tauri/target/release/bundle/msi/ZZZ Tools_x.x.x_x64_en-US.msi
# src-tauri/target/release/bundle/nsis/ZZZ Tools_x.x.x_x64-setup.exe
```

### tauri.conf.json のインストーラ設定

```jsonc
{
  "bundle": {
    "windows": {
      "nsis": {
        "installMode": "currentUser"   // 管理者権限不要
      }
    },
    "icon": ["icons/icon.ico"]
  }
}
```

---

## 依存パッケージ一覧

### npm

```bash
npm install -D @tauri-apps/cli
npm install @tauri-apps/api \
            @tauri-apps/plugin-dialog \
            @tauri-apps/plugin-fs \
            @tauri-apps/plugin-shell
```

### Cargo.toml (src-tauri)

```toml
[dependencies]
tauri           = { version = "2", features = ["devtools"] }
tauri-plugin-shell  = "2"
tauri-plugin-fs     = "2"
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### Python (OCR サイドカー)

```
# zzz-disc-db/requirements.txt に追記不要
# PyInstaller は dev 依存としてローカルインストールのみ
pyinstaller >= 6.0
```

---

## リスク & 注意事項

| リスク | 対策 |
|---|---|
| PyInstaller exe がウイルス検知される | コードサイニング証明書を取得、または除外ルール案内をREADMEに記載 |
| Tesseract を exe に同梱するとサイズ増大 (～100MB) | Tesseract を別途インストール扱いにしてパスを設定UIで指定させる |
| スクリーンキャプチャ権限 (Windows) | `mss` は管理者権限不要だが、一部環境でDPI設定の影響あり。既存の注意事項を継続 |
| Tauri v2 は Rust ビルド環境が必要 | `rustup` + Visual Studio Build Tools のセットアップが初回必須 |
