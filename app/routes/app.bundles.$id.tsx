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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

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
      options: {
        orderBy: { optionName: "asc" },
      },
    },
  });

  if (!bundle) {
    throw new Response("Bundle not found", { status: 404 });
  }

  return { bundle };
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

  // -------- Add an option --------
  if (intent === "addOption") {
    const optionName = String(formData.get("optionName") || "").trim();
    const scopeRaw = String(formData.get("scope") || "PER_ITEM").trim();

    if (!optionName) {
      return {
        error: "Option name is required.",
        intent: "addOption",
      };
    }

    const scope =
      scopeRaw === "SHARED" || scopeRaw === "PER_ITEM"
        ? scopeRaw
        : "PER_ITEM";

    await prisma.bundleOption.create({
      data: {
        bundleId: id,
        optionName,
        scope,
      },
    });

    return { redirectTo: `/app/bundles/${id}` };
  }

  // -------- Update an option scope --------
  if (intent === "updateOption") {
    const optionId = String(formData.get("optionId") || "");
    const scopeRaw = String(formData.get("scope") || "PER_ITEM").trim();

    if (!optionId) {
      return { error: "Missing optionId." };
    }

    const scope =
      scopeRaw === "SHARED" || scopeRaw === "PER_ITEM"
        ? scopeRaw
        : "PER_ITEM";

    await prisma.bundleOption.updateMany({
      where: {
        id: optionId,
        bundleId: id,
      },
      data: {
        scope,
      },
    });

    return { redirectTo: `/app/bundles/${id}` };
  }

  // -------- Delete an option --------
  if (intent === "deleteOption") {
    const optionId = String(formData.get("optionId") || "");

    if (!optionId) {
      return { error: "Missing optionId." };
    }

    await prisma.bundleOption.deleteMany({
      where: {
        id: optionId,
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
  const { bundle } = useLoaderData() as { bundle: any };
  const actionData = useActionData() as any;
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const [pickedProductId, setPickedProductId] = useState("");
  const [pickedProductTitle, setPickedProductTitle] = useState("");

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

      {/* BUNDLE OPTIONS */}
      <s-section heading="Options">
        <p style={{ marginBottom: "0.75rem", fontSize: "13px", color: "#6d7175" }}>
          Define option names used in this bundle (for example &quot;Finish&quot; or
          &quot;Handle type&quot;), and whether they should be shared across all items
          or set per item.
        </p>

        {bundle.options.length === 0 ? (
          <p style={{ fontSize: "13px", color: "#6d7175" }}>
            No options defined yet.
          </p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginBottom: "1rem",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "4px 8px",
                    borderBottom: "1px solid #d2d5d8",
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "4px 8px",
                    borderBottom: "1px solid #d2d5d8",
                  }}
                >
                  Scope
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "4px 8px",
                    borderBottom: "1px solid #d2d5d8",
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {bundle.options.map((opt: any) => (
                <tr key={opt.id}>
                  <td style={{ padding: "4px 8px" }}>{opt.optionName}</td>
                  <td style={{ padding: "4px 8px" }}>
                    <Form method="post" style={{ display: "inline-flex", gap: 4 }}>
                      <input type="hidden" name="intent" value="updateOption" />
                      <input type="hidden" name="optionId" value={opt.id} />
                      <select name="scope" defaultValue={opt.scope}>
                        <option value="SHARED">Shared</option>
                        <option value="PER_ITEM">Per item</option>
                      </select>
                      <button
                        type="submit"
                        style={{
                          border: "1px solid #d2d5d8",
                          borderRadius: "4px",
                          padding: "2px 8px",
                          cursor: "pointer",
                          fontSize: "12px",
                          background: "#f6f6f7",
                        }}
                      >
                        Save
                      </button>
                    </Form>
                  </td>
                  <td
                    style={{
                      padding: "4px 8px",
                      textAlign: "right",
                    }}
                  >
                    <Form method="post" style={{ display: "inline" }}>
                      <input type="hidden" name="intent" value="deleteOption" />
                      <input type="hidden" name="optionId" value={opt.id} />
                      <button
                        type="submit"
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#c41e3a",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: "12px",
                        }}
                      >
                        Delete
                      </button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Add option form */}
        <Form method="post">
          <input type="hidden" name="intent" value="addOption" />
          <s-stack direction="inline" gap="base">
            <div style={{ flex: 2 }}>
              <label htmlFor="optionName">New option name</label>
              <br />
              <input
                id="optionName"
                name="optionName"
                placeholder="e.g. Finish"
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="scope">Scope</label>
              <br />
              <select id="scope" name="scope" defaultValue="PER_ITEM" style={{ width: "100%" }}>
                <option value="SHARED">Shared</option>
                <option value="PER_ITEM">Per item</option>
              </select>
            </div>
            <div style={{ alignSelf: "flex-end" }}>
              <button type="submit">Add option</button>
            </div>
          </s-stack>

          {intentIsAddOption(actionData) && (
            <p style={{ color: "red", marginTop: "0.5rem" }}>
              {actionData.error}
            </p>
          )}
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
