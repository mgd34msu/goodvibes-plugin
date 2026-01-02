import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex justify-between items-center">
          <span className="text-xl font-bold text-gray-900 dark:text-white">
            SaaS App
          </span>
          <div className="flex gap-4">
            <Link
              href="/login"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Build your SaaS faster
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
            A complete starter template with authentication, payments, and
            everything you need to launch your next project.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/register"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Start for free
            </Link>
            <Link
              href="/pricing"
              className="px-6 py-3 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 font-medium"
            >
              View pricing
            </Link>
          </div>
        </div>

        <div className="mt-20 grid md:grid-cols-3 gap-8">
          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Authentication
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              NextAuth.js with multiple providers, JWT sessions, and role-based access.
            </p>
          </div>
          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Database
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Prisma ORM with PostgreSQL, MySQL, or SQLite support.
            </p>
          </div>
          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Payments
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Stripe subscriptions with checkout, webhooks, and billing portal.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
