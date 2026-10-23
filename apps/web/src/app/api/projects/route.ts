import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (name.length === 0 || name.length > 120) {
    return NextResponse.json(
      { error: "Project name must be 1–120 characters." },
      { status: 400 }
    );
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  if (!dbUser) {
    return NextResponse.json({ error: "User record missing" }, { status: 409 });
  }

  const project = await prisma.project.create({
    data: { name, ownerId: dbUser.id },
  });

  return NextResponse.json({ project });
}

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  if (!dbUser) {
    return NextResponse.json({ projects: [] });
  }

  const projects = await prisma.project.findMany({
    where: { ownerId: dbUser.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { videos: true } } },
  });

  return NextResponse.json({ projects });
}
