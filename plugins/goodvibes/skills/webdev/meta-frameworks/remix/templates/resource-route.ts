// Remix Resource Route Template (API Endpoint)
// Location: app/routes/api.[resource-name].ts
// No default export = no UI, just loader/action

import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { z } from "zod";

// ===========================================
// Types
// ===========================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
}

// ===========================================
// Validation Schemas
// ===========================================

const CreateItemSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  tags: z.array(z.string()).optional(),
});

const UpdateItemSchema = CreateItemSchema.partial();

// ===========================================
// Helper: Require Authentication
// ===========================================

async function requireAuth(request: Request) {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw json<ApiResponse<null>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);

  // Verify token
  // const user = await verifyToken(token);
  // if (!user) {
  //   throw json<ApiResponse<null>>(
  //     { success: false, error: "Invalid token" },
  //     { status: 401 }
  //   );
  // }

  return { userId: "user-123" }; // Placeholder
}

// ===========================================
// GET /api/items
// ===========================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Parse query params
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(100, Number(url.searchParams.get("limit")) || 10);
  const search = url.searchParams.get("q") ?? "";

  try {
    // Fetch from database
    // const items = await db.items.findMany({
    //   where: search ? { title: { contains: search } } : undefined,
    //   skip: (page - 1) * limit,
    //   take: limit,
    //   orderBy: { createdAt: "desc" },
    // });
    // const total = await db.items.count({
    //   where: search ? { title: { contains: search } } : undefined,
    // });

    // Placeholder data
    const items = [
      { id: "1", title: "Item 1", createdAt: new Date().toISOString() },
      { id: "2", title: "Item 2", createdAt: new Date().toISOString() },
    ];
    const total = 2;

    return json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Failed to fetch items:", error);
    return json<ApiResponse<null>>(
      { success: false, error: "Failed to fetch items" },
      { status: 500 }
    );
  }
};

// ===========================================
// POST /api/items
// PUT /api/items (with id in body)
// DELETE /api/items (with id in body)
// ===========================================

export const action = async ({ request }: ActionFunctionArgs) => {
  // Require authentication for mutations
  const { userId } = await requireAuth(request);

  const method = request.method.toUpperCase();

  try {
    switch (method) {
      // -----------------------------------------
      // POST - Create new item
      // -----------------------------------------
      case "POST": {
        const body = await request.json();
        const result = CreateItemSchema.safeParse(body);

        if (!result.success) {
          return json<ApiResponse<null>>(
            {
              success: false,
              error: "Validation failed",
              errors: result.error.flatten().fieldErrors,
            },
            { status: 400 }
          );
        }

        // Create item
        // const item = await db.items.create({
        //   data: { ...result.data, userId },
        // });

        const item = {
          id: "new-id",
          ...result.data,
          userId,
          createdAt: new Date().toISOString(),
        };

        return json(
          { success: true, data: item },
          { status: 201 }
        );
      }

      // -----------------------------------------
      // PUT - Update existing item
      // -----------------------------------------
      case "PUT": {
        const body = await request.json();
        const { id, ...data } = body;

        if (!id) {
          return json<ApiResponse<null>>(
            { success: false, error: "Item ID required" },
            { status: 400 }
          );
        }

        const result = UpdateItemSchema.safeParse(data);

        if (!result.success) {
          return json<ApiResponse<null>>(
            {
              success: false,
              error: "Validation failed",
              errors: result.error.flatten().fieldErrors,
            },
            { status: 400 }
          );
        }

        // Update item
        // const item = await db.items.update({
        //   where: { id, userId }, // Ensure ownership
        //   data: result.data,
        // });

        const item = { id, ...result.data, updatedAt: new Date().toISOString() };

        return json({ success: true, data: item });
      }

      // -----------------------------------------
      // DELETE - Remove item
      // -----------------------------------------
      case "DELETE": {
        const body = await request.json();
        const { id } = body;

        if (!id) {
          return json<ApiResponse<null>>(
            { success: false, error: "Item ID required" },
            { status: 400 }
          );
        }

        // Delete item
        // await db.items.delete({
        //   where: { id, userId }, // Ensure ownership
        // });

        return json({ success: true, data: { id } });
      }

      default:
        return json<ApiResponse<null>>(
          { success: false, error: `Method ${method} not allowed` },
          { status: 405 }
        );
    }
  } catch (error) {
    console.error(`API Error [${method}]:`, error);

    // Handle specific errors
    // if (error instanceof Prisma.PrismaClientKnownRequestError) {
    //   if (error.code === "P2025") {
    //     return json<ApiResponse<null>>(
    //       { success: false, error: "Item not found" },
    //       { status: 404 }
    //     );
    //   }
    // }

    return json<ApiResponse<null>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
};

// ===========================================
// CORS Headers (if needed for cross-origin)
// ===========================================

// Add this if the API needs to be accessed from other domains:
/*
export const headers = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

// Handle preflight requests
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  // ... rest of loader
};
*/
