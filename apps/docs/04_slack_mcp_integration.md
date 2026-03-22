# Slack MCP 連携仕様書

> **ドキュメントバージョン:** 1.0
> **最終更新日:** 2026-03-19
> **ステータス:** Draft

---

## 1. 概要

本ドキュメントでは、Kiyomaro システムにおける Slack MCP 連携の設計方針、チャンネル分類ロジック、および運用ガイドラインをまとめる。

### 1.1. 基本方針

Slack MCP は **読み取り専用** として利用し、月次経営分析レポートの情報源として Slack のチャンネル会話データを取得する。

| 操作 | 経路 | 許可 |
|:---|:---|:---:|
| チャンネル一覧・メッセージ参照 | MCP（`slack_get_channel_history` 等） | ✅ |
| メッセージ投稿・編集 | MCP（`slack_post_message` 等） | ❌ 原則不使用 |

### 1.2. 利用目的

| 用途 | 詳細 |
|:---|:---|
| **月次レポートの定性情報収集** | CS対応状況、営業パイプライン、プロジェクト進捗 |
| **チャンネル活動モニタリング** | アクティブチャンネルの定期分類と整理 |
| **経営判断のエビデンス取得** | 解約理由、顧客クレーム、決済エラーパターン |

---

## 2. MCP 接続構成

### 2.1. 接続方式

Slack MCP サーバー（`@anthropic/slack-mcp`）をローカルプロセスとして起動し、**User OAuth Token** で認証する。

**設定ファイル:** `.gemini/antigravity/mcp_config.json`（IDE レベル）

```json
{
  "slack": {
    "command": "npx",
    "args": ["-y", "@anthropic/slack-mcp"],
    "env": {
      "SLACK_BOT_TOKEN": "<User OAuth Token (xoxp-...)>",
      "SLACK_TEAM_ID": "T5W48MM55"
    }
  }
}
```

### 2.2. 認証トークン

| 項目 | 値 |
|:---|:---|
| トークン種別 | **User OAuth Token**（`xoxp-`） |
| Team ID | `T5W48MM55` |
| ワークスペース | SOCT（soct.slack.com） |

> **注意:** Bot Token（`xoxb-`）ではなく User OAuth Token を使用する。Bot Token では Bot が招待されたチャンネルしかアクセスできないが、User Token はユーザーが参加中の全チャンネル（プライベート含む）にアクセス可能。

### 2.3. 必要なスコープ

| スコープ | 用途 |
|:---|:---|
| `channels:history` | パブリックチャンネルのメッセージ取得 |
| `channels:read` | パブリックチャンネル一覧取得 |
| `groups:history` | プライベートチャンネルのメッセージ取得 |
| `groups:read` | プライベートチャンネル一覧取得 |
| `users:read` | ユーザー情報取得 |

---

## 3. チャンネル分類ロジック

### 3.1. 分類の2軸

| 軸 | 判定方法 |
|:---|:---|
| **アクティブ度** | 直近N日の人間メッセージ数（入退出・システムメッセージ除外） |
| **重要度** | 会話サンプルの内容分析（意思決定・顧客対応・財務 vs 通知・定型） |

### 3.2. 分類スクリプト

**ファイル:** `apps/tools/classify-slack-channels.js`

```bash
# 基本実行
node apps/tools/classify-slack-channels.js

# 期間変更
node apps/tools/classify-slack-channels.js --days 60

# JSON出力
node apps/tools/classify-slack-channels.js --format json
```

### 3.3. 処理フロー

```
Step 1: conversations.list?exclude_archived=true
  → 非アーカイブのチャンネル一覧を取得
  → is_member=true のチャンネルに絞る

Step 2: conversations.history?limit=20（各チャンネル）
  → oldest/latest パラメータは使用しない（API動作の信頼性問題のため）
  → 最新20件をそのまま取得

Step 3: クライアント側フィルタリング
  → 各メッセージのタイムスタンプを判定期間と比較
  → subtype で入退出・システムメッセージを除外
  → bot_id / subtype=bot_message でBot判定
  → 残りを人間メッセージとしてカウント
```

### 3.4. メッセージ分類ルール

| 分類 | 判定条件 |
|:---|:---|
| **システム（除外）** | subtype が `channel_join`, `channel_leave`, `channel_purpose`, `channel_topic`, `channel_name`, `channel_archive`, `channel_unarchive`, `group_join`, `group_leave`, `group_purpose`, `group_topic`, `group_name`, `tombstone`, `ekm_access_denied`, `pinned_item`, `unpinned_item` |
| **Bot** | `bot_id` が存在、または subtype が `bot_message` |
| **人間** | 上記いずれにも該当しない |

### 3.5. アクティブ度の閾値

| レベル | 人間メッセージ数/N日 |
|:---|:---|
| 🔥 高アクティブ | 15件以上 |
| 🟢 中アクティブ | 5〜14件 |
| 🟡 低アクティブ | 1〜4件 |
| ⚪ 非アクティブ | 0件 |

> **注意:** `limit=20` で取得しているため、高アクティブなチャンネルの実際のメッセージ数は20以上の可能性がある。正確な件数が必要な場合は limit を増やす。

---

## 4. API利用上の注意事項

### 4.1. レート制限

| API | Tier | 制限 | 推奨間隔 |
|:---|:---|:---|:---|
| `conversations.list` | Tier 2 | 20+回/分 | 3秒 |
| `conversations.history` | Tier 3 | 50+回/分 | 1.5秒 |

> **⚠️ 2025年5月以降の新規アプリ（Marketplace外）** は `conversations.history` が **1回/分、limit上限15** に制限される可能性がある。トークンがこの制限に該当する場合、大量スキャンは不可能。

### 4.2. 設計上の決定事項

| 決定 | 理由 |
|:---|:---|
| **`oldest` パラメータを使用しない** | API側のフィルタリングが不安定なケースがあったため、クライアント側でフィルタリング |
| **`exclude_archived=true` を使用** | アーカイブ済みチャンネルへの不要なAPIコールを削減（242ch → 104ch） |
| **`limit=20` で固定** | APIコール数を最小限にしつつ活動度判定に十分な件数 |
| **エラー時は `null` を返す** | 空配列 `[]`（0件）と区別し、失敗チャンネルを明示的に報告 |

### 4.3. `updated` フィールドについて

`conversations.list` のレスポンスに含まれる `updated` フィールドは、**チャンネルのメタデータ（topic/purpose 等）の最終更新日** であり、**最終メッセージのタイムスタンプではない**。メッセージ活動の事前フィルタには使用できない。

---

## 5. 出力ドキュメント

### 5.1. チャンネルマップ

**ファイル:** `apps/strategy/content/slack-channel-map.mdx`

分類スクリプトの実行結果を基に、以下の4カテゴリに分類して記載する。

| カテゴリ | 条件 |
|:---|:---|
| 🔴 最重要 | アクティブ × 重要な会話 |
| 🟢 低優先 | 低アクティブ × 通常の会話 |
| 🤖 Bot専用 | 人間メッセージ0 × Botメッセージあり |
| ⚪ 休眠 | 30日間メッセージなし |

### 5.2. 月次分析チェックリスト

チャンネルマップの末尾に、月次レポート作成時に優先的に確認すべきチャンネルを記載する。経営判断に直結する情報（解約・営業・決済・方針変更）を含むチャンネルを上位に配置する。
