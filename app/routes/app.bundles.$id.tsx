import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  HeadersFunction,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigate,
} from "react-router";
import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { computeBundleOptions } from '../utils/computeBundleOptions';
import type { ProductWithOptions } from '../types/bundles';

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const shopDomain =
    (session as any).shop ||
    (session as any).shopDomain ||
    (session as any).destination ||
    "";

  const id = params.id as string;

  const bundle = await prisma.bundle.findFirst({
    where: {
      id,
      shopDomain,
    },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!bundle) {
    throw new Response("Bundle not found", { status: 404 });
  }

  // --- NEW: fetch Shopify product options and compute shared/per-item options ---

  let computedOptions: any = null;

  if (bundle.items.length > 0) {
    const productsForOptions: ProductWithOptions[] = [];

    for (const item of bundle.items) {
      const handle = item.productId;
      if (!handle) continue;

      try {
        const response = await admin.graphql(
          `#graphql
            query ProductByHandle($handle: String!) {
              productByHandle(handle: $handle) {
                id
                title
                options {
                  name
                  values
                }
              }
            }
          `,
          {
            variables: { handle },
          },
        );

        const json = await response.json();
        const productNode = json?.data?.productByHandle;
        if (!productNode) continue;

        // Use the bundle item id as the "id" so we can map options back to items
        const productWithOptions: ProductWithOptions = {
          id: item.id,
          title: productNode.title ?? handle,
          options: Array.isArray(productNode.options)
            ? productNode.options.map((opt: any) => ({
                name: String(opt.name || "").trim(),
                values: Array.isArray(opt.values)
                  ? opt.values.map((v: any) => String(v))
                  : [],
              }))
            : [],
        };

        productsForOptions.push(productWithOptions);
      } catch (error) {
        console.error(
          "[Smart Bundles] Error fetching product options for handle",
          handle,
          error,
        );
      }
    }

    if (productsForOptions.length > 0) {
      computedOptions = computeBundleOptions(productsForOptions);
    }
  }

  return { bundle, computedOptions };
};


export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shopDomain =
    (session as any).shop ||
    (session as any).shopDomain ||
    (session as any).destination ||
    "";

  const id = params.id as string;
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  // Make sure bundle belongs to this shop
  const bundle = await prisma.bundle.findFirst({
    where: { id, shopDomain },
  });

  if (!bundle) {
    return { error: "Bundle not found." };
  }

  // -------- Update bundle details --------
  if (intent === "updateBundle") {
    const title = String(formData.get("title") || "").trim();
    const handle = String(formData.get("handle") || "").trim();
    const description = String(formData.get("description") || "").trim();

    if (!title || !handle) {
      return { error: "Title and handle are required." };
    }

    await prisma.bundle.update({
      where: { id },
      data: {
        title,
        handle,
        description,
      },
    });

    return { redirectTo: "/app/bundles" };
  }

  // -------- Add a bundle item --------
  if (intent === "addItem") {
    const productId = String(formData.get("productId") || "").trim();
    const displayLabel = String(formData.get("displayLabel") || "").trim();

    if (!productId) {
      return {
        error: "Product ID is required to add an item.",
        intent: "addItem",
      };
    }

    const count = await prisma.bundleItem.count({
      where: { bundleId: id },
    });

    await prisma.bundleItem.create({
      data: {
        bundleId: id,
        productId,
        productTitle: null,
        displayLabel: displayLabel || null,
        sortOrder: count,
      },
    });

    return { redirectTo: `/app/bundles/${id}` };
  }

  // -------- Delete a bundle item --------
  if (intent === "deleteItem") {
    const itemId = String(formData.get("itemId") || "");

    if (!itemId) {
      return { error: "Missing itemId." };
    }

    await prisma.bundleItem.deleteMany({
      where: {
        id: itemId,
        bundleId: id,
      },
    });

    return { redirectTo: `/app/bundles/${id}` };
  }

  return { error: "Unknown action." };
};

function intentIsAddItem(actionData: any) {
  return actionData?.error && actionData?.intent === "addItem";
}

function intentIsAddOption(actionData: any) {
  return actionData?.error && actionData?.intent === "addOption";
}

export default function EditBundlePage() {
  const { bundle, computedOptions } = useLoaderData() as {
    bundle: any;
    computedOptions?: any;
  };
  const actionData = useActionData() as any;
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const [pickedProductId, setPickedProductId] = useState("");
  const [pickedProductTitle, setPickedProductTitle] = useState("");

  const sharedOptions = computedOptions?.sharedOptions || [];
  const perItemOptions = computedOptions?.perProductOptions || {};

    // Build a list of suggested option names from Shopify products
  const optionNameSuggestions: string[] = (() => {
    const names = new Set<string>();

    sharedOptions.forEach((opt: any) => {
      if (opt?.name) names.add(String(opt.name));
    });

    Object.values(perItemOptions).forEach((opts: any) => {
      (opts || []).forEach((opt: any) => {
        if (opt?.name) names.add(String(opt.name));
      });
    });

    return Array.from(names).sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { sensitivity: "base" })
    );
  })();



  useEffect(() => {
    if (actionData?.redirectTo) {
      navigate(actionData.redirectTo);
    }
  }, [actionData?.redirectTo, navigate]);

  async function openProductPicker() {
    try {
      const selected: any = await (shopify as any).resourcePicker({
        type: "product",
        multiple: false,
        action: "select",
      });

      if (selected && selected.length > 0) {
        const product = selected[0];

        const handle = product.handle || null;
        const id = product.id;

        console.log("[Smart Bundles] Picked product:", product);

        if (handle) {
          // Store handle in productId so storefront can resolve it
          setPickedProductId(handle);
        } else {
          setPickedProductId(id);
        }

        setPickedProductTitle(product.title || "");
      }
    } catch (err) {
      console.error("Error opening product picker", err);
    }
  }

  return (
    <s-page heading={`Edit Bundle: ${bundle.title || "(Untitled)"}`}>
      {/* MAIN BUNDLE DETAILS */}
      <s-section>
        <Form method="post">
          <input type="hidden" name="intent" value="updateBundle" />
          <s-stack direction="block" gap="base">
            <div>
              <label htmlFor="title">Title</label>
              <br />
              <input
                id="title"
                name="title"
                defaultValue={bundle.title ?? ""}
                required
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label htmlFor="handle">Handle</label>
              <br />
              <input
                id="handle"
                name="handle"
                defaultValue={bundle.handle ?? ""}
                required
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label htmlFor="description">Description</label>
              <br />
              <textarea
                id="description"
                name="description"
                rows={4}
                defaultValue={bundle.description ?? ""}
                style={{ width: "100%" }}
              />
            </div>

            {actionData?.error && !actionData?.intent && (
              <p style={{ color: "red" }}>{actionData.error}</p>
            )}

            <button type="submit">Save bundle details</button>
          </s-stack>
        </Form>
      </s-section>

      {/* BUNDLE ITEMS */}
      <s-section heading="Bundle items">
        {bundle.items.length === 0 ? (
          <s-text>No items in this bundle yet.</s-text>
        ) : (
          <ul style={{ paddingLeft: "1.2rem" }}>
            {bundle.items.map((item: any) => (
              <li key={item.id} style={{ marginBottom: "0.5rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong>{item.displayLabel || item.productId}</strong>{" "}
                    <span style={{ color: "#6d7175", fontSize: "12px" }}>
                      (Product: {item.productId})
                    </span>
                  </div>

                  <Form method="post">
                    <input type="hidden" name="intent" value="deleteItem" />
                    <input type="hidden" name="itemId" value={item.id} />
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
                      Remove
                    </button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </s-section>

      {/* ADD ITEM FORM WITH PRODUCT PICKER */}
      <s-section heading="Add item">
        <Form method="post">
          <input type="hidden" name="intent" value="addItem" />
          <s-stack direction="block" gap="base">
            <div>
              <label htmlFor="productId">Product ID (handle)</label>
              <br />
              <input
                id="productId"
                name="productId"
                value={pickedProductId}
                onChange={(e) => setPickedProductId(e.target.value)}
                placeholder="Click 'Pick product' or type a product handle"
                style={{ width: "100%" }}
              />
              {pickedProductTitle && (
                <div style={{ marginTop: "4px", color: "#6d7175" }}>
                  Selected product: {pickedProductTitle}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="displayLabel">Display label (optional)</label>
              <br />
              <input
                id="displayLabel"
                name="displayLabel"
                placeholder="e.g. Basin Mixer Tap"
                style={{ width: "100%" }}
              />
            </div>

            {intentIsAddItem(actionData) && (
              <p style={{ color: "red" }}>{actionData.error}</p>
            )}

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={openProductPicker}
                style={{ flex: 1 }}
              >
                Pick product
              </button>
              <button type="submit" style={{ flex: 1 }}>
                Add item to bundle
              </button>
            </div>
          </s-stack>
        </Form>
      </s-section>

            {/* DETECTED OPTIONS (from Shopify products) */}
      {computedOptions && (
        <s-section heading="Detected options (preview)">
          {bundle.items.length === 0 ? (
            <s-text>
              No items in this bundle yet, so there are no options to detect.
            </s-text>
          ) : (
            <>
              <div style={{ marginBottom: "0.75rem" }}>
                <strong>Shared options across all items:</strong>
                {sharedOptions.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "#6d7175" }}>
                    None detected. Each product only has its own unique options.
                  </p>
                ) : (
                  <ul style={{ marginTop: "0.25rem", paddingLeft: "1.1rem" }}>
                    {sharedOptions.map((opt: any) => (
                      <li key={opt.name}>
                        {opt.name}:{" "}
                        {Array.isArray(opt.values) ? opt.values.join(", ") : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <strong>Options per bundle item:</strong>
                {bundle.items.map((item: any) => {
                  const optionsForItem = perItemOptions[item.id] || [];
                  if (optionsForItem.length === 0) {
                    return (
                      <p
                        key={item.id}
                        style={{
                          fontSize: "13px",
                          color: "#6d7175",
                          marginTop: "0.25rem",
                        }}
                      >
                        {item.displayLabel || item.productId}: no unique options
                        (only shared ones).
                      </p>
                    );
                  }

                  return (
                    <div key={item.id} style={{ marginTop: "0.5rem" }}>
                      <p
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          marginBottom: "0.25rem",
                        }}
                      >
                        {item.displayLabel || item.productId}
                      </p>
                      <ul style={{ marginTop: 0, paddingLeft: "1.1rem" }}>
                        {optionsForItem.map((opt: any) => (
                          <li key={opt.name}>
                            {opt.name}:{" "}
                            {Array.isArray(opt.values)
                              ? opt.values.join(", ")
                              : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </s-section>

        
      )}


    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
