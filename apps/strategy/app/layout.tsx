import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: {
    default: 'Kiyomaro 経営戦略',
    template: '%s | Kiyomaro 経営戦略',
  },
  description: '合同会社SOCT 経営戦略ドキュメント管理システム',
}

const navbar = (
  <Navbar
    logo={
      <span style={{ fontWeight: 700 }}>
        🏯 Kiyomaro 経営戦略
      </span>
    }
  />
)

const footer = (
  <Footer>
    © {new Date().getFullYear()} 合同会社SOCT. All rights reserved.
  </Footer>
)

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="ja" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          footer={footer}
          sidebar={{ defaultMenuCollapseLevel: 1 }}
          editLink="ドキュメントを編集"
          feedback={{ content: null }}
          toc={{ title: '目次' }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
