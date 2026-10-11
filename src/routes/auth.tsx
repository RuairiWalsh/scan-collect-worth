import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Lymitz" },
      { name: "description", content: "Sign in to scan collectibles and track your collection's value." },
      { property: "og:title", content: "Sign in — Lymitz" },
      { property: "og:description", content: "Sign in to scan collectibles and track your collection's value." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/collection" });
  }, [user, loading, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/collection` },
        });
        if (error) throw error;
        if (!data.session) toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendReset() {
    if (!email) {
      toast.error("Enter your email first.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Check your email for a reset link.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid-paper flex min-h-screen items-center justify-center px-4">
      <div className="panel shadow-hard w-full max-w-sm p-8">
        <Link to="/" className="font-display text-xl font-black">
          LYM<span className="text-primary">ITZ</span>
        </Link>
        <h1 className="mt-6 text-2xl font-extrabold">{mode === "in" ? "Welcome back" : "Open your vault"}</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">Password</Label>
            <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "in" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <button
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
