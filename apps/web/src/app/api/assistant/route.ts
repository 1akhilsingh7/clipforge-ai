import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkAiRateLimit } from "@/lib/rate-limit";

const ASSISTANT_CREDIT_COST = 1;
const VALID_TASK_TYPES = [
  "title", "hashtags", "description", "social_post", "hook", "cta", "script_rewrite",
];

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rateLimit = await checkAiRateLimit(authUser.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rateLimit.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const taskType = typeof body.taskType === "string" ? body.taskType : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";

  if (!VALID_TASK_TYPES.includes(taskType)) {
    return NextResponse.json({ error: "Invalid task type." }, { status: 400 });
  }
  if (context.length === 0 || context.length > 4000) {
    return NextResponse.json({ error: "Context must be 1–4000 characters." }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  if (!dbUser) {
    return NextResponse.json({ error: "User record missing" }, { status: 409 });
  }

  const updated = await prisma.user.updateMany({
    where: { id: dbUser.id, credits: { gte: ASSISTANT_CREDIT_COST } },
    data: { credits: { decrement: ASSISTANT_CREDIT_COST } },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Not enough credits." }, { status: 402 });
  }

  const apiRes = await fetch(`${process.env.API_BASE_URL}/assistant/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.API_SECRET_KEY}`,
    },
    body: JSON.stringify({ taskType, context }),
  });

  const data = await apiRes.json();

  if (data.status !== "ready") {
    // Refund — the credit-worthy work never actually completed.
    await prisma.user.update({ where: { id: dbUser.id }, data: { credits: { increment: ASSISTANT_CREDIT_COST } } });
    return NextResponse.json({ error: data.reason ?? "Assistant failed." }, { status: 502 });
  }

  return NextResponse.json({ result: data.result });
}
