import { PrismaClient } from "@prisma/client";

// Next.js hot-reloads modules in dev, which would otherwise spawn a new
// PrismaClient (and new DB connection pool) on every file save.
// Caching it on `global` keeps a single instance across reloads.
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
