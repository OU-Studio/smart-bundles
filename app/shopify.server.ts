import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const APP_PUBLIC_URL =
  process.env.APP_PUBLIC_URL || process.env.SHOPIFY_APP_URL || "";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),

  hooks: {
    // Runs whenever a shop finishes auth / re-auth
    afterAuth: async ({ session, admin }) => {
      // Keep your existing webhook registration
      await shopify.registerWebhooks({ session, admin });

      if (!APP_PUBLIC_URL) {
        console.warn(
          "[Smart Bundles] APP_PUBLIC_URL/SHOPIFY_APP_URL not set, skipping ScriptTag install."
        );
        return;
      }

      const baseUrl = APP_PUBLIC_URL.replace(/\/+$/, "");
      const scriptSrc = `${baseUrl}/smart-bundles-cart.js`;

      try {
        // Fetch existing script tags
        const existingRes = await admin.rest.get({ path: "script_tags" });

        const existingTags =
          (existingRes?.data as any)?.script_tags ||
          (existingRes?.body as any)?.script_tags ||
          [];

        // Delete any previous Smart Bundles tag so we don't duplicate
        for (const tag of existingTags) {
          if (
            tag.src &&
            typeof tag.src === "string" &&
            tag.src.includes("smart-bundles-cart.js")
          ) {
            await admin.rest.delete({ path: `script_tags/${tag.id}` });
          }
        }

        // Create the new ScriptTag
        await admin.rest.post({
          path: "script_tags",
          type: "application/json",
          data: {
            script_tag: {
              event: "onload",
              src: scriptSrc,
            },
          },
        });

        console.log(
          `[Smart Bundles] ScriptTag installed for ${session.shop}: ${scriptSrc}`
        );
      } catch (err) {
        console.error("[Smart Bundles] Error syncing ScriptTag", err);
      }
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
