import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// Maps our Plan enum to Stripe Price IDs. Set these once you've created
// the corresponding Products/Prices in the Stripe dashboard.
export const PLAN_PRICE_IDS: Record<"PRO" | "BUSINESS", string> = {
  PRO: process.env.STRIPE_PRICE_ID_PRO ?? "",
  BUSINESS: process.env.STRIPE_PRICE_ID_BUSINESS ?? "",
};

export const PRICE_ID_TO_PLAN: Record<string, "PRO" | "BUSINESS"> = Object.fromEntries(
  Object.entries(PLAN_PRICE_IDS)
    .filter(([, priceId]) => priceId)
    .map(([plan, priceId]) => [priceId, plan as "PRO" | "BUSINESS"])
);
