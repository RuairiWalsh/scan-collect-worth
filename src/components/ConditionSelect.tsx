import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { conditionsFor } from "@/lib/taxonomy";

export function ConditionSelect({
  category,
  subcategory,
  value,
  onChange,
  className,
}: {
  category: string;
  subcategory?: string | null;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const list = conditionsFor(category, subcategory);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label="Condition">
        <SelectValue placeholder="Condition" />
      </SelectTrigger>
      <SelectContent>
        {list.map((c) => (
          <SelectItem key={c.key} value={c.key}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
