import { NextResponse } from "next/server";
import { prisma } from "@clipforge/db";
import { requireAdmin } from "@/lib/admin";

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key : null;
  const enabled = typeof body.enabled === "boolean" ? body.enabled : null;

  if (!key || enabled === null) {
    return NextResponse.json({ error: "key and enabled are required" }, { status: 400 });
  }

  const flag = await prisma.featureFlag.update({ where: { key }, data: { enabled } });
  return NextResponse.json({ flag });
}
