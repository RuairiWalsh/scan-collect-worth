import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-roles";
import { usd } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Images } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Lymitz" },
      { name: "description", content: "Lymitz admin overview with site stats, users and merchant approvals." },
      { property: "og:title", content: "Admin — Lymitz" },
      { property: "og:description", content: "Lymitz admin overview with site stats, users and merchant approvals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type Stats = { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

function AdminPage() {
  const { isAdmin, isLoading } = useRoles();
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isAdmin)
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-extrabold">Admins only</h1>
        <Link to="/collection" className="mt-4 inline-block text-primary underline">Back to collection</Link>
      </div>
    );
  return <AdminDashboard />;
}

function AdminDashboard() {
  const qc = useQueryClient();
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_stats");
      if (error) throw error;
      return data as Stats;
    },
  });
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_users");
      if (error) throw error;
      return data;
    },
  });
  const apps = useQuery({
    queryKey: ["admin-apps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchant_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-apps"] });
  };
  const review = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc("admin_review_application", { _id: id, _approve: approve });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(v.approve ? "Merchant approved" : "Application rejected"); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const setRole = useMutation({
    mutationFn: async (v: { user: string; role: "admin" | "merchant"; enabled: boolean }) => {
      const { error } = await supabase.rpc("admin_set_role", { _user: v.user, _role: v.role, _enabled: v.enabled });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role updated"); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const s: { users?: number; new_users_7d?: number; active_users_7d?: number; items?: number; scans_7d?: number; collection_value?: number; tracked_cards?: number; merchants?: number; pending_applications?: number; active_listings?: number; listed_value?: number; prices_updated_at?: string | null } = stats.data ?? {};
  const emailOf = new Map((users.data ?? []).map((u) => [u.user_id, u.email]));
  const tiles: [string, string][] = [
    ["Users", String(s.users ?? "—")],
    ["New users (7d)", String(s.new_users_7d ?? "—")],
    ["Active users (7d)", String(s.active_users_7d ?? "—")],
    ["Items in collections", String(s.items ?? "—")],
    ["Scans (7d)", String(s.scans_7d ?? "—")],
    ["Total collection value", usd(Number(s.collection_value ?? 0))],
    ["Cards in price database", String(s.tracked_cards ?? "—")],
    ["Merchants", String(s.merchants ?? "—")],
    ["Pending applications", String(s.pending_applications ?? "—")],
    ["Active listings", String(s.active_listings ?? "—")],
    ["Listed value", usd(Number(s.listed_value ?? 0))],
    ["Prices last updated", s.prices_updated_at ? new Date(String(s.prices_updated_at)).toLocaleString() : "—"],
  ];
  const pending = (apps.data ?? []).filter((a) => a.status === "pending");

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-black">Admin</h1>
        <Button asChild variant="outline">
          <Link to="/admin-import"><Images className="size-4" />Scanner PDF imports</Link>
        </Button>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Site stats</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label} className="panel p-4">
              <div className="text-xs font-semibold text-muted-foreground">{label}</div>
              <div className="mt-1 text-xl font-extrabold">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Merchant applications ({pending.length} pending)
        </h2>
        {pending.length === 0 && <p className="text-sm text-muted-foreground">No pending applications.</p>}
        <div className="space-y-3">
          {pending.map((a) => (
            <div key={a.id} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-bold">{a.store_name}</div>
                <div className="text-sm text-muted-foreground">{emailOf.get(a.user_id) ?? a.user_id}</div>
                {a.about && <p className="mt-1 text-sm">{a.about}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: a.id, approve: true })}>Approve</Button>
                <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ id: a.id, approve: false })}>Reject</Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Users</h2>
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b-2 border-ink text-left">
              <tr>
                <th className="p-3">Email</th><th className="p-3">Joined</th><th className="p-3">Items</th>
                <th className="p-3">Value</th><th className="p-3">Merchant</th><th className="p-3">Admin</th>
              </tr>
            </thead>
            <tbody>
              {(users.data ?? []).map((u) => {
                const isM = u.roles.includes("merchant");
                const isA = u.roles.includes("admin");
                return (
                  <tr key={u.user_id} className="border-b border-border last:border-0">
                    <td className="p-3 font-semibold">{u.email}</td>
                    <td className="p-3">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="p-3">{u.item_count}</td>
                    <td className="p-3">{usd(Number(u.collection_value))}</td>
                    <td className="p-3">
                      <Button size="sm" variant={isM ? "default" : "outline"} disabled={setRole.isPending}
                        onClick={() => setRole.mutate({ user: u.user_id, role: "merchant", enabled: !isM })}>
                        {isM ? "Yes" : "No"}
                      </Button>
                    </td>
                    <td className="p-3">
                      <Button size="sm" variant={isA ? "default" : "outline"} disabled={setRole.isPending}
                        onClick={() => setRole.mutate({ user: u.user_id, role: "admin", enabled: !isA })}>
                        {isA ? "Yes" : "No"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
