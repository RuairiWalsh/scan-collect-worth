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

/** item_id -> folder_ids map for every item the signed-in user has tagged. */
export const itemFoldersQuery = () =>
  queryOptions({
    queryKey: ["item-folders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("item_folders").select("item_id, folder_id");
      if (error) throw error;
      const map = new Map<string, string[]>();
      for (const row of data) {
        const list = map.get(row.item_id) ?? [];
        list.push(row.folder_id);
        map.set(row.item_id, list);
      }
      return map;
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

/**
 * Multi-select folder tags: an item can live in as many folders as you like.
 * Tapping a chip toggles it; "+ New" creates a folder and selects it.
 */
export function FolderPicker({
  value,
  onChange,
  className = "",
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}) {
  const { data: folders = [] } = useQuery(foldersQuery());
  const create = useCreateFolder();
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} role="group" aria-label="Folders">
      {folders.map((f) => {
        const active = value.includes(f.id);
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => toggle(f.id)}
            aria-pressed={active}
            className={`shrink-0 rounded-full border-2 px-3 py-1 text-xs font-bold transition ${
              active ? "border-ink bg-ink text-background" : "border-border bg-card hover:border-ink"
            }`}
          >
            📁 {f.name}
          </button>
        );
      })}
      <button
        type="button"
        onClick={async () => {
          const id = await create();
          if (id) onChange([...value, id]);
        }}
        className="shrink-0 rounded-full border-2 border-dashed border-border px-3 py-1 text-xs font-bold text-muted-foreground hover:border-ink"
      >
        + New folder
      </button>
      {folders.length === 0 && value.length === 0 && (
        <span className="self-center text-xs text-muted-foreground">No folders yet — create one to tag this.</span>
      )}
    </div>
  );
}
