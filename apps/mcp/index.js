/**
 * Kiyomaro MCP サーバー（stdio 方式）
 *
 * Google Sheets のスプレッドシートを読み取るツールを提供する。
 * サービスアカウント認証を使用。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

// プロジェクトルートからの相対パスでサービスアカウントキーを解決
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SERVICE_ACCOUNT_PATH =
  process.env.SERVICE_ACCOUNT_PATH ||
  path.join(PROJECT_ROOT, '.secrets', 'google-service-account.json');

// Google API 認証
function getAuth() {
  return new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_PATH,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  });
}

// MCPサーバーの作成
const server = new McpServer({
  name: 'kiyomaro-sheets',
  version: '0.1.0',
});

// ツール1: 共有されたスプレッドシート一覧
server.tool(
  'list_spreadsheets',
  '共有されたすべてのスプレッドシートの一覧を取得する',
  {},
  async () => {
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: 'files(id, name, modifiedTime, webViewLink)',
      orderBy: 'modifiedTime desc',
    });

    const files = res.data.files || [];
    const result = files.map((f) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      url: f.webViewLink,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ツール2: スプレッドシートの情報取得（シート一覧）
server.tool(
  'get_sheet_info',
  'スプレッドシートのメタデータ（シート名一覧・プロパティ）を取得する',
  {
    spreadsheet_id: z.string().describe('スプレッドシートのID'),
  },
  async ({ spreadsheet_id }) => {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const meta = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheet_id,
      fields: 'properties.title,sheets.properties',
    });

    const result = {
      title: meta.data.properties?.title,
      sheets: meta.data.sheets?.map((s) => ({
        title: s.properties?.title,
        index: s.properties?.index,
        rowCount: s.properties?.gridProperties?.rowCount,
        columnCount: s.properties?.gridProperties?.columnCount,
      })),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ツール3: シートのデータ読み取り
server.tool(
  'read_sheet',
  'スプレッドシートの特定シート・範囲のデータを読み取る',
  {
    spreadsheet_id: z.string().describe('スプレッドシートのID'),
    range: z
      .string()
      .describe('読み取る範囲（例: "月次損益!A1:P50"、シート名のみも可）'),
  },
  async ({ spreadsheet_id, range }) => {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheet_id,
      range,
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = res.data.values || [];

    // Markdownテーブル形式に整形
    let markdown = '';
    if (rows.length > 0) {
      // ヘッダー行
      const maxCols = Math.max(...rows.map((r) => r.length));
      const header = rows[0];
      markdown += '| ' + header.map((c) => String(c || '')).join(' | ') + ' |\n';
      markdown += '|' + header.map(() => '---').join('|') + '|\n';

      // データ行
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cells = [];
        for (let j = 0; j < maxCols; j++) {
          cells.push(String(row[j] ?? ''));
        }
        markdown += '| ' + cells.join(' | ') + ' |\n';
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `## ${range}\n\n${markdown}\n\n（${rows.length} 行）`,
        },
      ],
    };
  }
);

// サーバー起動
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP サーバー起動エラー:', err);
  process.exit(1);
});
