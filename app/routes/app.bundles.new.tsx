import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  HeadersFunction,
} from "react-router";
import { Form, useActionData, useNavigate } from "react-router";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shopDomain =
    (session as any).shop ||
    (session as any).shopDomain ||
    (session as any).destination ||
    "";

  const formData = await request.formData();
  const title = String(formData.get("title") || "").trim();
  const handle = String(formData.get("handle") || "").trim();
  const description = String(formData.get("description") || "").trim();

  if (!title || !handle) {
    return { error: "Title and handle are required." };
  }

  await prisma.bundle.create({
    data: {
      shopDomain,
      title,
      handle,
      description,
    },
  });

  return { success: true };
};

export default function NewBundlePage() {
  const navigate = useNavigate();
  const actionData = useActionData() as any;

  useEffect(() => {
    if (actionData?.success) {
      navigate("/app/bundles");
    }
  }, [actionData?.success, navigate]);

  return (
    <s-page heading="Create New Bundle">
      <s-section>
        <Form method="post">
          <s-stack direction="block" gap="base">
            <div>
              <label htmlFor="title">Title</label>
              <br />
              <input id="title" name="title" required style={{ width: "100%" }} />
            </div>

            <div>
              <label htmlFor="handle">Handle</label>
              <br />
              <input
                id="handle"
                name="handle"
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
                style={{ width: "100%" }}
              />
            </div>

            {actionData?.error && (
              <p style={{ color: "red" }}>{actionData.error}</p>
            )}

            <button type="submit">Create bundle</button>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
