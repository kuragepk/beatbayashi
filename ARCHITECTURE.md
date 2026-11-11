# BeatBayashi — マルチプラットフォーム アーキテクチャ

**版**: v2.0 (SQL + Java + JavaScript マルチスタック)  
**制定日**: 2026-08-19  
**ステータス**: 設計・実装開始

---

## 1. システム構成図

```
┌─────────────────────────────────────────┐
│         フロントエンド層                 │
├─────────────────────────────────────────┤
│ Web UI (React)  │ Desktop (Electron)    │
│ ブラウザ        │ Windows/Mac/Linux    │
│ TypeScript/JSX  │ Node.js + IPC        │
└────────┬────────────────┬───────────────┘
         │                │
      HTTP/REST        IPC/Socket
         │                │
┌────────▼────────────────▼───────────────┐
│      バックエンド層 (Java)               │
├─────────────────────────────────────────┤
│ Spring Boot REST API Server              │
│ ・Sequencer Logic                       │
│ ・MIDI Controller                       │
│ ・Audio Engine                          │
│ ・Pattern Management                    │
└────────┬──────────────────────────────┘
         │
        JDBC
         │
┌────────▼──────────────────────────────┐
│       データ層 (SQL)                    │
├────────────────────────────────────────┤
│ PostgreSQL / MySQL / SQLite            │
│ ・Pattern テーブル                      │
│ ・Drum Kit テーブル                    │
│ ・User Config テーブル                 │
│ ・MIDI Mapping テーブル                │
└────────────────────────────────────────┘
```

---

## 2. 各層の詳細

### 2.1 データ層 (SQL)

**DB選択**: SQLite (単一ユーザー) / PostgreSQL (マルチユーザー)

```sql
-- Patterns テーブル
CREATE TABLE patterns (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  bpm INTEGER DEFAULT 120,
  bars INTEGER DEFAULT 2,
  resolution INTEGER DEFAULT 16,
  scale VARCHAR(10), -- 'major' or 'minor'
  genre VARCHAR(50),
  grid JSONB NOT NULL, -- [4][steps] boolean array
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Drum Kits テーブル
CREATE TABLE drum_kits (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  drum_sources JSONB NOT NULL, -- {kick, tom, cymbal, clap}
  created_at TIMESTAMP DEFAULT NOW()
);

-- User Config テーブル
CREATE TABLE user_config (
  id UUID PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value VARCHAR(1000),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- MIDI Mapping テーブル
CREATE TABLE midi_mappings (
  id UUID PRIMARY KEY,
  drum_id VARCHAR(50) NOT NULL,
  midi_note INTEGER NOT NULL,
  midi_channel INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.2 バックエンド層 (Java)

**フレームワーク**: Spring Boot 3.x  
**構成**:
```
beatbayashi-backend/
├── src/main/java/
│  ├── controller/
│  │  ├── SequencerController.java      (REST endpoints)
│  │  ├── PatternController.java
│  │  └── DrumKitController.java
│  ├── service/
│  │  ├── SequencerService.java
│  │  ├── PatternService.java
│  │  └── MidiService.java
│  ├── model/
│  │  ├── Pattern.java
│  │  ├── DrumKit.java
│  │  └── Grid.java
│  ├── repository/
│  │  ├── PatternRepository.java
│  │  └── DrumKitRepository.java
│  ├── audio/
│  │  ├── AudioEngine.java
│  │  ├── MidiController.java
│  │  └── SynthEngine.java
│  └── BeatBayashiApplication.java
├── src/main/resources/
│  ├── application.properties
│  └── db/migration/
│     └── V1__init.sql
└── pom.xml
```

### 2.3 フロントエンド層 (JavaScript)

#### 2.3.1 Web UI (React)
```
beatbayashi-web/
├── src/
│  ├── pages/
│  │  ├── SequencerPage.tsx
│  │  ├── PatternLibrary.tsx
│  │  └── Settings.tsx
│  ├── components/
│  │  ├── SequencerGrid.tsx
│  │  ├── ControlPanel.tsx
│  │  └── PatternSelector.tsx
│  ├── services/
│  │  ├── api.ts              (Fetch to Java backend)
│  │  └── audioService.ts
│  └── App.tsx
└── package.json
```

#### 2.3.2 Desktop App (Electron)
```
beatbayashi-desktop/
├── main/
│  └── main.ts               (Electron Main Process)
├── preload/
│  └── preload.ts            (IPC Bridge)
├── src/
│  └── (Web UI コンポーネント再利用)
└── package.json
```

---

## 3. 通信プロトコル

### 3.1 REST API (Web ↔ Java Backend)

```
GET    /api/patterns          # パターン一覧取得
POST   /api/patterns          # パターン作成
GET    /api/patterns/{id}     # パターン詳細取得
PUT    /api/patterns/{id}     # パターン更新
DELETE /api/patterns/{id}     # パターン削除

POST   /api/sequencer/play    # 再生開始
POST   /api/sequencer/stop    # 再生停止
POST   /api/sequencer/note    # ノート発音 (JSON: {drum, velocity})

GET    /api/drumkits          # ドラムキット一覧
POST   /api/drumkits          # ドラムキット作成

GET    /api/config            # ユーザー設定取得
POST   /api/config            # ユーザー設定保存
```

### 3.2 IPC (Electron ↔ Backend)

```typescript
// Main Process → Backend (via HTTP)
ipcMain.handle('sequencer:play', async (event, pattern) => {
  return await fetch('http://localhost:8080/api/sequencer/play', {
    method: 'POST',
    body: JSON.stringify(pattern)
  });
});
```

---

## 4. マイグレーションパス

### Phase 1: MVP Web (current)
- React Web UI のみ
- Backend は簡易版（メモリ）

### Phase 2: Java Backend + SQL
- Spring Boot サーバー起動
- PostgreSQL / SQLite 統合
- REST API 完成

### Phase 3: Electron Desktop
- Electron Wrapper
- Native MIDI I/O
- DAW 連携テスト

### Phase 4: プラグイン化
- VST3 / AU ブリッジ
- Java backend のクラウド化検討

---

## 5. 技術スタック確定

| レイヤー | 技術 | バージョン |
|---------|------|-----------|
| Web UI | React | 18.x |
| Web UI | TypeScript | 5.x |
| Desktop | Electron | 25.x |
| Backend | Spring Boot | 3.x |
| Backend | Java | 17 LTS |
| Backend | Maven | 3.x |
| DB | PostgreSQL / SQLite | 14+ / 3.x |
| Audio | Tone.js (Web) | 14.x |
| Audio | javax.sound (Java) | JDK 내장 |
| MIDI | Web MIDI API (Web) | Standard |
| MIDI | javax.sound.midi (Java) | JDK 내장 |

---

## 6. 今後のロードマップ

### Week 1-2
- [x] アーキテクチャ設計
- [ ] Java Backend 基本構造
- [ ] SQLite 初期化スクリプト
- [ ] Spring Boot REST API 実装

### Week 3-4
- [ ] React ← → Java 通信テスト
- [ ] Pattern CRUD 実装
- [ ] Audio/MIDI Engine (Java 版)

### Week 5-6
- [ ] Electron Desktop App
- [ ] ネイティブ MIDI I/O テスト
- [ ] DAW 連携テスト (Cubase / Studio One)

### Week 7-8
- [ ] プラグインブリッジ検討
- [ ] パフォーマンス最適化
- [ ] ドキュメント・デプロイ

---

## 7. ファイル構成（全体）

```
beatbayashi/
├── backend/                  (Java Spring Boot)
│  ├── pom.xml
│  └── src/
├── web/                      (React Web UI)
│  ├── package.json
│  └── src/
├── desktop/                  (Electron)
│  ├── package.json
│  └── src/
├── shared/                   (共有型定義・定数)
│  ├── types.ts
│  └── constants.ts
├── docs/
│  ├── API.md
│  ├── SETUP.md
│  └── DEVELOPMENT.md
└── README.md
```

---

## 8. セキュリティ・デプロイ考慮事項

- **認証**: JWT / Session（将来的なマルチユーザー対応）
- **CORS**: 適切な origin ホワイトリスト
- **MIDI**: Localhost のみ信頼
- **DB**: 暗号化バックアップ
- **デプロイ**: Docker / Docker Compose 推奨

