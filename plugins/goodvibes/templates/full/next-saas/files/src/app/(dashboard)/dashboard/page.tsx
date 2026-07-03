import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
  });

  const isSubscribed = subscription?.status === 'ACTIVE';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {session.user.email}
              </span>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Welcome Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Welcome back, {session.user.name || 'User'}!
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              You&apos;re signed in as {session.user.email}
            </p>
          </div>

          {/* Subscription Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Subscription
            </h2>
            {isSubscribed ? (
              <div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  Active
                </span>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Renews on {subscription?.stripeCurrentPeriodEnd?.toLocaleDateString()}
                </p>
              </div>
            ) : (
              <div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                  Free Plan
                </span>
                <a
                  href="/pricing"
                  className="mt-4 block text-sm text-blue-600 hover:underline"
                >
                  Upgrade to Pro
                </a>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Quick Actions
            </h2>
            <div className="space-y-2">
              <a
                href="/settings"
                className="block px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Account Settings
              </a>
              <a
                href="/billing"
                className="block px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Billing & Plans
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
