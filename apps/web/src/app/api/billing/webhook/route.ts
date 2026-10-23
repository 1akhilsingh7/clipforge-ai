import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { stripe, PRICE_ID_TO_PLAN } from "@/lib/stripe";
import type Stripe from "stripe";

// Credit grants applied when a plan change takes effect. Free-tier
// credits are set at signup (see /api/users/sync); these top up on
// upgrade so a Pro user isn't stuck with their old Free balance.
const PLAN_CREDIT_GRANTS: Record<string, number> = { PRO: 1000, BUSINESS: 5000 };

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // Verifying the signature is what stops anyone from POSTing a fake
    // "subscription upgraded" event straight to this endpoint and
    // granting themselves a free Business plan.
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 }
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan as "PRO" | "BUSINESS" | undefined;
      if (userId && plan) {
        await prisma.user.update({
          where: { id: userId },
          data: { plan, credits: { increment: PLAN_CREDIT_GRANTS[plan] ?? 0 } },
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const priceId = subscription.items.data[0]?.price.id;
      const plan = priceId ? PRICE_ID_TO_PLAN[priceId] : undefined;
      const customerId = subscription.customer as string;

      if (plan) {
        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { plan },
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      // Downgrade to Free on cancellation — don't leave them stuck on
      // a paid plan's feature gates with no active subscription.
      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: { plan: "FREE" },
      });
      break;
    }

    default:
      // Unhandled event types are expected and fine — Stripe sends many
      // more event types than we act on.
      break;
  }

  return NextResponse.json({ received: true });
}
