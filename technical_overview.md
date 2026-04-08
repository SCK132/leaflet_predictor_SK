# Technical Overview / 技術仕様書

## 1. システム概要 (System Overview)
本プロジェクト「Leaflet Predictor (Japanese / JST Enhanced)」は、高高度気球（Radio Sonde）の飛行経路および着地位置を予測するためのWebアプリケーションです。
ブラウザ上で動作する**クライアントサイドJavaScriptアプリケーション**であり、バックエンドの予測API（Tawhiri）と通信して計算を行います。

### 主な特徴
- **Leaflet採用**: マップ表示にオープンソースのLeafletを使用（Google Maps非依存）。
- **JSTネイティブ**: 日本標準時（JST）での入力を前提とした日時処理。
- **ハイブリッド設計**: 13バリアントのバックエンドロジックや打ち上げ拠点設定は安定した旧版 (`Falling-position-simulator2025`) に統一し、UIや可視化機能は新版のものを使用。
- **ハイブリッド海陸判定**: ローカルGeoJSON（即時）+ 外部API（高精度）の2段構え。
- **13バリアント・アンサンブル**: 系統的パラメータ変動による不確実性の可視化。（予測ロジックは旧版準拠）
- **実測ログ比較**: 飛行中に得られたGPSログ（CSV）を地図上に重ね合わせ、予測とのズレを視覚化。
- **高度な可視化**: 高度プロファイル・風速プロファイルグラフの表示、コンベックスハル描画。
- **モバイル対応**: レスポンシブUIによりスマートフォンでも快適に操作可能。
- **PWA対応**: Service Workerによるオフラインキャッシュ、ホーム画面追加対応。

---

## 2. 技術スタック (Technology Stack)

### フロントエンド
| Category | Technology | Usage |
|----------|------------|-------|
| **Core** | HTML5, CSS3, JavaScript | アプリケーション基盤 |
| **Map Library** | **Leaflet** | 地図描画、マーカー・ポリライン表示 |
| **UI Framework** | **jQuery**, jQuery UI | DOM操作、ドラッグ可能なウィンドウ、各種ウィジェット |
| **Date/Time** | **Moment.js** | 日時操作、UTC⇔JST変換 (`moment.utcOffset(9*60)`) |
| **Visualization** | **Chart.js** | 高度・風速プロファイルグラフの描画 |
| **Geospatial** | **Turf.js** | コンベックスハル（凸包）計算 |
| **Utility** | **html2canvas** | マップ画像のキャプチャ・エクスポート |
| **Styling** | Custom CSS, CSS Custom Properties | `css/predictor.css` (デスクトップ, デザイントークン), `css/mobile.css` (モバイル) |
| **Typography** | **Google Fonts (Noto Sans JP)** | 日本語対応のモダンフォント |
| **Layout** | Sidebar + Tabbed UI | サイドバーレイアウト（設定/結果タブ切替、折りたたみ対応） |
| **PWA** | Service Worker, Manifest | オフラインキャッシュ、ホーム画面追加 |

### 外部API (External APIs)
| API Name | Purpose | Usage |
|----------|---------|-------|
| **Tawhiri API** | **[Core]** 飛行経路・着地位置の計算エンジン | SondeHub / Local Docker / Custom |
| **BigDataCloud** | 逆ジオコーディング（海陸判定API、Primary） | `countryCode` + `localityInfo` の海キーワード検索 |
| **Overpass API** | 内陸水域（湖沼・河川）の詳細検出 | 50m圏内の `natural=water` / `waterway` チェック |

### ローカルデータ (Local Data)
| Data | File | Purpose |
|------|------|---------|
| **日本陸地ポリゴン** | `data/land_japan_raw.geojson` | オフライン海陸判定 (Ray-Casting PIP) |
| **打ち上げ場所定義** | `sites.json` | 南レク一帯の打ち上げ候補地座標 |

---

## 3. システムアーキテクチャ (Architecture)

### 3.1 処理フロー（単一予測）
1.  **ユーザー入力**: 打ち上げ場所、日時(JST)、上昇/下降レートなどを入力。
2.  **リクエスト生成** (`pred-new.js` → `runPrediction()`):
    - 入力されたJSTをUTCに変換。
    - パラメータをAPIクエリ形式に整形。
    - 「落下のみモード」選択時は`burst_altitude = launch_altitude` に設定。
3.  **API通信** (`tawhiriRequest()`):
    - 指定されたAPIエンドポイント（SondeHub / Localhost / Custom）へ `jQuery.get` で非同期リクエスト。
    - Docker未起動時の日本語エラーメッセージ表示。
4.  **レスポンス解析** (`processTawhiriResults()` → `parsePrediction()`):
    - 受信したJSONデータ（経路座標、イベント時刻）をパース。
    - Launch / Burst / Landing の各イベントポイントを抽出。
5.  **描画** (`plotStandardPrediction()`):
    - Leafletマップ上にポリライン（経路）とマーカー（Launch(緑)/Burst(黄)/Landing(赤)）を描画。
    - 高度プロファイル・風速プロファイルをChart.jsでグラフ描画。
    - 予測データを落下位置リストに追加。
    - 非同期で海陸判定を実行し、結果を追記。

### 3.2 13バリアント・アンサンブル処理フロー (旧版ロジック準拠)
1.  **パラメータ生成** (`run13VariantEnsemble()`): 基準パラメータから旧仕様（上昇±1m/s、下降±3m/s、破裂+10%/-20%）に基づく13パターンを系統的に生成。
2.  **並列API呼び出し**: 13パターンを同時にTawhiri APIへリクエスト。
3.  **個別描画** (`plot13VariantPath()`): 各バリアントに対して並行してAPIへリクエストを送信。
4. **モンテカルロ法による海陸判定 (新機能)**:
    - 各バリアントの落下地点13サンプルの「緯度・経度の平均」および「共分散行列」を計算。
    - コレスキー分解とBox-Muller変換を用いて、予測分布に従う **1000個のランダムポイント** をブラウザ上でローカル生成。
    - この1000点すべてに対して `LandSea.isLand`（ローカルGeoJSON）を用いて判定を行うことで、半島地形などの複雑な地形における着地確率を面的な高解像度で算出。
5. **UIへの反映とヒートマップ描画**: 
    - 予測データをパースし、ベースとなるパス周辺にバリアントの結果を描画（`plot13VariantPath`）。
    - 統計情報パネルに最大偏差やモンテカルロシミュレーションから得られた「海陸判定（高精度）」を表示。
    - カーネル密度推定（KDE）を用いて、予測地点群からの確率ヒートマップを生成。

### 3.3 ハイブリッド海陸判定フロー
```text
着地点(lat, lon)
    │
    ▼
[ローカルGeoJSON判定] ← data/land_japan_raw.geojson
    │
    ├─ true (陸) → [Overpass API: 内陸水域チェック]
    │                   ├─ 水域あり → 海/水域
    │                   └─ 水域なし → 陸
    │
    ├─ false (海) → [BigDataCloud API: 確認]
    │                   ├─ countryCode=空 → 海
    │                   ├─ Sea/Oceanキーワード → 海
    │                   └─ 陸検出 → [Overpass 内陸水域チェック]
    │
    └─ null (未ロード) → [BigDataCloud API フォールバック]
```

### 3.4 ディレクトリ構成
```text
/
├── index.html            # エントリーポイント (UI定義)
├── cors-proxy.js         # CORS Proxy & Static Server (Node.js)
├── sw.js                 # Service Worker (PWA)
├── manifest.json         # Web App Manifest
├── sites.json            # 打ち上げ場所定義
├── js/
│   ├── pred/
│   │   ├── pred-new.js   # [Core] 予測ロジック全般 (~1500行)
│   │   ├── landsea.js    # ローカルGeoJSON海陸判定モジュール
│   │   ├── pred-chart.js # 高度・風速プロファイルグラフ
│   │   ├── pred-collaborate.js # URL共有・画像エクスポート
│   │   ├── mobile_ui.js  # モバイルUI制御
│   │   ├── log-overlay.js# CSVログ重ね合わせ
│   │   ├── pred-ui.js    # UIイベントハンドリング
│   │   ├── pred-map.js   # マップ初期化・Haversine距離
│   │   ├── pred-event.js # イベント管理
│   │   ├── pred-config.js# 設定定義
│   │   ├── pred-cookie.js# Cookie操作
│   │   └── pred.js       # (Legacy) 初期化・起動処理
│   ├── calc/             # Burst Calculator
│   └── (ライブラリ群)     # jQuery, Leaflet, Moment.js, Chart.js等
├── css/
│   ├── predictor.css     # デスクトップ用スタイル
│   └── mobile.css        # モバイル用レスポンシブスタイル
├── data/
│   └── land_japan_raw.geojson # 日本陸地ポリゴン
└── images/               # マーカーアイコン
```

---

## 4. 主要モジュールの詳細 (Key Modules)

### 4.1 予測実行モジュール (`pred-new.js`, ~1500行)
本システムの核となるモジュールです。

| 関数名 | 概要 |
|--------|------|
| `runPrediction()` | UIから値を取得、JST→UTC変換、APIリクエスト構築。落下のみモード対応 |
| `tawhiriRequest()` | `jQuery.get` でTawhiri APIを呼び出し。エラーハンドリング含む |
| `processTawhiriResults()` | APIレスポンスのパースとディスパッチ |
| `parsePrediction()` | 予測データからLaunch/Burst/Landing情報を抽出 |
| `plotStandardPrediction()` | 地図上へのマーカー・ポリライン描画、履歴管理 |
| `runEnsembleSimulation()` | ガウス分布(Box-Muller変換)によるランダムアンサンブル |
| `run13VariantEnsemble()` | 13バリアント決定論的アンサンブル (愛媛モード) |
| `plot13VariantPath()` | 各バリアントの経路描画（色分け・ポップアップ） |
| `compute13VarStatistics()` | 平均着地点・最大偏差計算 |
| `drawEnsembleHull()` | Turf.jsによるコンベックスハル描画 |
| `checkLandSea()` | ハイブリッド海陸判定（ローカル→BigDataCloud→Overpass） |
| `checkLandSea13Var()` | 13バリアント用海陸判定（ローカル→BigDataCloud） |
| `checkInlandWater()` | Overpass APIによる内陸水域検出 |
| `runBatchSimulation()` | 複数地点の連続予測実行 |
| `updatePosList()` | 落下位置リストへの追記 |
| `toggleEnsembleHeatmap()` | Leaflet.heatヒートマップの表示/非表示切替 |
| `drawEnsembleHeatmap()` | KDE補間によるヒートマップ描画（ガウスカーネル） |

グローバル変数 `_ensembleResults` に各バリアントの着地座標・パラメータ・飛行時間・海陸判定を自動保存。`phase4-features.js` の `exportEnsembleCSV()` / `exportEnsembleJSON()` がこのデータを使用してエクスポートする。

### 4.2 ローカル海陸判定モジュール (`landsea.js`)
ネットワーク不要で即時判定を行うための軽量モジュール。
- **LandSea.load(url)**: GeoJSON読み込み。各Featureのバウンディングボックスを事前計算。
- **LandSea.isLand(lat, lon)**: Ray-Castingアルゴリズムでポイント・イン・ポリゴン判定。`true`=陸、`false`=海（ポリゴン外）、`null`=未ロード。
- **LandSea.isNearCoast(lat, lon)**: 陸地ポリゴンのBBox端から±0.05度(≈5km)以内かを判定。APIフォールバックの判断に使用。
- **自動起動**: jQueryの `$(function(){})` で `data/land_japan_raw.geojson` を自動ロード。

### 4.3 グラフ描画モジュール (`pred-chart.js`)
Chart.jsを使用した2種類のグラフを提供。

| グラフ | 種類 | X軸 | Y軸 | 用途 |
|--------|------|-----|-----|------|
| **高度プロファイル** | Line Chart | 経過時間 (分) | 高度 (m) | 飛行経路の高度変化を時系列で可視化 |
| **風速プロファイル** | Scatter Plot | 水平風速 (m/s) | 高度 (m) | 各高度における風速を推定・表示 |

- 風速はHaversine距離から水平移動速度として計算（`distHaversine()` 関数を使用）
- 初回予測実行時に自動表示、ボタンで表示/非表示切替可能

### 4.4 ログ・オーバーレイ (`log-overlay.js`)
実測データ（CSV）を地図上に重ねて表示する機能。
- **ヘッダー自動検知**: `lat`, `lon`, `alt` 等のキーワードをヘッダー行から探索。
- **フォールバック解析**: ヘッダーが無い場合、データ列の数値範囲（緯度35付近、経度135付近など）から列を推測。
- **外れ値除去**: GPS初期化直後の異常値（0,0付近など）や、中央値から極端に離れた点を除外するフィルタリング処理。

### 4.5 モバイルUI制御 (`mobile_ui.js`)
768px以下の画面幅でレスポンシブUIを提供するIIFEモジュール。
- **BottomNav**: 画面下部固定のナビゲーションバーで4パネル（打ち上げ/結果/愛媛/計算機）を切替。
- **パネル排他制御**: 1つのパネルのみ表示可能。`mobile-panel-open` クラスでCSS遷移制御。
- **コンパクトモード**: モバイル時にフォームの行間・パディングを自動圧縮。
- **ブレークポイント横断対応**: `matchMedia` と `resize` の両方を監視し、動的なビューポート変更にも追従。
- **Public API**: `window.__mobileUI` として `openPanel()`, `closeAll()`, `enableCompact()` 等を公開。

### 4.6 コラボレーション (`pred-collaborate.js`)
- **URL共有 (`copyLinkToClipboard()`)**: `navigator.clipboard.writeText()` で現在の予測パラメータ含むURLをコピー。
- **画像エクスポート (`exportResultImage()`)**: `html2canvas` でbody全体をキャプチャし、日時付きPNG (`prediction_result_YYYYMMDD_HHmmss.png`) としてダウンロード。
- **UI洗練化 (Sophisticated UI Logic) [NEW]**:
  - **インラインSVG**: トースト通知アイコンやテーマトグルに、軽量で高解像度なインラインSVGを採用。
  - **アニメーション制御**: CSS Transition と各モードごとのクラス（`.dark-mode`）を組み合わせ、アイコンの回転・不透明度を制御。

### 4.7 Service Worker (`sw.js`)
- **バージョン**: `predictor-cache-v9` / `predictor-tiles-v9`
- **静的ファイルキャッシュ**: install時に全HTML/CSS/JS/GeoJSON/画像を一括キャッシュ。
- **タイルキャッシュ**: OpenStreetMap / Mapbox タイルをStale-While-Revalidate戦略でキャッシュ。
- **自動クリーンアップ**: activate時に旧バージョンのキャッシュを自動削除。

### 4.8 CORSプロキシサーバー (`cors-proxy.js`)
Node.js標準モジュールのみで構成された軽量サーバー。
- **静的ファイル配信**: MIME type自動判定、ディレクトリトラバーサル防止。
- **APIプロキシ**: `/api/*` へのリクエストをDocker Tawhiri (`TAWHIRI_HOST:TAWHIRI_PORT`) へ転送。
- **CORS対応**: プロキシレスポンスに `Access-Control-Allow-Origin: *` を付与。
- **環境変数**: `PORT` (default:3000), `TAWHIRI_HOST` (default:localhost), `TAWHIRI_PORT` (default:8000)。

---

## 5. 開発・運用ガイド (Dev & Ops)

### ローカル実行
サーバーサイドのコード（PHP等）は不要ですが、CORS（Cross-Origin Resource Sharing）の制約を回避するため、ローカルWebサーバー経由でのアクセスが必須です。
- **Node.js (推奨)**: `node cors-proxy.js` (ポート3000で起動、APIプロキシ付き)
- **Python**: `python test.py` (ポート8000で起動、プロキシ機能なし)

### 過去データシミュレーション (Task B)
SondeHubの公開APIは直近の予測データしか持たないため、過去の日時のシミュレーションには**ローカルでTawhiri API（Docker）**を動かす必要があります。
1. `tawhiri-downloader` で過去のGFSデータ（気象データ）を取得。
2. `tawhiri-api` コンテナを起動し、そのデータをマウント。
3. 本ツールの「API接続先」を「Localhost」に設定して実行。

### Service Worker更新時の注意
コードを変更した場合は、`sw.js` のバージョン番号 (`CACHE_NAME`, `TILE_CACHE_NAME`) をインクリメントし、ブラウザの「登録解除」→再読み込みでキャッシュを更新してください。

---

## 6. 課題E：リアルタイム回収管制システムの設計 (Recovery System Design)

現場運用の過酷さと既存ツールの技術的強みを融合させた「実戦運用版設計」を定義しました。詳細は [AssignmentE.md](file:///c:/Users/chrik/demo/rockoon_simu_demo/leaflet_predictor_antigravity/AssignmentE.md) を参照してください。

### 設計の要点
- **ハイブリッド・ハブ構成**: 気球からの無線受信とローカル計算を行う「車載PC」を主軸とし、クラウド（Firebase）を中継・同期用として活用する、現場の通信断を前提とした設計。
- **PWAの完全活用**: Leaflet + Service Worker による地図タイルの事前キャッシュ機能を明記し、3G/低速LTE環境下での確実な動作を保証。
- **既存ツールの強み**: 13バリアント・アンサンブルによる不確実性可視化、オフライン海陸判定（GeoJSON）、モバイル用ボトムナビなどの現在の実装技術を設計に統合。
- **インフラ費用**: Firebase Sparkプラン（無料枠）の具体的な許容読取/書込量に基づき、実運用時のコストをゼロに抑える根拠を提示。
- **海上漂流予測**: 海上着地時に **OpenDrift** と **CMEMS** データ（海流・風・波）を連携させ、漂流経路を自動でアンサンブル計算する仕組みを統合。
- **コスト設計**: 2026年時点の各クラウド（GCP/Cloudflare）の最新無料枠に基づき、運用コスト実質0円の根拠を提示。

---

## 7. 2026-04-04 修正メモ (R3)

- **C3 履歴再表示の実装強化** (`pred-new.js`):
    - 13バリアント結果を `localStorage` (`predictor_ehime_history_v2`) に保存。
    - 履歴テーブルの「表示」ボタンで、API再実行なしに地図・統計・結果表を再描画可能。
    - 「全クリア」で履歴キャッシュも削除。

- **INFOパネル復帰不具合の修正** (`index.html`):
    - 重複していた `cursor_pred_links` ID を分離。
    - 「戻す」ボタンの復帰先を固定アンカー `metrics_restore_anchor` に変更し、ドッキング復帰を安定化。

- **放球NG判定とBASE位置ズレの修正** (`launch-window.js`, `pred-new.js`):
    - スライダーで選択したスロットの設定を、同一の `launch_datetime`/API設定で `run13VariantEnsemble()` に受け渡し。
    - 13バリアント側は「引数設定優先」に変更し、フォーム再読込による条件ズレを回避。

## 8. 2026-04-04 修正メモ (R4)

- **放球NG判定の実行速度制御** (`launch-window.js`):
    - `api_source=local` のときは待機なしで連続実行し、短時間で全スロットを評価。
    - `SondeHub(public)` は従来どおり3秒間隔を維持し、外部APIへの負荷を抑制。

- **INFO/Resultの表示整理** (`index.html`):
    - INFO側の表示を「シナリオ情報」に限定し、予測依存表示と常時表示領域を分離。
    - 「戻す」操作でドッキング復帰時に座標をリセットして、復帰不全を回避。
    - Result側に「愛媛気球実験 実行履歴」表示領域を追加。

- **海陸判定の一貫性改善** (`pred-new.js`):
    - `checkLandSea13Var()` に Overpass 内陸水域チェックを追加。
    - 単発予測と13バリアントで海陸判定条件を揃え、判定差を低減。

- **パネル移動性の改善** (`index.html`):
    - INFO（フローティング時）とアンサンブル統計パネルをドラッグ移動可能化。

- **放球時刻表示と結果再同期** (`launch-window.js`):
    - local の放球NGスライダー移動時に、再計算せず選択スロットの時刻・結果をフォームへ再同期する。

## 9. 2026-04-05 修正メモ (R5)

- **放球NG判定の愛媛連動評価** (`launch-window.js`):
    - local API時に 25スロット × 13バリアントを評価し、海落ち確率/陸落ち確率を算出。
    - NG判定は陸落ち確率閾値で判定する方式へ変更。
    - local時のスライダー操作では再計算を行わず、既存結果の再表示を優先。

- **海陸判定の共通化と精度改善** (`pred-new.js`):
    - `classifyLandSeaAt()` を新設し、単発・13バリアント・放球NG判定で共通利用。
    - ローカルGeoJSON + BigDataCloud + Overpass の判定フローを統一して沿岸誤判定を低減。

- **愛媛モードのINFO反映改善** (`pred-new.js`):
    - BASE経路の Launch/Landing をINFO参照用マーカーに関連付け、到達距離/飛行時間表示を維持。

- **愛媛履歴の運用性改善** (`pred-new.js`):
    - 実行履歴に打ち上げ場所を追加。

- **UI表示不具合修正とブラッシュアップ** (`index.html`, `mobile_ui.js`, `mobile.css`):
    - デスクトップでモバイル下部ナビが表示される不具合を修正。
    - モバイル下部ナビをApple HIG方針（44pxタッチターゲット、コントラスト強化）に合わせて改善。

- **開発運用改善** (`.gitignore`, `README.md`):
    - `.gitignore` を追加し、AI関連・一時ファイル・環境依存ファイルの混入を抑止。
    - READMEを現行機能・運用フロー・判定ロジックに合わせて全面更新。

- **PWAキャッシュ更新** (`sw.js`):
    - キャッシュバージョンを `predictor-cache-v9` / `predictor-tiles-v9` へ更新。
    - `launch-window.js` / `phase4-features.js` を静的キャッシュ対象へ追加。

- **沿岸部の海陸誤判定の低減** (`landsea.js`, `pred-new.js`):
    - `isNearCoast()` をポリゴン辺距離ベースに改善。
    - BigDataCloudの領海/海域キーワード判定を小文字正規化+語彙拡張で強化。
    - 沿岸で「ローカル海判定 vs API陸判定」が競合した場合、内陸証拠が弱いときは海判定を優先。

## 10. 2026-04-09 修正メモ

- **着地範囲トグルのUI文言改善** (`index.html`, `pred-new.js`):
    - ボタン表示を `着地範囲 ON/OFF` に変更し、狭いボタン幅でも状態が分かる表記へ変更。
    - ツールチップを「着地範囲の表示/非表示」に統一。

- **愛媛履歴再表示の堅牢化** (`pred-new.js`):
    - 履歴ID一致判定を型揺れ対応へ修正（数値/文字列の両対応）。
    - 履歴結果の正規化関数を追加し、`index/lat/lng` が不正な行を除外して再表示中断を回避。
    - BASE欠損時でも `fitBounds` と先頭有効ピンへのフォーカスで地図上に結果が見えるよう修正。

- **履歴再表示の再現性改善** (`pred-new.js`):
    - 色の割当を表示順ではなくバリアント `index` ベースに固定し、履歴欠番時のラベル・色ズレを解消。
    - 保存値優先の復元に整理し、不要な補完による結果差異を低減。

- **RESULT履歴テーブルの可読性改善** (`pred-new.js`):
    - 列構成を再設計し、時刻/場所・条件・成功数・陸海比・平均着地・操作を見やすく整理。
    - 交互背景とボタン導線（`地図へ`, `再表示`）を追加し、運用時の参照性を向上。

- **一括計算のサイト切替同期化** (`pred.js`, `pred-new.js`):
    - `changeLaunchSite()` をコールバック対応にし、サイト座標の反映完了後に `runPrediction()` を実行するよう変更。
    - これにより、`batchSites` 実行時の非同期競合で一部サイトの履歴が欠落する問題を抑制。

- **履歴データ欠損時の再計算フォールバック** (`pred-new.js`):
    - `replayEhimeHistory()` で `results` が空の既存履歴に対し、保存済みパラメータから再計算を実施する救済処理を追加。
    - 完全な再生データがない場合でも、同条件の結果を復元できるようにした。

- **南レク一括の保存待ちキュー化** (`pred-new.js`, `pred.js`):
    - バッチ実行を各地点の13バリアント保存完了後に次地点へ進む逐次処理へ変更。
    - `saveEhimeHistory()` を完了通知として利用し、保存途中で次の地点が `_ensembleResults` を潰す競合を防止。

- **履歴再表示時のマップ非同期クリアの修正** (`pred-new.js`):
    - 履歴再表示時に `$site` の `change` イベントが発火し、非同期でマップ描画がクリアされるバグを修正。
    - 履歴展開中は不要なイベントトリガーを無効化し、ピンや軌跡が確実に残るように安定化。


- **海陸判定のキャッシュとモンテカルロ近似** (`pred-new.js`):
    - `classifyLandSeaAt()` に判定キャッシュを追加し、同一座標の再判定を削減。
    - 沿岸付近ではローカルGeoJSONのモンテカルロ近似を先行し、APIフォールバックを減らすことで local 実行時のNG判定を軽量化。

- **UI文言の整理** (`index.html`, `pred-new.js`):
    - 見出し・トースト・ヒートマップ切替ボタンから絵文字を除去し、表示文言をテキストベースに統一。

- **PWAキャッシュ更新** (`sw.js`):
    - キャッシュバージョンを `predictor-cache-v9` / `predictor-tiles-v9` へ更新。

## 10. 2026-04-05 修正メモ: Apple HIG フロントエンドリデザイン

- **Apple HIG準拠のデザインシステム**: `predictor.css` にて、`backdrop-filter` や厳密なデザイントークン（カラー、レイアウト変数）を導入し、モバイル端末での操作性（44pxタッチ領域）と視認性（システム背景とエレベーテッド背景の区別）を重視。
- **モバイル優先ナビゲーション**: 画面下部に配置されたボトムナビゲーションバー（`mobile_ui.js`、`mobile.css`）により、主要機能へ片手でアクセス可能。
- **ダイナミック・テーマとフォールバック**: ダークモード対応はシステム設定(`prefers-color-scheme`)と手動切り替えの双方に対応。Windows環境での`SF Pro`フォールバックとして`Noto Sans JP`を自動適用。
- **jQuery UIからの脱却**: UIのボタンやフォームコントロールは従来のjQuery UIベースから、純粋なCSSクラスベース(`btn-primary`, `form-control`等)に完全移行。
    - **絵文字の完全排除**: JS(`pred-new.js`, `pred-ui.js`等) および HTML から全絵文字を削除し、プロ向けUIへ昇華。
    - **モバイルシートUI** (`mobile.css`): 下部ナビゲーションやスライドアップパネルに `env(safe-area-inset-bottom)` を適用し、余白を適切に管理。
- **Service Worker キャッシュ** (`sw.js`): バージョンを `v9` へ更新し、UIアセット強制作り直し。

## 11. 2026-04-06 修正メモ: Ehime NG 再表示と履歴復元

- **放球NG選択同期の統一** (`launch-window.js`): スライダー移動、NG一覧クリック、マーカークリックを同じ選択更新経路に通し、local 実行時でも選択時刻の結果を即座に再表示できるように整理。
- **閾値に応じたマーカー再着色** (`launch-window.js`): NG判定閾値の変更に合わせて選択中マーカーの塗り色を再計算し、見た目と判定結果のズレを防止。
- **履歴再生の防御的復元** (`pred-new.js`): 旧データや部分的な履歴でも、欠損行を除外しながら可能な範囲で再生するように変更。
- **履歴保存の補強** (`pred-new.js`): 打ち上げ座標を保存することで、今後の再生・参照時の復元性を向上。

## 12. 2026-04-08 修正メモ: 海陸判定・赤いエリア・NG再表示の再調整

- **海陸判定の再調整** (`pred-new.js`, `landsea.js`): 更新済みの陸地GeoJSONを前提に、ローカル判定の結果をより慎重に扱い、山間部が海判定へ寄りにくいよう再確認の流れを優先する構成へ変更。
- **赤いエリアの切替化** (`pred-new.js`, `phase4-features.js`, `index.html`): 愛媛モードの不確実性表示をヒートマップから凸包ベースの赤いエリアへ置き換え、表示/非表示を明示的に切り替えられるようにした。
- **履歴再表示の再結線** (`pred-new.js`): 履歴再表示後の表・カードからのクリック操作を再び有効化し、マーカーとの連動を維持するようにした。
- **放球NG再表示の更新** (`launch-window.js`): スライダー操作で飛行時間と統計値を更新し、色とラベルの対応を固定化したまま再表示できるようにした。
