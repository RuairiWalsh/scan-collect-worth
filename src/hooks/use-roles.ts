import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const myRolesQuery = () =>
  queryOptions({
    queryKey: ["my-roles"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [] as string[];
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      if (error) throw error;
      return data.map((r) => r.role as string);
    },
  });

export function useRoles() {
  const { data: roles = [], isLoading } = useQuery(myRolesQuery());
  return { roles, isAdmin: roles.includes("admin"), isMerchant: roles.includes("merchant"), isLoading };
}
