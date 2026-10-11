import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LayoutGrid, ScanLine, LogOut, Search, Tag, Shield } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, loading } = useAuth();
  const { isAdmin } = useRoles();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const navCls =
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground";
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/collection" className="font-display text-xl font-black">
            LYM<span className="text-primary">ITZ</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <Link to="/collection" className={navCls} activeProps={{ className: "text-foreground bg-muted" }}>
              <LayoutGrid className="size-4" /> Collection
            </Link>
            <Link to="/scan" className={navCls} activeProps={{ className: "text-foreground bg-muted" }}>
              <ScanLine className="size-4" /> Scan
            </Link>
            <Link to="/search" className={navCls} activeProps={{ className: "text-foreground bg-muted" }}>
              <Search className="size-4" /> Browse Cards
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/sell" className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>
              <Tag className="size-4" /> Sell
            </Link>
            {isAdmin && (
              <Link to="/admin" className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                <Shield className="size-4" /> Admin
              </Link>
            )}
            <button
              onClick={() => supabase.auth.signOut()}
              aria-label="Sign out"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t-2 border-ink bg-background md:hidden">
        <Link to="/collection" className="flex flex-col items-center py-2 text-xs font-semibold" activeProps={{ className: "text-primary" }}>
          <LayoutGrid className="size-5" /> Collection
        </Link>
        <Link to="/scan" className="flex flex-col items-center py-2 text-xs font-semibold" activeProps={{ className: "text-primary" }}>
          <ScanLine className="size-5" /> Scan
        </Link>
        <Link to="/search" className="flex flex-col items-center py-2 text-xs font-semibold" activeProps={{ className: "text-primary" }}>
          <Search className="size-5" /> Browse
        </Link>
      </nav>
    </div>
  );
}
