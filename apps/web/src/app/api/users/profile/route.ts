import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

  if (displayName.length === 0 || displayName.length > 80) {
    return NextResponse.json(
      { error: "Display name must be 1–80 characters." },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { supabaseAuthId: user.id },
    data: { displayName },
  });

  return NextResponse.json({ user: updated });
}
