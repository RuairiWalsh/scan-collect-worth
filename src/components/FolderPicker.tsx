import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const foldersQuery = () =>
  queryOptions({
    queryKey: ["folders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("folders").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

export function useCreateFolder() {
  const qc = useQueryClient();
  return async (): Promise<string | null> => {
    const name = window.prompt("Folder name")?.trim();
    if (!name) return null;
    const { data, error } = await supabase.from("folders").insert({ name }).select("id").single();
    if (error) { toast.error(error.message); return null; }
    await qc.invalidateQueries({ queryKey: ["folders"] });
    toast.success(`Folder "${name}" created`);
    return data.id;
  };
}

/** Folder dropdown with a "New folder…" option. value "" = no folder. */
export function FolderPicker({
  value,
  onChange,
  noneLabel = "No folder",
  className = "",
}: {
  value: string;
  onChange: (id: string) => void;
  noneLabel?: string;
  className?: string;
}) {
  const { data: folders = [] } = useQuery(foldersQuery());
  const create = useCreateFolder();
  return (
    <select
      aria-label="Folder"
      value={value}
      onChange={async (e) => {
        if (e.target.value === "__new") {
          const id = await create();
          if (id) onChange(id);
          return;
        }
        onChange(e.target.value);
      }}
      className={`h-9 rounded-md border-2 border-border bg-card px-2 text-sm font-semibold ${className}`}
    >
      <option value="">{noneLabel}</option>
      {folders.map((f) => (
        <option key={f.id} value={f.id}>{f.name}</option>
      ))}
      <option value="__new">+ New folder…</option>
    </select>
  );
}
