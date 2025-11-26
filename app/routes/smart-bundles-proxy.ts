import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
// Optional later: import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Missing id" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const bundle = await prisma.bundle.findUnique({
      where: { id },
      include: {
        items: true,
        options: true,
      },
    });

    if (!bundle) {
      return new Response(
        JSON.stringify({ error: "Not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        id: bundle.id,
        title: bundle.title,
        description: bundle.description,
        items: bundle.items,
        options: bundle.options,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Proxy error:", err);
    return new Response(
      JSON.stringify({ error: "Server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
