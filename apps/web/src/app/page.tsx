import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
        ClipForge AI
      </h1>
      <p className="max-w-xl text-lg text-foreground/70">
        Turn long-form videos into viral shorts with one click.
      </p>
      <div className="flex gap-3">
        <Link
          href="/signup"
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium"
        >
          Log in
        </Link>
      </div>
      <p className="text-sm text-foreground/40">
        Phase 2 — auth + dashboard shell. Video import and AI features land
        in the next phases.
      </p>
    </main>
  );
}
