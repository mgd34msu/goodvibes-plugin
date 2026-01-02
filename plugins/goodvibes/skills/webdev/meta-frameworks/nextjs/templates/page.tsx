// Next.js Page Component Template
// Location: app/[route]/page.tsx

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

// Types
interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// Static Metadata
export const metadata: Metadata = {
  title: 'Page Title',
  description: 'Page description for SEO',
}

// OR Dynamic Metadata
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  // const data = await getData(slug)

  return {
    title: `Dynamic Title - ${slug}`,
    description: 'Dynamic description',
    openGraph: {
      title: `Dynamic Title - ${slug}`,
      images: ['/og-image.png'],
    },
  }
}

// Static Generation (optional)
export async function generateStaticParams() {
  // const items = await getItems()
  // return items.map((item) => ({ slug: item.slug }))
  return [{ slug: 'example' }]
}

// Route Segment Config (optional)
// export const dynamic = 'force-dynamic'
// export const revalidate = 3600

// Page Component
export default async function Page({ params, searchParams }: PageProps) {
  const { slug } = await params
  const query = await searchParams

  // Fetch data
  // const data = await getData(slug)

  // Handle not found
  // if (!data) {
  //   notFound()
  // }

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Page: {slug}</h1>

      {/* Static content renders immediately */}
      <section className="mb-8">
        <p>Search query: {query.q ?? 'none'}</p>
      </section>

      {/* Async content with streaming */}
      <Suspense fallback={<LoadingSkeleton />}>
        <AsyncContent slug={slug} />
      </Suspense>
    </main>
  )
}

// Async Component (streams when ready)
async function AsyncContent({ slug }: { slug: string }) {
  // const data = await fetchData(slug)

  return (
    <section>
      <h2 className="text-xl font-semibold mb-4">Content for {slug}</h2>
      {/* Render data */}
    </section>
  )
}

// Loading Skeleton
function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 bg-gray-200 rounded w-1/4" />
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
    </div>
  )
}
