import { prisma } from "@clipforge/db";

export async function logError(message: string, path?: string, statusCode?: number) {
  try {
    await prisma.errorLog.create({
      data: { message: message.slice(0, 2000), path, statusCode },
    });
  } catch {
    // Logging must never itself crash the request it's trying to log
    // context for — swallow and fall back to server console output.
    console.error("Failed to write error log:", message);
  }
}
