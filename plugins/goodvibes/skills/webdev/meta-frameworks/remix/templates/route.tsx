// Remix Route Template
// Location: app/routes/[route-name].tsx

import { json, redirect } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { z } from "zod";

// ===========================================
// Types
// ===========================================

interface LoaderData {
  items: Array<{
    id: string;
    title: string;
    createdAt: string;
  }>;
  page: number;
  totalPages: number;
}

interface ActionData {
  errors?: {
    title?: string[];
    description?: string[];
  };
  success?: boolean;
}

// ===========================================
// Validation Schema
// ===========================================

const CreateItemSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  description: z.string().max(500).optional(),
});

// ===========================================
// Meta
// ===========================================

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [
    { title: "Items | My App" },
    { name: "description", content: "Manage your items" },
  ];
};

// ===========================================
// Loader
// ===========================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Parse search params
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = 10;

  // Fetch data
  // const items = await db.items.findMany({
  //   skip: (page - 1) * limit,
  //   take: limit,
  //   orderBy: { createdAt: "desc" },
  // });
  // const total = await db.items.count();

  // Placeholder data
  const items = [
    { id: "1", title: "Item 1", createdAt: new Date().toISOString() },
    { id: "2", title: "Item 2", createdAt: new Date().toISOString() },
  ];
  const total = 2;

  return json<LoaderData>({
    items,
    page,
    totalPages: Math.ceil(total / limit),
  });
};

// ===========================================
// Action
// ===========================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Handle different intents
  switch (intent) {
    case "create": {
      const result = CreateItemSchema.safeParse({
        title: formData.get("title"),
        description: formData.get("description"),
      });

      if (!result.success) {
        return json<ActionData>(
          { errors: result.error.flatten().fieldErrors },
          { status: 400 }
        );
      }

      // Create item
      // await db.items.create({ data: result.data });

      return json<ActionData>({ success: true });
    }

    case "delete": {
      const id = formData.get("id") as string;
      // await db.items.delete({ where: { id } });
      return json<ActionData>({ success: true });
    }

    default:
      throw new Response("Invalid intent", { status: 400 });
  }
};

// ===========================================
// Component
// ===========================================

export default function ItemsPage() {
  const { items, page, totalPages } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Items</h1>

      {/* Create Form */}
      <section className="mb-8 p-4 border rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Create New Item</h2>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="create" />

          <div>
            <label htmlFor="title" className="block text-sm font-medium">
              Title
            </label>
            <input
              type="text"
              id="title"
              name="title"
              className="mt-1 block w-full rounded border-gray-300 shadow-sm"
              disabled={isSubmitting}
            />
            {actionData?.errors?.title && (
              <p className="mt-1 text-sm text-red-600">
                {actionData.errors.title[0]}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              className="mt-1 block w-full rounded border-gray-300 shadow-sm"
              disabled={isSubmitting}
            />
            {actionData?.errors?.description && (
              <p className="mt-1 text-sm text-red-600">
                {actionData.errors.description[0]}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Item"}
          </button>
        </Form>
      </section>

      {/* Items List */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Your Items</h2>
        {items.length === 0 ? (
          <p className="text-gray-500">No items yet. Create one above!</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </ul>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex gap-2">
            {page > 1 && (
              <a
                href={`?page=${page - 1}`}
                className="px-3 py-1 border rounded"
              >
                Previous
              </a>
            )}
            <span className="px-3 py-1">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <a
                href={`?page=${page + 1}`}
                className="px-3 py-1 border rounded"
              >
                Next
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ===========================================
// Sub-Components
// ===========================================

function ItemCard({
  item,
}: {
  item: { id: string; title: string; createdAt: string };
}) {
  const navigation = useNavigation();
  const isDeleting =
    navigation.state === "submitting" &&
    navigation.formData?.get("id") === item.id;

  return (
    <li
      className={`p-4 border rounded-lg flex justify-between items-center ${
        isDeleting ? "opacity-50" : ""
      }`}
    >
      <div>
        <h3 className="font-medium">{item.title}</h3>
        <p className="text-sm text-gray-500">
          {new Date(item.createdAt).toLocaleDateString()}
        </p>
      </div>
      <Form method="post">
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="id" value={item.id} />
        <button
          type="submit"
          disabled={isDeleting}
          className="px-3 py-1 text-red-600 hover:bg-red-50 rounded"
        >
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
      </Form>
    </li>
  );
}

// ===========================================
// Error Boundary
// ===========================================

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-red-600 mb-4">
          {error.status} {error.statusText}
        </h1>
        <p className="text-gray-600">{error.data}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-red-600 mb-4">Error</h1>
      <p className="text-gray-600">
        {error instanceof Error ? error.message : "An unexpected error occurred"}
      </p>
    </div>
  );
}
