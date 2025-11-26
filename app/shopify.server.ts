import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const APP_URL =
  (process.env.SHOPIFY_APP_URL || process.env.APP_PUBLIC_URL || "").replace(
    /\/$/,
    ""
  );

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: APP_URL,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),

  // 🔽 NEW: run after each successful admin auth / install
  hooks: {
    afterAuth: async ({ session, admin }) => {
      try {
        if (!APP_URL) {
          console.warn("[Smart Bundles] APP_URL is empty, skipping ScriptTag.");
          return;
        }

        const scriptSrc = `${APP_URL}/smart-bundles-cart.js`;

        // 1) Check if script tag already exists for this src
        const existingRes = await admin.graphql(
          `#graphql
          query smartBundlesScriptTags($src: URL!) {
            scriptTags(first: 10, src: $src) {
              edges {
                node {
                  id
                  src
                }
              }
            }
          }
        `,
          {
            variables: { src: scriptSrc },
          }
        );

        const existingJson = await existingRes.json();
        const existingEdges =
          existingJson?.data?.scriptTags?.edges ?? [];

        if (existingEdges.length > 0) {
          console.log(
            "[Smart Bundles] ScriptTag already installed for",
            scriptSrc
          );
          return;
        }

        // 2) Create the ScriptTag if it doesn't exist
        const createRes = await admin.graphql(
          `#graphql
          mutation smartBundlesCreateScriptTag($input: ScriptTagInput!) {
            scriptTagCreate(input: $input) {
              scriptTag {
                id
                src
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              input: {
                src: scriptSrc,
                displayScope: "ONLINE_STORE",
              },
            },
          }
        );

        const createJson = await createRes.json();
        const errors =
          createJson?.data?.scriptTagCreate?.userErrors ?? [];

        if (errors.length) {
          console.error(
            "[Smart Bundles] scriptTagCreate errors:",
            errors
          );
        } else {
          const created =
            createJson?.data?.scriptTagCreate?.scriptTag;
          console.log(
            "[Smart Bundles] ScriptTag installed:",
            created?.id,
            created?.src
          );
        }
      } catch (error) {
        console.error("[Smart Bundles] Error installing ScriptTag:", error);
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
