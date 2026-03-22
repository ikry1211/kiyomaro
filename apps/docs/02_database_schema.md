# Kiyomaro データベーススキーマ仕様書

> **ドキュメントバージョン:** 1.0
> **最終更新日:** 2026-03-16
> **ステータス:** Draft

---

本ドキュメントでは、Supabase (PostgreSQL) 上に構築する主要テーブルの設計について定義します。
マイグレーションファイルは `packages/supabase/` パッケージで一元管理されます。

---

## 1. `kiyomaro_settings` テーブル

### 1.1. 概要

AI（Kiyomaro）の人格、振る舞い、およびシステム全体で利用するプロンプト設定を**動的に管理**するためのテーブルです。
ソースコードを変更・再デプロイすることなく、DB上から直接 AI のトーン＆マナーやベースとなる指示内容をチューニングできます。

### 1.2. カラム定義

| カラム名 | データ型 | 制約 | 説明 |
|:---|:---|:---|:---|
| `id` | `uuid` | PK, Default: `gen_random_uuid()` | 一意の識別子 |
| `name` | `text` | NOT NULL, UNIQUE | 設定の論理名（例: `"default_persona"`, `"strategy_advisor"`） |
| `display_name` | `text` | NOT NULL | 管理画面に表示する設定名（例: `"デフォルト人格"`, `"戦略アドバイザー"`） |
| `description` | `text` | Nullable | この設定の目的・用途に関する説明メモ |
| `system_prompt` | `text` | NOT NULL | AI に与えるシステムプロンプトのテキスト |
| `parameters` | `jsonb` | Default: `'{}'` | モデルパラメータ（Temperature, Model名, MaxTokens 等）をJSON形式で保持 |
| `is_active` | `boolean` | NOT NULL, Default: `false` | 現在有効な設定かどうかのフラグ |
| `created_at` | `timestamptz` | NOT NULL, Default: `now()` | レコード作成日時 |
| `updated_at` | `timestamptz` | NOT NULL, Default: `now()` | レコード最終更新日時 |

### 1.3. 制約・インデックス

| 種別 | 対象 | 説明 |
|:---|:---|:---|
| PRIMARY KEY | `id` | — |
| UNIQUE | `name` | 設定名の一意性を保証 |
| INDEX | `is_active` | 有効な設定の高速取得用 |

### 1.4. `parameters` カラムの JSON 構造例

```json
{
  "model": "gemini-2.0-flash",
  "temperature": 0.7,
  "max_tokens": 8192,
  "top_p": 0.9
}
```

### 1.5. 運用ルール

- `is_active = true` のレコードは**常に最大1つ**とすることを推奨します。
- アプリケーション側で有効設定を取得する際は `SELECT * FROM kiyomaro_settings WHERE is_active = true LIMIT 1` を使用します。
- 複数の人格パターンを切り替え可能にする場合、将来的にDBトリガーで排他制御を実装することも検討します。

---

## 2. `strategy_documents` テーブル（最重要）

### 2.1. 概要

経営戦略ドキュメントの**実体とバージョン履歴**を管理する、本システムのコアテーブルです。
AI（Kiyomaro）による提案と人間による承認フローを支えるデータ構造であり、Event Sourcing 的アプローチの中核を担います。

### 2.2. カラム定義

| カラム名 | データ型 | 制約 | 説明 |
|:---|:---|:---|:---|
| `id` | `uuid` | PK, Default: `gen_random_uuid()` | 各バージョンのドキュメントを一意に識別するID |
| `slug` | `text` | NOT NULL | ドキュメントの論理的な識別子（例: `"mid-term-plan-2026"`, `"brand-strategy"`） |
| `version` | `integer` | NOT NULL | `slug` 内でのバージョン番号（1, 2, 3, ...） |
| `state` | `text` | NOT NULL, CHECK | ドキュメントの現在の状態。`'active'` / `'proposed'` / `'archived'` のいずれか |
| `title` | `text` | NOT NULL | 戦略ドキュメントのタイトル |
| `content` | `text` | NOT NULL | 戦略ドキュメントの本文（Markdown 形式） |
| `change_summary` | `text` | Nullable | このバージョンでの主な変更点の要約（AI生成 or 人間入力） |
| `author_id` | `uuid` | Nullable, FK → `auth.users(id)` | 作成者のユーザーID |
| `ai_generated` | `boolean` | NOT NULL, Default: `false` | AI によって生成された提案であるかどうかのフラグ |
| `approved_by` | `uuid` | Nullable, FK → `auth.users(id)` | 提案を承認したユーザーのID（承認時に記録） |
| `approved_at` | `timestamptz` | Nullable | 承認された日時 |
| `feedback` | `text` | Nullable | 提案元となったユーザーのプロンプトや修正指示などのメモ |
| `created_at` | `timestamptz` | NOT NULL, Default: `now()` | レコード作成日時 |
| `updated_at` | `timestamptz` | NOT NULL, Default: `now()` | レコード最終更新日時 |

### 2.3. 制約・インデックス

| 種別 | 対象 | 説明 |
|:---|:---|:---|
| PRIMARY KEY | `id` | — |
| UNIQUE | `(slug, version)` | 同一ドキュメント内でバージョン番号の重複を防止 |
| CHECK | `state` | `state IN ('active', 'proposed', 'archived')` で値を制限 |
| INDEX | `slug, state` | 特定ドキュメントの特定状態を高速に取得（例: active 版の取得） |
| INDEX | `state` | 状態別の一覧取得用 |

---

### 2.4. 必須カラムの考え方と `state` 状態遷移ロジック

`slug`, `version`, `state` の3つのカラムが、バージョン管理の中核を構成します。
同一の戦略（例: 中期経営計画 = `slug: "mid-term-plan"`）に対して、複数のレコードが作成・管理されます。

#### 状態の定義

| state | 意味 | ルール |
|:---|:---|:---|
| `active` | **現在の正式な経営戦略ドキュメント** | 各 `slug` に対して `active` レコードは**常に最大1つ**。アプリケーション層またはDBトリガーで制御する。 |
| `proposed` | **AI が生成した新バージョンのドラフト** | 既存の `active` レコードを元に作成され、新しい `version` 番号が割り振られる。正式な戦略としてはまだ適用されていない。 |
| `archived` | **過去に active だった履歴ドキュメント** | 新バージョンの承認に伴い、旧 active が archived へ遷移する。削除はされず、監査証跡として永続的に保持される。 |

#### 状態遷移図

```
               ┌──── 棄却（DELETE or 状態変更） ────┐
               │                                    │
               ▼                                    │
          ┌──────────┐    承認    ┌──────────┐      │
          │ proposed │ ────────> │  active  │ ─────┘
          └──────────┘           └──────────┘
               ▲                      │
               │                      │ 新版の承認時
           AI が生成                   │
                                      ▼
                                ┌──────────┐
                                │ archived │
                                └──────────┘
```

---

### 2.5. 承認フローにおけるレコードの動き（具体例）

以下に、`slug: "mid-term-plan"` の戦略ドキュメントにおける一連のライフサイクルを示します。

#### Step 1: 初期ドキュメントの作成

ユーザーが最初の戦略ドキュメントを手動で作成します。

```sql
INSERT INTO strategy_documents (slug, version, state, title, content, author_id, ai_generated)
VALUES ('mid-term-plan', 1, 'active', '中期経営計画 2026', '...本文...', 'user-uuid', false);
```

**DB の状態:**

| slug | version | state | title |
|:---|:---:|:---|:---|
| `mid-term-plan` | 1 | **active** | 中期経営計画 2026 |

#### Step 2: AI が更新を提案

ユーザーが「市場環境の変化を反映して更新してほしい」とリクエスト。Kiyomaro がドラフトを生成。

```sql
INSERT INTO strategy_documents (slug, version, state, title, content, author_id, ai_generated, feedback)
VALUES ('mid-term-plan', 2, 'proposed', '中期経営計画 2026（改訂案）', '...AI生成の本文...', 'system-ai-uuid', true, 'ユーザーからの指示: 市場環境の変化を反映');
```

**DB の状態:**

| slug | version | state | title |
|:---|:---:|:---|:---|
| `mid-term-plan` | 1 | **active** | 中期経営計画 2026 |
| `mid-term-plan` | 2 | **proposed** | 中期経営計画 2026（改訂案） |

#### Step 3: 人間が承認

ユーザーが差分を確認し、提案を承認。以下の2つの UPDATE がトランザクション内で実行されます。

```sql
BEGIN;

-- 旧 active をアーカイブ
UPDATE strategy_documents
SET state = 'archived', updated_at = now()
WHERE slug = 'mid-term-plan' AND state = 'active';

-- proposed を active に昇格
UPDATE strategy_documents
SET state = 'active', approved_by = 'approver-uuid', approved_at = now(), updated_at = now()
WHERE slug = 'mid-term-plan' AND version = 2 AND state = 'proposed';

COMMIT;
```

**DB の状態（承認後）:**

| slug | version | state | title |
|:---|:---:|:---|:---|
| `mid-term-plan` | 1 | **archived** | 中期経営計画 2026 |
| `mid-term-plan` | 2 | **active** | 中期経営計画 2026（改訂案） |

> **ポイント:** v1 は削除されず、`archived` として監査証跡に残ります。いつでも過去の版を参照・比較できます。

---

## 3. RLS（Row Level Security）方針

Supabase の RLS を活用し、データアクセスを制御します。詳細なポリシー定義は実装フェーズで策定しますが、基本方針は以下の通りです。

| テーブル | 操作 | ポリシー概要 |
|:---|:---|:---|
| `kiyomaro_settings` | SELECT | 認証済みユーザーのみ読み取り可 |
| `kiyomaro_settings` | INSERT / UPDATE / DELETE | 管理者ロールのみ |
| `strategy_documents` | SELECT | 認証済みユーザーのみ読み取り可 |
| `strategy_documents` | INSERT | 認証済みユーザー（AI経由の場合はサービスロールキー） |
| `strategy_documents` | UPDATE (`state` 変更) | 管理者ロールのみ（承認権限の制御） |
| `strategy_documents` | DELETE | 原則禁止（監査証跡の保全） |

---

## 4. 将来の拡張に関する備考

以下の機能は本フェーズでは実装しませんが、スキーマ設計時に拡張性を考慮しています。

- **`strategy_comments` テーブル**: `proposed` 状態のドキュメントに対するレビューコメント機能
- **`strategy_tags` テーブル**: ドキュメントのカテゴリ分類・タグ付け機能
- **`audit_logs` テーブル**: すべてのデータ変更操作の詳細な監査ログ
- **`author_id` の拡張**: AI生成時の `author_id` を専用のサービスアカウントIDとし、人間とAIの操作を明確に区別する仕組み
