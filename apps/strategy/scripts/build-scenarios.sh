#!/bin/bash
# 財務予測 シナリオ比較ビルダー
# 使い方: bash scripts/build-scenarios.sh
set -e
cd "$(dirname "$0")/.."

BASE_SQL="scripts/init-forecast-db.sql"
DB_DIR="data"
PUBLIC_DIR="public"
mkdir -p "$DB_DIR" "$PUBLIC_DIR"

echo "=== シナリオA: 保守的（②③なし） ==="
rm -f "$DB_DIR/forecast-conservative.db"
sqlite3 "$DB_DIR/forecast-conservative.db" < "$BASE_SQL"
sqlite3 "$DB_DIR/forecast-conservative.db" "
DELETE FROM revenue_delta WHERE business IN ('hanaemi_teichaku', 'hanaemi_consul', 'rakuco_growth');
"

echo "=== シナリオB: 現実的（②③あり） ==="
rm -f "$DB_DIR/forecast-realistic.db"
sqlite3 "$DB_DIR/forecast-realistic.db" < "$BASE_SQL"

echo "=== シナリオC: 野心的（加速成長） ==="
rm -f "$DB_DIR/forecast-ambitious.db"
sqlite3 "$DB_DIR/forecast-ambitious.db" < "$BASE_SQL"

# --- Rakuco加速: テレアポ1名追加 → +3社/月 ---
sqlite3 "$DB_DIR/forecast-ambitious.db" "
INSERT INTO revenue_delta VALUES
  ('2026-07', 'rakuco_accel',   63000, 3, '+3社/月 テレアポ追加'),
  ('2026-08', 'rakuco_accel',  125000, 6, NULL),
  ('2026-09', 'rakuco_accel',  185000, 9, NULL),
  ('2026-10', 'rakuco_accel',  244000, 12, NULL),
  ('2026-11', 'rakuco_accel',  303000, 14, NULL),
  ('2026-12', 'rakuco_accel',  359000, 17, NULL),
  ('2027-01', 'rakuco_accel',  415000, 20, NULL),
  ('2027-02', 'rakuco_accel',  470000, 22, NULL),
  ('2027-03', 'rakuco_accel',  524000, 25, NULL),
  ('2027-04', 'rakuco_accel',  576000, 27, NULL),
  ('2027-05', 'rakuco_accel',  627000, 30, NULL),
  ('2027-06', 'rakuco_accel',  678000, 32, NULL),
  ('2027-07', 'rakuco_accel',  727000, 35, NULL),
  ('2027-08', 'rakuco_accel',  776000, 37, NULL),
  ('2027-09', 'rakuco_accel',  823000, 39, NULL),
  ('2027-10', 'rakuco_accel',  870000, 41, NULL),
  ('2027-11', 'rakuco_accel',  915000, 44, NULL),
  ('2027-12', 'rakuco_accel',  960000, 46, NULL),
  ('2028-01', 'rakuco_accel', 1004000, 48, NULL),
  ('2028-02', 'rakuco_accel', 1047000, 50, NULL),
  ('2028-03', 'rakuco_accel', 1089000, 52, NULL),
  ('2028-04', 'rakuco_accel', 1130000, 54, NULL),
  ('2028-05', 'rakuco_accel', 1170000, 56, NULL),
  ('2028-06', 'rakuco_accel', 1210000, 58, NULL),
  ('2028-07', 'rakuco_accel', 1249000, 60, NULL),
  ('2028-08', 'rakuco_accel', 1287000, 61, NULL),
  ('2028-09', 'rakuco_accel', 1324000, 63, NULL),
  ('2028-10', 'rakuco_accel', 1361000, 65, NULL),
  ('2028-11', 'rakuco_accel', 1396000, 66, NULL),
  ('2028-12', 'rakuco_accel', 1431000, 68, NULL),
  ('2029-01', 'rakuco_accel', 1466000, 70, NULL),
  ('2029-02', 'rakuco_accel', 1499000, 71, NULL),
  ('2029-03', 'rakuco_accel', 1532000, 73, NULL);

INSERT INTO cost_delta VALUES
  ('2026-07', 'rakuco_sales', -150000, 'テレアポ1名追加'),
  ('2026-08', 'rakuco_sales', -150000, NULL),
  ('2026-09', 'rakuco_sales', -150000, NULL),
  ('2026-10', 'rakuco_sales', -150000, NULL),
  ('2026-11', 'rakuco_sales', -150000, NULL),
  ('2026-12', 'rakuco_sales', -150000, NULL),
  ('2027-01', 'rakuco_sales', -150000, NULL),
  ('2027-02', 'rakuco_sales', -150000, NULL),
  ('2027-03', 'rakuco_sales', -150000, NULL),
  ('2027-04', 'rakuco_sales', -150000, NULL),
  ('2027-05', 'rakuco_sales', -150000, NULL),
  ('2027-06', 'rakuco_sales', -150000, NULL),
  ('2027-07', 'rakuco_sales', -150000, NULL),
  ('2027-08', 'rakuco_sales', -150000, NULL),
  ('2027-09', 'rakuco_sales', -150000, NULL),
  ('2027-10', 'rakuco_sales', -150000, NULL),
  ('2027-11', 'rakuco_sales', -150000, NULL),
  ('2027-12', 'rakuco_sales', -150000, NULL),
  ('2028-01', 'rakuco_sales', -150000, NULL),
  ('2028-02', 'rakuco_sales', -150000, NULL),
  ('2028-03', 'rakuco_sales', -150000, NULL),
  ('2028-04', 'rakuco_sales', -150000, NULL),
  ('2028-05', 'rakuco_sales', -150000, NULL),
  ('2028-06', 'rakuco_sales', -150000, NULL),
  ('2028-07', 'rakuco_sales', -150000, NULL),
  ('2028-08', 'rakuco_sales', -150000, NULL),
  ('2028-09', 'rakuco_sales', -150000, NULL),
  ('2028-10', 'rakuco_sales', -150000, NULL),
  ('2028-11', 'rakuco_sales', -150000, NULL),
  ('2028-12', 'rakuco_sales', -150000, NULL),
  ('2029-01', 'rakuco_sales', -150000, NULL),
  ('2029-02', 'rakuco_sales', -150000, NULL),
  ('2029-03', 'rakuco_sales', -150000, NULL);
"

# --- eラーニング加速: 160社→400社 ---
sqlite3 "$DB_DIR/forecast-ambitious.db" "
DELETE FROM revenue_delta WHERE business = 'e_learning' AND month >= '2027-07';
INSERT INTO revenue_delta VALUES
  ('2027-07', 'e_learning',  480000, 30, '定価移行 月+20社ペース'),
  ('2027-08', 'e_learning',  800000, 50, NULL),
  ('2027-09', 'e_learning', 1120000, 70, NULL),
  ('2027-10', 'e_learning', 1440000, 90, NULL),
  ('2027-11', 'e_learning', 1760000, 110, NULL),
  ('2027-12', 'e_learning', 2080000, 130, NULL),
  ('2028-01', 'e_learning', 2400000, 150, NULL),
  ('2028-02', 'e_learning', 2720000, 170, NULL),
  ('2028-03', 'e_learning', 3040000, 190, NULL),
  ('2028-04', 'e_learning', 3360000, 210, NULL),
  ('2028-05', 'e_learning', 3680000, 230, NULL),
  ('2028-06', 'e_learning', 4000000, 250, NULL),
  ('2028-07', 'e_learning', 4320000, 270, NULL),
  ('2028-08', 'e_learning', 4640000, 290, NULL),
  ('2028-09', 'e_learning', 4960000, 310, NULL),
  ('2028-10', 'e_learning', 5280000, 330, NULL),
  ('2028-11', 'e_learning', 5600000, 350, NULL),
  ('2028-12', 'e_learning', 5920000, 370, NULL),
  ('2029-01', 'e_learning', 6240000, 390, NULL),
  ('2029-02', 'e_learning', 6400000, 400, NULL),
  ('2029-03', 'e_learning', 6400000, 400, NULL);

DELETE FROM cost_delta WHERE business = 'e_learning' AND month >= '2027-07';
INSERT INTO cost_delta VALUES
  ('2027-07', 'e_learning',  -142000, '¥70K+売上×15%'),
  ('2027-08', 'e_learning',  -190000, NULL),
  ('2027-09', 'e_learning',  -238000, NULL),
  ('2027-10', 'e_learning',  -286000, NULL),
  ('2027-11', 'e_learning',  -334000, NULL),
  ('2027-12', 'e_learning',  -382000, NULL),
  ('2028-01', 'e_learning',  -430000, NULL),
  ('2028-02', 'e_learning',  -478000, NULL),
  ('2028-03', 'e_learning',  -526000, NULL),
  ('2028-04', 'e_learning',  -574000, NULL),
  ('2028-05', 'e_learning',  -622000, NULL),
  ('2028-06', 'e_learning',  -670000, NULL),
  ('2028-07', 'e_learning',  -718000, NULL),
  ('2028-08', 'e_learning',  -766000, NULL),
  ('2028-09', 'e_learning',  -814000, NULL),
  ('2028-10', 'e_learning',  -862000, NULL),
  ('2028-11', 'e_learning',  -910000, NULL),
  ('2028-12', 'e_learning',  -958000, NULL),
  ('2029-01', 'e_learning', -1006000, NULL),
  ('2029-02', 'e_learning', -1030000, NULL),
  ('2029-03', 'e_learning', -1030000, NULL);

UPDATE cost_delta SET amount = -750000
  WHERE business = 'e_learning_sales' AND month >= '2027-07';
"

# ==============================
# JSON出力（Nextra可視化用）
# ==============================
echo "=== JSON出力 ==="

QUERY="
SELECT json_group_array(json_object(
  'month', m.month,
  'adjusted_oi', m.adjusted_oi,
  'ordinary_income', m.ordinary_income,
  'cash_flow', m.cash_flow,
  'new_revenue', m.new_revenue,
  'new_cost', m.new_cost,
  'total_revenue', bl.total_revenue + COALESCE(rd.delta_rev, 0),
  'cash_balance', b.cash_balance,
  'debt_balance', b.debt_balance,
  'net_assets', b.net_assets,
  'net_assets_ratio', b.net_assets_ratio
))
FROM monthly_summary m
JOIN balance_sheet b ON m.month = b.month
JOIN baseline bl ON m.month = bl.month
LEFT JOIN (
  SELECT month, SUM(amount) as delta_rev FROM revenue_delta GROUP BY month
) rd ON m.month = rd.month;
"

# 各シナリオのJSONを生成
CON_JSON=$(sqlite3 "$DB_DIR/forecast-conservative.db" "$QUERY")
REA_JSON=$(sqlite3 "$DB_DIR/forecast-realistic.db" "$QUERY")
AMB_JSON=$(sqlite3 "$DB_DIR/forecast-ambitious.db" "$QUERY")

# 年度サマリー
ANNUAL_QUERY="
SELECT json_group_array(json_object(
  'fiscal_year', fiscal_year,
  'baseline_oi', baseline_oi,
  'new_revenue', new_revenue,
  'new_cost', new_cost,
  'adjusted_oi', adjusted_oi,
  'ordinary_income', ordinary_income,
  'cash_flow', cash_flow
))
FROM annual_summary;
"

CON_ANN=$(sqlite3 "$DB_DIR/forecast-conservative.db" "$ANNUAL_QUERY")
REA_ANN=$(sqlite3 "$DB_DIR/forecast-realistic.db" "$ANNUAL_QUERY")
AMB_ANN=$(sqlite3 "$DB_DIR/forecast-ambitious.db" "$ANNUAL_QUERY")

cat > "$PUBLIC_DIR/scenarios.json" << JSONEOF
{
  "generated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "scenarios": {
    "conservative": {
      "label": "A: 保守的",
      "description": "②③連携なし。eラーニング160社、Rakucoベースライン成長のみ",
      "monthly": ${CON_JSON},
      "annual": ${CON_ANN}
    },
    "realistic": {
      "label": "B: 現実的",
      "description": "②定着支援+③コンサル あり。eラーニング160社、Rakucoベースライン成長",
      "monthly": ${REA_JSON},
      "annual": ${REA_ANN}
    },
    "ambitious": {
      "label": "C: 野心的",
      "description": "②③あり + eラーニング400社 + Rakucoテレアポ追加(+3社/月)",
      "monthly": ${AMB_JSON},
      "annual": ${AMB_ANN}
    }
  }
}
JSONEOF

echo "✅ $PUBLIC_DIR/scenarios.json を出力しました"
echo ""

# --- ターミナル比較出力 ---
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║              3カ年 財務予測シナリオ比較                         ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

for scenario in conservative realistic ambitious; do
  DB="$DB_DIR/forecast-${scenario}.db"
  case $scenario in
    conservative) label="A: 保守的" ;;
    realistic)    label="B: 現実的" ;;
    ambitious)    label="C: 野心的" ;;
  esac
  echo "━━━ ${label} ━━━"
  sqlite3 -header -column "$DB" "SELECT * FROM annual_summary;"
  echo ""
done

echo "━━━ シナリオ比較サマリー ━━━"
printf "%-14s%-16s%-16s%-16s\n" "指標" "A:保守的" "B:現実的" "C:野心的"
echo "────────────────────────────────────────────────────────────"
for fy in FY2026 FY2027 FY2028; do
  printf "%-14s" "${fy}営業損益"
  for scenario in conservative realistic ambitious; do
    DB="$DB_DIR/forecast-${scenario}.db"
    val=$(sqlite3 "$DB" "SELECT printf('¥%,dK', adjusted_oi/1000) FROM annual_summary WHERE fiscal_year='${fy}';")
    printf "%-16s" "$val"
  done
  echo ""
done
echo ""
printf "%-14s" "FY2028末純資産"
for scenario in conservative realistic ambitious; do
  DB="$DB_DIR/forecast-${scenario}.db"
  val=$(sqlite3 "$DB" "SELECT printf('¥%,dK', net_assets/1000) FROM balance_sheet WHERE month='2029-03';")
  printf "%-16s" "$val"
done
echo ""
echo ""
echo "※ 税引前の数値。法人税25%適用後は約75%"
