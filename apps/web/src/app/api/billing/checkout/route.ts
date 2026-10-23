import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { stripe, PLAN_PRICE_IDS } from "@/lib/stripe";

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const plan = body.plan === "BUSINESS" ? "BUSINESS" : body.plan === "PRO" ? "PRO" : null;
  if (!plan) {
    return NextResponse.json({ error: "plan must be PRO or BUSINESS" }, { status: 400 });
  }

  const priceId = PLAN_PRICE_IDS[plan];
  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe price ID for ${plan} is not configured.` },
      { status: 500 }
    );
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  if (!dbUser) {
    return NextResponse.json({ error: "User record missing" }, { status: 409 });
  }

  // Reuse an existing Stripe customer rather than creating a duplicate
  // on every upgrade attempt — Stripe has no built-in dedup by email.
  let customerId = dbUser.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: dbUser.email,
      metadata: { userId: dbUser.id },
    });
    customerId = customer.id;
    await prisma.user.update({ where: { id: dbUser.id }, data: { stripeCustomerId: customerId } });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/dashboard/billing?upgraded=true`,
    cancel_url: `${siteUrl}/dashboard/billing`,
    // The webhook is the source of truth for actually granting the plan
    // — this metadata just helps cross-reference logs/support tickets.
    metadata: { userId: dbUser.id, plan },
  });

  return NextResponse.json({ url: session.url });
}
