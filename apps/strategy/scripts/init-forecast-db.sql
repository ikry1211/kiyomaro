-- SOCT 財務予測DB — スキーマ + 予算シートデータ
-- 使い方: sqlite3 apps/strategy/data/forecast.db < apps/strategy/scripts/init-forecast-db.sql

-- テーブル削除（再実行用）
DROP TABLE IF EXISTS baseline;
DROP TABLE IF EXISTS revenue_delta;
DROP TABLE IF EXISTS cost_delta;
DROP TABLE IF EXISTS borrowing;
DROP VIEW IF EXISTS monthly_summary;
DROP VIEW IF EXISTS quarterly_summary;
DROP VIEW IF EXISTS annual_summary;

-- ==============================
-- 1. ベースライン（予算シートの営業損益をそのまま）
-- ==============================
CREATE TABLE baseline (
  month TEXT PRIMARY KEY,
  operating_income INTEGER NOT NULL,
  total_revenue INTEGER,
  rakuco_revenue INTEGER,
  rakuco_customers INTEGER,
  note TEXT
);

-- 予算シート「月次損益」の営業損益行から直接転記（2026/4〜2027/9）
INSERT INTO baseline VALUES
  ('2026-04', -711259, 4823600, 1908000, 106, '予算シート(v2)'),
  ('2026-05', -553243, 5050400, 1962000, 109, '予算シート(v2)'),
  ('2026-06', -522139, 5086400, 1998000, 111, '予算シート(v2)'),
  ('2026-07', -475483, 5140400, 2052000, 114, '予算シート(v2)'),
  ('2026-08', -323527, 5194400, 2106000, 117, '予算シート(v2)'),
  ('2026-09', -274171, 5248400, 2160000, 120, '予算シート(v2)'),
  ('2026-10', -102589, 5187560, 2583000, 123, '予算シート(v2)値上げ¥21K込'),
  ('2026-11',  -45007, 5250560, 2646000, 126, '予算シート(v2)値上げ¥21K込'),
  ('2026-12',   12575, 5313560, 2709000, 129, '予算シート(v2)値上げ¥21K込'),
  ('2027-01',   70157, 5376560, 2772000, 132, '予算シート(v2)値上げ¥21K込'),
  ('2027-02',  127739, 5439560, 2835000, 135, '予算シート(v2)値上げ¥21K込'),
  ('2027-03',  185321, 5502560, 2898000, 138, '予算シート(v2)値上げ¥21K込'),
  ('2027-04',  242903, 5565560, 2961000, 141, '予算シート(v2)値上げ¥21K込'),
  ('2027-05',  300485, 5628560, 3024000, 144, '予算シート(v2)値上げ¥21K込'),
  ('2027-06',  358067, 5691560, 3087000, 147, '予算シート(v2)値上げ¥21K込'),
  ('2027-07',  415649, 5754560, 3150000, 150, '予算シート(v2)値上げ¥21K込'),
  ('2027-08',  473231, 5817560, 3213000, 153, '予算シート(v2)値上げ¥21K込'),
  ('2027-09',  530813, 5880560, 3276000, 156, '予算シート(v2)値上げ¥21K込');

-- 2027/10〜2029/3 は予算シート外 → 最終月の傾向で延伸
-- 月間改善額: 約¥58K/月（2027/4-9の平均）
INSERT INTO baseline VALUES
  ('2027-10',  589000, 5940000, 3339000, 159, '延伸推計(v2)'),
  ('2027-11',  647000, 6000000, 3402000, 162, '延伸推計(v2)'),
  ('2027-12',  705000, 6060000, 3465000, 165, '延伸推計(v2)'),
  ('2028-01',  763000, 6120000, 3528000, 168, '延伸推計(v2)'),
  ('2028-02',  821000, 6180000, 3591000, 171, '延伸推計(v2)'),
  ('2028-03',  879000, 6240000, 3654000, 174, '延伸推計(v2)'),
  ('2028-04',  937000, 6300000, 3717000, 177, '延伸推計(v2)'),
  ('2028-05',  995000, 6360000, 3780000, 180, '延伸推計(v2)'),
  ('2028-06', 1053000, 6420000, 3843000, 183, '延伸推計(v2)'),
  ('2028-07', 1111000, 6480000, 3906000, 186, '延伸推計(v2)'),
  ('2028-08', 1169000, 6540000, 3969000, 189, '延伸推計(v2)'),
  ('2028-09', 1227000, 6600000, 4032000, 192, '延伸推計(v2)'),
  ('2028-10', 1285000, 6660000, 4095000, 195, '延伸推計(v2)'),
  ('2028-11', 1343000, 6720000, 4158000, 198, '延伸推計(v2)'),
  ('2028-12', 1401000, 6780000, 4221000, 201, '延伸推計(v2)'),
  ('2029-01', 1459000, 6840000, 4284000, 204, '延伸推計(v2)'),
  ('2029-02', 1517000, 6900000, 4347000, 207, '延伸推計(v2)'),
  ('2029-03', 1575000, 6960000, 4410000, 210, '延伸推計(v2)');

-- ==============================
-- 2. 新規事業の売上予測（ベースラインへの加算）
-- ==============================
CREATE TABLE revenue_delta (
  month TEXT NOT NULL,
  business TEXT NOT NULL,
  amount INTEGER NOT NULL,
  customers INTEGER,
  note TEXT,
  PRIMARY KEY (month, business)
);

-- eラーニング（7月課金開始、初年度¥400/user×20人）
INSERT INTO revenue_delta VALUES
  ('2026-07', 'e_learning',   80000, 10, '10社×20人×¥400'),
  ('2026-08', 'e_learning',   96000, 12, '線形補間'),
  ('2026-09', 'e_learning',  104000, 13, '線形補間'),
  ('2026-10', 'e_learning',  120000, 15, '15社×20人×¥400'),
  ('2026-11', 'e_learning',  144000, 18, '線形補間'),
  ('2026-12', 'e_learning',  160000, 20, '線形補間'),
  ('2027-01', 'e_learning',  176000, 22, '22社'),
  ('2027-02', 'e_learning',  208000, 26, '線形補間'),
  ('2027-03', 'e_learning',  240000, 30, '30社×20人×¥400'),
  ('2027-04', 'e_learning',  240000, 30, '¥400維持'),
  ('2027-05', 'e_learning',  240000, 30, '¥400維持'),
  ('2027-06', 'e_learning',  240000, 30, '¥400維持'),
  ('2027-07', 'e_learning',  480000, 30, '定価移行¥800×30社'),
  ('2027-08', 'e_learning',  576000, 36, '外部拡大開始'),
  ('2027-09', 'e_learning',  640000, 40, NULL),
  ('2027-10', 'e_learning',  800000, 50, NULL),
  ('2027-11', 'e_learning',  960000, 60, NULL),
  ('2027-12', 'e_learning', 1120000, 70, NULL),
  ('2028-01', 'e_learning', 1280000, 80, NULL),
  ('2028-02', 'e_learning', 1360000, 85, NULL),
  ('2028-03', 'e_learning', 1440000, 90, NULL),
  ('2028-04', 'e_learning', 1440000, 90, NULL),
  ('2028-05', 'e_learning', 1520000, 95, NULL),
  ('2028-06', 'e_learning', 1600000, 100, NULL),
  ('2028-07', 'e_learning', 1760000, 110, NULL),
  ('2028-08', 'e_learning', 1920000, 120, NULL),
  ('2028-09', 'e_learning', 2080000, 130, NULL),
  ('2028-10', 'e_learning', 2240000, 140, NULL),
  ('2028-11', 'e_learning', 2400000, 150, NULL),
  ('2028-12', 'e_learning', 2400000, 150, NULL),
  ('2029-01', 'e_learning', 2560000, 160, NULL),
  ('2029-02', 'e_learning', 2560000, 160, NULL),
  ('2029-03', 'e_learning', 2560000, 160, NULL);

-- Rakuco成長加速（テレアポ増員効果 → 6ヶ月後有料転換）
-- ベースライン月3件 → 月6件に。追加3件×¥21K/社、チャーン2%反映
-- 2026/10開始（2026/4増員→6ヶ月後に効果発現）
INSERT INTO revenue_delta VALUES
  ('2026-10', 'rakuco_growth',   63000, 3, 'テレアポ増員効果+3件/月'),
  ('2026-11', 'rakuco_growth',  125000, 6, NULL),
  ('2026-12', 'rakuco_growth',  185000, 9, NULL),
  ('2027-01', 'rakuco_growth',  244000, 12, NULL),
  ('2027-02', 'rakuco_growth',  303000, 14, NULL),
  ('2027-03', 'rakuco_growth',  359000, 17, NULL),
  ('2027-04', 'rakuco_growth',  415000, 20, NULL),
  ('2027-05', 'rakuco_growth',  470000, 22, NULL),
  ('2027-06', 'rakuco_growth',  524000, 25, NULL),
  ('2027-07', 'rakuco_growth',  576000, 27, NULL),
  ('2027-08', 'rakuco_growth',  627000, 30, NULL),
  ('2027-09', 'rakuco_growth',  678000, 32, NULL),
  ('2027-10', 'rakuco_growth',  727000, 35, NULL),
  ('2027-11', 'rakuco_growth',  776000, 37, NULL),
  ('2027-12', 'rakuco_growth',  823000, 39, NULL),
  ('2028-01', 'rakuco_growth',  870000, 41, NULL),
  ('2028-02', 'rakuco_growth',  915000, 44, NULL),
  ('2028-03', 'rakuco_growth',  960000, 46, NULL),
  ('2028-04', 'rakuco_growth', 1004000, 48, NULL),
  ('2028-05', 'rakuco_growth', 1047000, 50, NULL),
  ('2028-06', 'rakuco_growth', 1089000, 52, NULL),
  ('2028-07', 'rakuco_growth', 1130000, 54, NULL),
  ('2028-08', 'rakuco_growth', 1170000, 56, NULL),
  ('2028-09', 'rakuco_growth', 1210000, 58, NULL),
  ('2028-10', 'rakuco_growth', 1249000, 60, NULL),
  ('2028-11', 'rakuco_growth', 1287000, 61, NULL),
  ('2028-12', 'rakuco_growth', 1324000, 63, NULL),
  ('2029-01', 'rakuco_growth', 1361000, 65, NULL),
  ('2029-02', 'rakuco_growth', 1396000, 66, NULL),
  ('2029-03', 'rakuco_growth', 1431000, 68, NULL);

-- Tetra LMS PF手数料
INSERT INTO revenue_delta VALUES
  ('2026-10', 'tetra_lms',  15000, NULL, 'テナント#2開始'),
  ('2027-01', 'tetra_lms',  78800, NULL, 'テナント#2フル運用'),
  ('2027-07', 'tetra_lms', 120000, NULL, 'テナント#3'),
  ('2028-01', 'tetra_lms', 180000, NULL, 'テナント#3-4'),
  ('2028-07', 'tetra_lms', 250000, NULL, 'テナント#4-5'),
  ('2029-01', 'tetra_lms', 350000, NULL, 'TAM調査後に判断');

-- はなえみダイレクト ① PF直接収益（成功報酬）
INSERT INTO revenue_delta VALUES
  ('2027-07', 'hanaemi_direct',  50000, NULL, 'ローンチ初期'),
  ('2028-01', 'hanaemi_direct', 100000, NULL, NULL),
  ('2028-07', 'hanaemi_direct', 200000, NULL, NULL),
  ('2029-01', 'hanaemi_direct', 300000, NULL, NULL);

-- はなえみ ② 定着支援連携（なから経由 SOCT取り分50%）
-- 既存20名×¥15K=¥300K → PF拡大で対象者増
-- 山田コストはRakucoベースラインに含まれており追加コストなし
INSERT INTO revenue_delta VALUES
  ('2026-07', 'hanaemi_teichaku', 300000, 20, 'β期間 既存20名×¥15K×50%'),
  ('2026-08', 'hanaemi_teichaku', 300000, 20, NULL),
  ('2026-09', 'hanaemi_teichaku', 300000, 20, NULL),
  ('2026-10', 'hanaemi_teichaku', 300000, 20, NULL),
  ('2026-11', 'hanaemi_teichaku', 300000, 20, NULL),
  ('2026-12', 'hanaemi_teichaku', 300000, 20, NULL),
  ('2027-01', 'hanaemi_teichaku', 300000, 20, NULL),
  ('2027-02', 'hanaemi_teichaku', 300000, 20, NULL),
  ('2027-03', 'hanaemi_teichaku', 300000, 20, NULL),
  ('2027-04', 'hanaemi_teichaku', 300000, 20, NULL),
  ('2027-05', 'hanaemi_teichaku', 300000, 20, NULL),
  ('2027-06', 'hanaemi_teichaku', 300000, 20, NULL),
  ('2027-07', 'hanaemi_teichaku', 450000, 30, '拡大期 PF経由で増加'),
  ('2027-08', 'hanaemi_teichaku', 450000, 30, NULL),
  ('2027-09', 'hanaemi_teichaku', 450000, 30, NULL),
  ('2027-10', 'hanaemi_teichaku', 450000, 30, NULL),
  ('2027-11', 'hanaemi_teichaku', 450000, 30, NULL),
  ('2027-12', 'hanaemi_teichaku', 450000, 30, NULL),
  ('2028-01', 'hanaemi_teichaku', 600000, 40, NULL),
  ('2028-02', 'hanaemi_teichaku', 600000, 40, NULL),
  ('2028-03', 'hanaemi_teichaku', 600000, 40, NULL),
  ('2028-04', 'hanaemi_teichaku', 600000, 40, NULL),
  ('2028-05', 'hanaemi_teichaku', 600000, 40, NULL),
  ('2028-06', 'hanaemi_teichaku', 600000, 40, NULL),
  ('2028-07', 'hanaemi_teichaku', 750000, 50, 'マネタイズ期'),
  ('2028-08', 'hanaemi_teichaku', 750000, 50, NULL),
  ('2028-09', 'hanaemi_teichaku', 750000, 50, NULL),
  ('2028-10', 'hanaemi_teichaku', 750000, 50, NULL),
  ('2028-11', 'hanaemi_teichaku', 750000, 50, NULL),
  ('2028-12', 'hanaemi_teichaku', 750000, 50, NULL),
  ('2029-01', 'hanaemi_teichaku', 750000, 50, NULL),
  ('2029-02', 'hanaemi_teichaku', 750000, 50, NULL),
  ('2029-03', 'hanaemi_teichaku', 750000, 50, NULL);

-- はなえみ ③ コンサル連携（株式会社はなえみ経由）
-- 増分¥800Kまで100%SOCT、超過分50/50
INSERT INTO revenue_delta VALUES
  ('2026-07', 'hanaemi_consul', 100000, NULL, 'β期間 コンサル転換開始'),
  ('2026-08', 'hanaemi_consul', 100000, NULL, NULL),
  ('2026-09', 'hanaemi_consul', 100000, NULL, NULL),
  ('2026-10', 'hanaemi_consul', 100000, NULL, NULL),
  ('2026-11', 'hanaemi_consul', 100000, NULL, NULL),
  ('2026-12', 'hanaemi_consul', 100000, NULL, NULL),
  ('2027-01', 'hanaemi_consul', 100000, NULL, NULL),
  ('2027-02', 'hanaemi_consul', 100000, NULL, NULL),
  ('2027-03', 'hanaemi_consul', 100000, NULL, NULL),
  ('2027-04', 'hanaemi_consul', 100000, NULL, NULL),
  ('2027-05', 'hanaemi_consul', 100000, NULL, NULL),
  ('2027-06', 'hanaemi_consul', 100000, NULL, NULL),
  ('2027-07', 'hanaemi_consul', 200000, NULL, '拡大期'),
  ('2027-08', 'hanaemi_consul', 200000, NULL, NULL),
  ('2027-09', 'hanaemi_consul', 200000, NULL, NULL),
  ('2027-10', 'hanaemi_consul', 200000, NULL, NULL),
  ('2027-11', 'hanaemi_consul', 200000, NULL, NULL),
  ('2027-12', 'hanaemi_consul', 200000, NULL, NULL),
  ('2028-01', 'hanaemi_consul', 300000, NULL, NULL),
  ('2028-02', 'hanaemi_consul', 300000, NULL, NULL),
  ('2028-03', 'hanaemi_consul', 300000, NULL, NULL),
  ('2028-04', 'hanaemi_consul', 300000, NULL, NULL),
  ('2028-05', 'hanaemi_consul', 300000, NULL, NULL),
  ('2028-06', 'hanaemi_consul', 300000, NULL, NULL),
  ('2028-07', 'hanaemi_consul', 400000, NULL, 'マネタイズ期'),
  ('2028-08', 'hanaemi_consul', 400000, NULL, NULL),
  ('2028-09', 'hanaemi_consul', 400000, NULL, NULL),
  ('2028-10', 'hanaemi_consul', 400000, NULL, NULL),
  ('2028-11', 'hanaemi_consul', 400000, NULL, NULL),
  ('2028-12', 'hanaemi_consul', 400000, NULL, NULL),
  ('2029-01', 'hanaemi_consul', 400000, NULL, NULL),
  ('2029-02', 'hanaemi_consul', 400000, NULL, NULL),
  ('2029-03', 'hanaemi_consul', 400000, NULL, NULL);

-- ==============================
-- 3. 新規事業のコスト（ベースラインからの減算）
-- ==============================
CREATE TABLE cost_delta (
  month TEXT NOT NULL,
  business TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  PRIMARY KEY (month, business)
);

-- eラーニングコスト = 固定¥70K（藤本）+ 売上×15%（Cloudflare+Stripe）
INSERT INTO cost_delta VALUES
  ('2026-04', 'e_learning',  -70000, '藤本のみ（課金前）'),
  ('2026-05', 'e_learning',  -70000, NULL),
  ('2026-06', 'e_learning',  -70000, NULL),
  ('2026-07', 'e_learning',  -82000, '¥70K+¥80K×15%'),
  ('2026-08', 'e_learning',  -85000, NULL),
  ('2026-09', 'e_learning',  -86000, NULL),
  ('2026-10', 'e_learning',  -88000, NULL),
  ('2026-11', 'e_learning',  -92000, NULL),
  ('2026-12', 'e_learning',  -94000, NULL),
  ('2027-01', 'e_learning',  -96000, NULL),
  ('2027-02', 'e_learning', -101000, NULL),
  ('2027-03', 'e_learning', -106000, NULL),
  ('2027-04', 'e_learning', -106000, NULL),
  ('2027-05', 'e_learning', -106000, NULL),
  ('2027-06', 'e_learning', -106000, NULL),
  ('2027-07', 'e_learning', -142000, '定価移行後'),
  ('2027-08', 'e_learning', -156000, NULL),
  ('2027-09', 'e_learning', -166000, NULL),
  ('2027-10', 'e_learning', -190000, NULL),
  ('2027-11', 'e_learning', -214000, NULL),
  ('2027-12', 'e_learning', -238000, NULL),
  ('2028-01', 'e_learning', -262000, NULL),
  ('2028-02', 'e_learning', -274000, NULL),
  ('2028-03', 'e_learning', -286000, NULL),
  ('2028-04', 'e_learning', -286000, NULL),
  ('2028-05', 'e_learning', -298000, NULL),
  ('2028-06', 'e_learning', -310000, NULL),
  ('2028-07', 'e_learning', -334000, NULL),
  ('2028-08', 'e_learning', -358000, NULL),
  ('2028-09', 'e_learning', -382000, NULL),
  ('2028-10', 'e_learning', -406000, NULL),
  ('2028-11', 'e_learning', -430000, NULL),
  ('2028-12', 'e_learning', -430000, NULL),
  ('2029-01', 'e_learning', -454000, NULL),
  ('2029-02', 'e_learning', -454000, NULL),
  ('2029-03', 'e_learning', -454000, NULL);

-- はなえみダイレクト開発・運用（2026/7〜 ¥100K固定）
INSERT INTO cost_delta VALUES
  ('2026-07', 'hanaemi_direct', -100000, '外部開発者'),
  ('2026-08', 'hanaemi_direct', -100000, NULL),
  ('2026-09', 'hanaemi_direct', -100000, NULL),
  ('2026-10', 'hanaemi_direct', -100000, NULL),
  ('2026-11', 'hanaemi_direct', -100000, NULL),
  ('2026-12', 'hanaemi_direct', -100000, NULL),
  ('2027-01', 'hanaemi_direct', -100000, NULL),
  ('2027-02', 'hanaemi_direct', -100000, NULL),
  ('2027-03', 'hanaemi_direct', -100000, NULL),
  ('2027-04', 'hanaemi_direct', -100000, NULL),
  ('2027-05', 'hanaemi_direct', -100000, NULL),
  ('2027-06', 'hanaemi_direct', -100000, NULL),
  ('2027-07', 'hanaemi_direct', -100000, NULL),
  ('2027-08', 'hanaemi_direct', -100000, NULL),
  ('2027-09', 'hanaemi_direct', -100000, NULL),
  ('2027-10', 'hanaemi_direct', -100000, NULL),
  ('2027-11', 'hanaemi_direct', -100000, NULL),
  ('2027-12', 'hanaemi_direct', -100000, NULL),
  ('2028-01', 'hanaemi_direct', -100000, NULL),
  ('2028-02', 'hanaemi_direct', -100000, NULL),
  ('2028-03', 'hanaemi_direct', -100000, NULL),
  ('2028-04', 'hanaemi_direct', -100000, NULL),
  ('2028-05', 'hanaemi_direct', -100000, NULL),
  ('2028-06', 'hanaemi_direct', -100000, NULL),
  ('2028-07', 'hanaemi_direct', -100000, NULL),
  ('2028-08', 'hanaemi_direct', -100000, NULL),
  ('2028-09', 'hanaemi_direct', -100000, NULL),
  ('2028-10', 'hanaemi_direct', -100000, NULL),
  ('2028-11', 'hanaemi_direct', -100000, NULL),
  ('2028-12', 'hanaemi_direct', -100000, NULL),
  ('2029-01', 'hanaemi_direct', -100000, NULL),
  ('2029-02', 'hanaemi_direct', -100000, NULL),
  ('2029-03', 'hanaemi_direct', -100000, NULL);

-- eラーニング外部拡大・営業コスト（2027/7〜 テレアポ2名+フォーム営業）
-- CPA¥38K × 月10社、トライアル→有料転換率60%想定
INSERT INTO cost_delta VALUES
  ('2027-07', 'e_learning_sales', -375000, 'テレアポ2名¥300K+フォーム¥75K'),
  ('2027-08', 'e_learning_sales', -375000, NULL),
  ('2027-09', 'e_learning_sales', -375000, NULL),
  ('2027-10', 'e_learning_sales', -375000, NULL),
  ('2027-11', 'e_learning_sales', -375000, NULL),
  ('2027-12', 'e_learning_sales', -375000, NULL),
  ('2028-01', 'e_learning_sales', -375000, NULL),
  ('2028-02', 'e_learning_sales', -375000, NULL),
  ('2028-03', 'e_learning_sales', -375000, NULL),
  ('2028-04', 'e_learning_sales', -375000, NULL),
  ('2028-05', 'e_learning_sales', -375000, NULL),
  ('2028-06', 'e_learning_sales', -375000, NULL),
  ('2028-07', 'e_learning_sales', -375000, NULL),
  ('2028-08', 'e_learning_sales', -375000, NULL),
  ('2028-09', 'e_learning_sales', -375000, NULL),
  ('2028-10', 'e_learning_sales', -375000, NULL),
  ('2028-11', 'e_learning_sales', -375000, NULL),
  ('2028-12', 'e_learning_sales', -375000, NULL),
  ('2029-01', 'e_learning_sales', -375000, NULL),
  ('2029-02', 'e_learning_sales', -375000, NULL),
  ('2029-03', 'e_learning_sales', -375000, NULL);

-- ==============================
-- 4. 借入情報
-- ==============================
CREATE TABLE borrowing (
  month TEXT PRIMARY KEY,
  principal_repayment INTEGER NOT NULL DEFAULT 812351,
  interest INTEGER NOT NULL,
  debt_balance INTEGER NOT NULL
);

-- 借入シートから（2026/4〜2027/9は実データ、以降は延伸）
INSERT INTO borrowing VALUES
  ('2026-04', 812351, 123246, 49829017),
  ('2026-05', 812351, 125257, 49016666),
  ('2026-06', 812351, 119186, 48204315),
  ('2026-07', 812351, 121062, 47391964),
  ('2026-08', 812351, 118964, 46579613),
  ('2026-09', 812351, 113096, 45767262),
  ('2026-10', 812351, 114769, 44954911),
  ('2026-11', 812351, 109036, 44142560),
  ('2026-12', 812351, 110573, 43330209),
  ('2027-01', 812351, 108476, 42517858),
  ('2027-02', 812351,  96083, 41705507),
  ('2027-03', 812351, 104280, 40893156),
  ('2027-04', 812351,  98886, 40080805),
  ('2027-05', 812351, 100085, 39268454),
  ('2027-06', 812351,  94826, 38456103),
  ('2027-07', 812351,  95889, 37643752),
  ('2027-08', 812351,  93792, 36831401),
  ('2027-09', 812351,  88736, 36019050);

-- 2027/10以降は月¥812K返済、利息は線形減少で延伸
INSERT INTO borrowing
SELECT
  printf('%04d-%02d',
    2027 + ((10 + seq - 1) - 1) / 12,
    ((10 + seq - 1 - 1) % 12) + 1
  ),
  812351,
  MAX(0, 85000 - seq * 2000),
  MAX(0, 36019050 - seq * 812351)
FROM (
  SELECT value as seq FROM json_each('[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]')
);

-- ==============================
-- 5. ビュー（集計）
-- ==============================

-- 月次サマリー（ベースライン + デルタ）
CREATE VIEW monthly_summary AS
WITH
  rev AS (
    SELECT month, SUM(amount) as total_new_revenue
    FROM revenue_delta
    GROUP BY month
  ),
  cost AS (
    SELECT month, SUM(amount) as total_new_cost
    FROM cost_delta
    GROUP BY month
  )
SELECT
  b.month,
  b.operating_income as baseline_oi,
  COALESCE(r.total_new_revenue, 0) as new_revenue,
  COALESCE(c.total_new_cost, 0) as new_cost,
  b.operating_income + COALESCE(r.total_new_revenue, 0) + COALESCE(c.total_new_cost, 0) as adjusted_oi,
  COALESCE(bw.interest, 0) as interest,
  b.operating_income + COALESCE(r.total_new_revenue, 0) + COALESCE(c.total_new_cost, 0) - COALESCE(bw.interest, 0) as ordinary_income,
  b.operating_income + COALESCE(r.total_new_revenue, 0) + COALESCE(c.total_new_cost, 0) - COALESCE(bw.interest, 0) - COALESCE(bw.principal_repayment, 0) as cash_flow,
  COALESCE(bw.debt_balance, 0) as debt_balance,
  b.rakuco_customers,
  b.note
FROM baseline b
LEFT JOIN rev r ON b.month = r.month
LEFT JOIN cost c ON b.month = c.month
LEFT JOIN borrowing bw ON b.month = bw.month
ORDER BY b.month;

-- 四半期サマリー
CREATE VIEW quarterly_summary AS
SELECT
  CASE
    WHEN substr(month,6,2) IN ('04','05','06') THEN substr(month,1,4) || '-Q1'
    WHEN substr(month,6,2) IN ('07','08','09') THEN substr(month,1,4) || '-Q2'
    WHEN substr(month,6,2) IN ('10','11','12') THEN substr(month,1,4) || '-Q3'
    ELSE printf('%04d', CAST(substr(month,1,4) AS INTEGER) - 1) || '-Q4'
  END as quarter,
  SUM(baseline_oi) as baseline_oi,
  SUM(new_revenue) as new_revenue,
  SUM(new_cost) as new_cost,
  SUM(adjusted_oi) as adjusted_oi,
  SUM(ordinary_income) as ordinary_income,
  SUM(cash_flow) as cash_flow
FROM monthly_summary
GROUP BY quarter
ORDER BY quarter;

-- 年度サマリー
CREATE VIEW annual_summary AS
SELECT
  CASE
    WHEN CAST(substr(month,6,2) AS INTEGER) >= 4
    THEN 'FY' || substr(month,1,4)
    ELSE 'FY' || printf('%04d', CAST(substr(month,1,4) AS INTEGER) - 1)
  END as fiscal_year,
  SUM(baseline_oi) as baseline_oi,
  SUM(new_revenue) as new_revenue,
  SUM(new_cost) as new_cost,
  SUM(adjusted_oi) as adjusted_oi,
  SUM(ordinary_income) as ordinary_income,
  SUM(cash_flow) as cash_flow
FROM monthly_summary
GROUP BY fiscal_year
ORDER BY fiscal_year;

-- BS（残高・純資産）— 期首データ + 累積CF
-- 期首（2026/3末）: 預金¥50,933,666 / その他資産¥7,200,000 / 純資産¥7,492,298
CREATE VIEW balance_sheet AS
SELECT
  m.month,
  50933666 + SUM(m2.cash_flow) as cash_balance,
  7200000 as other_assets,
  50933666 + SUM(m2.cash_flow) + 7200000 as total_assets,
  m.debt_balance,
  50933666 + SUM(m2.cash_flow) + 7200000 - m.debt_balance as net_assets,
  ROUND(CAST(50933666 + SUM(m2.cash_flow) + 7200000 - m.debt_balance AS REAL)
    / CAST(50933666 + SUM(m2.cash_flow) AS REAL) * 100, 1) as net_assets_ratio
FROM monthly_summary m
JOIN monthly_summary m2 ON m2.month <= m.month
GROUP BY m.month
ORDER BY m.month;

