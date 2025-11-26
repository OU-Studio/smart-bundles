import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  HeadersFunction,
} from "react-router";
import { Form, useLoaderData, useActionData, useNavigate } from "react-router";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shopDomain =
    (session as any).shop ||
    (session as any).shopDomain ||
    (session as any).destination ||
    "";

  const bundles = await prisma.bundle.findMany({
    where: { shopDomain },
    orderBy: { createdAt: "desc" },
    include: {
      items: true,
      options: true,
    },
  });

  return { bundles };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shopDomain =
    (session as any).shop ||
    (session as any).shopDomain ||
    (session as any).destination ||
    "";

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "deleteBundle") {
    const bundleId = String(formData.get("bundleId") || "");

    if (!bundleId) {
      return { error: "Missing bundleId." };
    }

    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, shopDomain },
    });

    if (!bundle) {
      return { error: "Bundle not found." };
    }

    await prisma.bundleItem.deleteMany({
      where: { bundleId },
    });
    await prisma.bundleOption.deleteMany({
      where: { bundleId },
    });
    await prisma.bundle.delete({
      where: { id: bundleId },
    });

    return { redirectTo: "/app/bundles" };
  }

  return { error: "Unknown action." };
};

export default function BundlesIndexPage() {
  const { bundles } = useLoaderData() as {
    bundles: Array<any>;
  };
  const actionData = useActionData() as any;
  const navigate = useNavigate();

  useEffect(() => {
    if (actionData?.redirectTo) {
      navigate(actionData.redirectTo);
    }
  }, [actionData?.redirectTo, navigate]);

  return (
    <s-page heading="Bundles">
      <s-section>
        <s-stack direction="inline" gap="base">
          <s-text>
            Manage your bundle definitions. Each bundle is made from existing
            products.
          </s-text>
          <s-button onClick={() => navigate("/app/bundles/new")}>
            New bundle
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="All bundles">
        {actionData?.error && (
          <p style={{ color: "red", marginBottom: "1rem" }}>
            {actionData.error}
          </p>
        )}

        {bundles.length === 0 ? (
          <s-text>No bundles yet. Create your first bundle.</s-text>
        ) : (
          <s-stack direction="block" gap="base">
            {bundles.map((bundle) => (
              <s-box
                key={bundle.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="inline" gap="base">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>
                      <a
                        href={`/app/bundles/${bundle.id}`}
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        {bundle.title || "(Untitled bundle)"}
                      </a>
                    </div>
                    <div style={{ fontSize: "12px", color: "#6d7175" }}>
                      {bundle.items.length} items ·{" "}
                      {bundle.handle || bundle.id}
                    </div>
                  </div>

                  <s-stack direction="inline" gap="base">
                    <s-button
                      variant="tertiary"
                      onClick={() => navigate(`/app/bundles/${bundle.id}`)}
                    >
                      Edit
                    </s-button>

                    <Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value="deleteBundle"
                      />
                      <input
                        type="hidden"
                        name="bundleId"
                        value={bundle.id}
                      />
                      <button
                        type="submit"
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#c41e3a",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Delete
                      </button>
                    </Form>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
