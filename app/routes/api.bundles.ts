import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }: { request: Request }) {
  const { session } = await authenticate.admin(request);

  // Handle both possible shapes
  const shopDomain =
    (session as any).shop ||
    (session as any).shopDomain ||
    (session as any).destination ||
    "";

  const bundles = await prisma.bundle.findMany({
    where: {
      shopDomain,
    },
    orderBy: { createdAt: "desc" },
    include: {
      items: true,
      options: true,
    },
  });

  return new Response(JSON.stringify({ bundles }), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}
