import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Log in to ClipForge AI</h1>
      <AuthForm mode="login" />
      <div className="flex flex-col items-center gap-2 text-sm text-foreground/60">
        <Link href="/forgot-password" className="hover:text-foreground">
          Forgot your password?
        </Link>
        <p>
          No account?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
