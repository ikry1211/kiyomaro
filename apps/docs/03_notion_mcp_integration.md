# Notion MCP 連携仕様書

> **ドキュメントバージョン:** 1.1
> **最終更新日:** 2026-03-18
> **ステータス:** Draft

---

## 1. 概要

本ドキュメントでは、Kiyomaro システムにおける Notion MCP（Model Context Protocol）連携の設計方針と検証結果をまとめる。

### 1.1. 基本方針

Notion MCP は **読み取り専用（Read-Only）** として利用し、Notion への書き込みは **Next.js API Route / Server Action** 経由で行う。

| 操作 | 経路 | 許可 |
|:---|:---|:---:|
| ワークスペース検索・参照 | MCP（`notion-search`, `notion-fetch` 等） | ✅ |
| ページ作成・更新・削除 | MCP（`notion-create-pages` 等） | ❌ |

### 1.2. フェーズ別の書き込み経路

| フェーズ | ドキュメント管理 | バージョン管理 |
|:---|:---|:---|
| **検証フェーズ（現在）** | Nextra（Markdown + `apps/strategy`） | Git（PR ベース） |
| **本番フェーズ（将来）** | Supabase | DB 上の state 管理 |

検証フェーズでは Supabase は使用せず、**Nextra + Markdown** で経営戦略ドキュメントを管理する。Git の PR フローが「提案 → 承認」に対応し、Human-in-the-loop 原則を自然に実現する。本番移行時に Supabase へ切り替える。

### 1.3. 設計根拠

`01_system_architecture.md` Section 4 に定める **Human-in-the-loop 原則** に従い、AI（MCP経由）による直接的な書き込みを防止する。書き込みを API 層に集約することで、以下を技術的に強制する：

- AI は `state = 'proposed'` の INSERT のみ実行可能
- `state` の変更（承認・アーカイブ）は人間の操作でのみ実行
- DELETE は禁止

---

## 2. MCP 接続構成

### 2.1. 接続方式

Notion 公式ホステッド MCP（`mcp.notion.com`）を、`mcp-remote` ブリッジ経由で利用する。

**設定ファイル:** `.gemini/antigravity/mcp_config.json`（IDE レベル）

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.notion.com/mcp"]
    }
  }
}
```

### 2.2. 認証

- OAuth 2.0 フロー（初回接続時にブラウザで認証）
- 認証トークンはローカルにキャッシュされる

---

## 3. ツール権限設定

### 3.1. 設定方法

IDE の **Manage MCP Servers** 画面で、ツール単位の ON/OFF を切り替える。

> **注意:** この設定はツール単位（グローバル）であり、ページ単位・データベース単位のアクセス制御はできない。ページ単位の制御が必要な場合は、Notion 側の Integration 設定でアクセス範囲を制限する。

### 3.2. 有効ツール一覧（Read-Only 構成）

| ツール | 状態 | 用途 |
|:---|:---:|:---|
| `notion-search` | ✅ ON | ワークスペース横断検索 |
| `notion-fetch` | ✅ ON | ページ・DB の詳細取得 |
| `notion-get-comments` | ✅ ON | コメント取得 |
| `notion-get-users` | ✅ ON | ユーザー情報取得 |
| `notion-get-teams` | ✅ ON | チーム情報取得 |
| `notion-query-database-view` | ✅ ON | DB ビューのクエリ |
| `notion-query-meeting-notes` | ✅ ON | 議事録クエリ |

### 3.3. 無効ツール一覧（書き込み系）

| ツール | 状態 | 理由 |
|:---|:---:|:---|
| `notion-create-pages` | ❌ OFF | 書き込みは API 経由に限定 |
| `notion-create-database` | ❌ OFF | 同上 |
| `notion-create-view` | ❌ OFF | 同上 |
| `notion-update-page` | ❌ OFF | 同上 |
| `notion-update-data-source` | ❌ OFF | 同上 |
| `notion-update-view` | ❌ OFF | 同上 |
| `notion-move-pages` | ❌ OFF | 同上 |
| `notion-duplicate-page` | ❌ OFF | 同上 |
| `notion-create-comment` | ❌ OFF | 同上 |

---

## 4. 検証結果（2026-03-18）

### 4.1. 接続確認

| テスト | 結果 |
|:---|:---:|
| OAuth 認証 | ✅ 成功 |
| ユーザー情報取得（`notion-get-users`） | ✅ 成功（Ryo Ikeda / ryo.ikeda@soct.jp） |
| ワークスペース検索（`notion-search`） | ✅ 成功（Notion + Google Drive + Slack 横断検索） |

### 4.2. 書き込みテスト（ツール有効時）

書き込みツールが有効な状態で、以下の操作を実行し正常動作を確認した。

| テスト | 結果 | 備考 |
|:---|:---:|:---|
| DB 作成（`notion-create-database`） | ✅ 成功 | 「📋 経営戦略ドキュメント」DB を作成 |
| ページ作成（`notion-create-pages`） | ✅ 成功 | テストデータ 2 件を投入 |

**作成した Notion DB:** [📋 経営戦略ドキュメント](https://www.notion.so/28a0c15526184a04abd83526a6ae50b8)

**DB スキーマ:** `02_database_schema.md` の `strategy_documents` テーブル設計に準拠

| プロパティ | 型 | 対応カラム |
|:---|:---|:---|
| タイトル | Title | `title` |
| Slug | Text | `slug` |
| バージョン | Number | `version` |
| ステータス | Select（active / proposed / archived） | `state` |
| 変更サマリー | Text | `change_summary` |
| AI生成 | Checkbox | `ai_generated` |
| フィードバック | Text | `feedback` |
| 承認者 | People | `approved_by` |
| 承認日時 | Date | `approved_at` |
| 作成日時 | Created Time | `created_at` |
| 最終更新日時 | Last Edited Time | `updated_at` |

**テストデータ:**

| タイトル | Slug | Version | ステータス | AI生成 |
|:---|:---|:---:|:---:|:---:|
| 中期経営計画 2026 | `mid-term-plan-2026` | 1 | active | No |
| 中期経営計画 2026（改訂案） | `mid-term-plan-2026` | 2 | proposed | Yes |

### 4.3. 読み取り専用モードの検証

書き込みツールを OFF にした状態で、以下を確認した。

| テスト | 結果 |
|:---|:---:|
| ページ作成の試行（`notion-create-pages`） | ❌ ブロック（`unknown tool name`） |
| 検索の実行（`notion-search`） | ✅ 正常動作 |

→ **Manage MCP Servers のツール単位 ON/OFF により、読み取り専用モードが正しく機能することを確認。**

---

## 5. 経営戦略ドキュメント管理（検証フェーズ）

検証フェーズでは、Nextra（Docs テーマ）を用いて Markdown ベースで経営戦略ドキュメントを管理する。

### 5.1. 構成

```
apps/strategy/
├── app/                          ... Next.js App Router
│   ├── layout.tsx                ... ルートレイアウト（Kiyomaro ブランド）
│   └── [[...mdxPath]]/page.tsx   ... MDX レンダリング
├── content/                      ... 戦略ドキュメント（Markdown）
│   ├── _meta.json                ... サイドバー設定
│   ├── index.mdx                 ... トップページ
│   └── mid-term-plan-2026.mdx    ... 中期経営計画 2026
├── mdx-components.tsx
├── next.config.mjs
└── package.json
```

### 5.2. ワークフロー

```
┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Kiyomaro    │    │   Git（GitHub）    │    │   Nextra サイト   │
│  (AI)        │    │                  │    │   apps/strategy  │
└──────┬───────┘    └────────┬─────────┘    └────────┬─────────┘
       │                     │                       │
       │ 1. .mdx ファイルを  │                       │
       │    作成・編集        │                       │
       │ ──────────────────>│                       │
       │                     │                       │
       │ 2. PR として提出     │                       │
       │    (= proposed)     │                       │
       │                     │                       │
       │                     │ 3. 経営陣がレビュー    │
       │                     │    → マージ (= active) │
       │                     │ ─────────────────────>│
       │                     │                       │
       │                     │    Git 履歴            │
       │                     │    (= archived)        │
```

### 5.3. 本番アーキテクチャとの対応

| 概念 | 検証フェーズ（Git） | 本番フェーズ（Supabase） |
|:---|:---|:---|
| proposed | PR（ブランチ） | `state = 'proposed'` |
| active | main ブランチ | `state = 'active'` |
| archived | Git 履歴 | `state = 'archived'` |
| 承認 | PR マージ | state 変更 UPDATE |
| 監査証跡 | `git log` | DB レコード |

---

## 6. Notion MCP の位置づけ

```
┌──────────────────────────────────────────┐
│  IDE / 開発・モニタリング用               │
│  Notion MCP（Read-Only）                  │
│  ・Notion ワークスペースの参照             │
│  ・過去の議事録・資料の検索                │
│  ・AI のコンテキスト取得                  │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│  経営戦略ドキュメント（検証）             │
│  Nextra + Markdown + Git                  │
│  ・ドキュメントの作成・閲覧               │
│  ・PR ベースのレビュー・承認              │
└──────────────────────────────────────────┘
```

---

## 7. 今後の検討事項

- **Supabase への移行**: 検証フェーズ完了後、データストアを Markdown から Supabase に切り替え
- **Notion との連携**: Notion MCP で取得した情報を AI のコンテキストとして活用
- **ページ単位のアクセス制御**: 必要に応じて Notion 側の Integration 設定でアクセス範囲を制限
