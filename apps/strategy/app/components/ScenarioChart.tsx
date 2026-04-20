'use client'

import { useState, useEffect, Fragment } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Area, AreaChart, ReferenceLine
} from 'recharts'

// 型定義
type MonthlyData = {
  month: string
  adjusted_oi: number
  ordinary_income: number
  cash_flow: number
  new_revenue: number
  new_cost: number
  total_revenue: number
  cash_balance: number
  debt_balance: number
  net_assets: number
  net_assets_ratio: number
}

type AnnualData = {
  fiscal_year: string
  baseline_oi: number
  new_revenue: number
  new_cost: number
  adjusted_oi: number
  ordinary_income: number
  cash_flow: number
}

type Scenario = {
  label: string
  description: string
  monthly: MonthlyData[]
  annual: AnnualData[]
}

type ScenariosData = {
  generated: string
  scenarios: {
    conservative: Scenario
    realistic: Scenario
    ambitious: Scenario
  }
}

// 色定義
const COLORS = {
  conservative: '#94a3b8', // スレートグレー
  realistic: '#3b82f6',    // ブルー
  ambitious: '#f59e0b',    // アンバー
}

const SCENARIO_KEYS = ['conservative', 'realistic', 'ambitious'] as const
type ScenarioKey = typeof SCENARIO_KEYS[number]

// 指標定義
const METRICS = [
  { key: 'total_revenue', label: '売上高', unit: '千円' },
  { key: 'adjusted_oi', label: '営業損益', unit: '千円' },
  { key: 'cash_flow', label: 'キャッシュフロー', unit: '千円' },
  { key: 'cash_balance', label: '預金残高', unit: '千円' },
  { key: 'net_assets', label: '純資産', unit: '千円' },
  { key: 'debt_balance', label: '借入残高', unit: '千円' },
  { key: 'net_assets_ratio', label: '純資産比率', unit: '%' },
] as const

type MetricKey = typeof METRICS[number]['key']

// ¥フォーマッター
const formatYen = (val: number) => {
  if (Math.abs(val) >= 10000) return `¥${(val / 1000).toFixed(0)}K`
  return `¥${(val / 1000).toFixed(0)}K`
}

const formatPercent = (val: number) => `${val.toFixed(1)}%`

export default function ScenarioChart() {
  const [data, setData] = useState<ScenariosData | null>(null)
  const [activeMetric, setActiveMetric] = useState<MetricKey>('net_assets')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/scenarios.json')
      .then(res => {
        if (!res.ok) throw new Error('scenarios.json が見つかりません。bash scripts/build-scenarios.sh を実行してください。')
        return res.json()
      })
      .then(setData)
      .catch(e => setError(e.message))
  }, [])

  if (error) {
    return (
      <div style={{
        padding: '24px', background: '#fef2f2', border: '1px solid #fecaca',
        borderRadius: '8px', color: '#991b1b', margin: '16px 0'
      }}>
        <strong>⚠️ データ未生成:</strong> {error}
        <pre style={{ marginTop: '8px', fontSize: '13px', color: '#6b7280' }}>
          cd apps/strategy && bash scripts/build-scenarios.sh
        </pre>
      </div>
    )
  }

  if (!data) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>読み込み中...</div>
  }

  const currentMetric = METRICS.find(m => m.key === activeMetric)!
  const isPercent = currentMetric.unit === '%'

  // チャートデータを構築
  const chartData = data.scenarios.realistic.monthly.map((_, i) => {
    const row: Record<string, string | number> = {
      month: data.scenarios.realistic.monthly[i].month,
    }
    for (const sk of SCENARIO_KEYS) {
      const d = data.scenarios[sk].monthly[i]
      const val = d[activeMetric as keyof MonthlyData] as number
      row[sk] = isPercent ? val : Math.round(val / 1000) // 千円換算
    }
    return row
  })

  // 年度サマリーテーブル
  const annualRows = data.scenarios.realistic.annual.map((_, i) => {
    const row: Record<string, string | number> = {
      fy: data.scenarios.realistic.annual[i].fiscal_year,
    }
    for (const sk of SCENARIO_KEYS) {
      row[`${sk}_oi`] = data.scenarios[sk].annual[i].adjusted_oi
      row[`${sk}_income`] = data.scenarios[sk].annual[i].ordinary_income
    }
    return row
  })

  return (
    <div>
      {/* シナリオ概要 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px', marginBottom: '24px'
      }}>
        {SCENARIO_KEYS.map(sk => {
          const s = data.scenarios[sk]
          const lastBS = s.monthly[s.monthly.length - 1]
          return (
            <div key={sk} style={{
              padding: '16px', borderRadius: '8px',
              border: `2px solid ${COLORS[sk]}`,
              background: `${COLORS[sk]}11`
            }}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: COLORS[sk] }}>
                {s.label}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                {s.description}
              </div>
              <div style={{ fontWeight: 700, fontSize: '20px', marginTop: '8px' }}>
                ¥{(lastBS.net_assets / 1000000).toFixed(1)}M
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>
                FY2028末 純資産（税前）
              </div>
              <div style={{ fontSize: '13px', marginTop: '4px', color: COLORS[sk] }}>
                税引後: ¥{(lastBS.net_assets * 0.75 / 1000000).toFixed(1)}M
              </div>
            </div>
          )
        })}
      </div>

      {/* 指標切り替え */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px'
      }}>
        {METRICS.map(m => (
          <button
            key={m.key}
            onClick={() => setActiveMetric(m.key)}
            style={{
              padding: '6px 14px', borderRadius: '6px', fontSize: '13px',
              fontWeight: activeMetric === m.key ? 700 : 400,
              border: activeMetric === m.key ? '2px solid #3b82f6' : '1px solid #d1d5db',
              background: activeMetric === m.key ? '#eff6ff' : 'white',
              color: activeMetric === m.key ? '#1d4ed8' : '#374151',
              cursor: 'pointer',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* メインチャート */}
      <div style={{
        background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb',
        padding: '20px', marginBottom: '24px'
      }}>
        <h4 style={{ margin: '0 0 16px', fontSize: '15px', color: '#111827' }}>
          {currentMetric.label}（月次推移）
        </h4>
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={chartData}>
            <defs>
              {SCENARIO_KEYS.map(sk => (
                <linearGradient key={sk} id={`grad-${sk}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[sk]} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={COLORS[sk]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="month" fontSize={11} tickMargin={8}
              tickFormatter={(v: string) => `${v.slice(2, 4)}/${v.slice(5)}`}
            />
            <YAxis
              fontSize={11} tickMargin={8}
              tickFormatter={(v: number) => isPercent ? `${v}%` : `¥${v}K`}
            />
            <Tooltip
              formatter={(value, name) => {
                const label = data.scenarios[name as ScenarioKey]?.label || String(name)
                return [isPercent ? formatPercent(Number(value)) : `¥${Number(value).toLocaleString()}K`, label]
              }}
              labelFormatter={(label) => String(label)}
            />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} />
            {SCENARIO_KEYS.map(sk => (
              <Area
                key={sk}
                type="monotone"
                dataKey={sk}
                stroke={COLORS[sk]}
                strokeWidth={sk === 'realistic' ? 3 : 2}
                fill={`url(#grad-${sk})`}
                fillOpacity={sk === 'ambitious' ? 0.3 : 0.1}
                dot={false}
                name={sk}
              />
            ))}
            <Legend
              formatter={(value: string) => data.scenarios[value as ScenarioKey]?.label || value}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 年度サマリーテーブル */}
      <div style={{
        background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb',
        padding: '20px', overflowX: 'auto'
      }}>
        <h4 style={{ margin: '0 0 16px', fontSize: '15px', color: '#111827' }}>
          年度サマリー比較
        </h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '8px', textAlign: 'left' }}>年度</th>
              {SCENARIO_KEYS.map(sk => (
                <th key={sk} colSpan={2} style={{
                  padding: '8px', textAlign: 'center',
                  color: COLORS[sk], borderBottom: `3px solid ${COLORS[sk]}`
                }}>
                  {data.scenarios[sk].label}
                </th>
              ))}
            </tr>
            <tr style={{ borderBottom: '1px solid #e5e7eb', fontSize: '11px', color: '#6b7280' }}>
              <td style={{ padding: '4px 8px' }}></td>
              {SCENARIO_KEYS.map(sk => (
                <Fragment key={`${sk}-header`}>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>営業損益</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>経常利益</td>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {annualRows.map((row) => (
              <tr key={row.fy as string} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px', fontWeight: 600 }}>{row.fy}</td>
                {SCENARIO_KEYS.map(sk => (
                  <Fragment key={`${sk}-${row.fy}`}>
                    <td style={{
                      padding: '8px', textAlign: 'right',
                      color: (row[`${sk}_oi`] as number) >= 0 ? '#059669' : '#dc2626'
                    }}>
                      ¥{((row[`${sk}_oi`] as number) / 1000).toFixed(0)}K
                    </td>
                    <td style={{
                      padding: '8px', textAlign: 'right',
                      color: (row[`${sk}_income`] as number) >= 0 ? '#059669' : '#dc2626'
                    }}>
                      ¥{((row[`${sk}_income`] as number) / 1000).toFixed(0)}K
                    </td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 生成日時 */}
      <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '16px', textAlign: 'right' }}>
        データ生成: {data.generated} ｜ ソース: SQLite forecast DB
      </p>
    </div>
  )
}
