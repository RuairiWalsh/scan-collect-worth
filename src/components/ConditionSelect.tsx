import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONDITIONS, type CategoryKey } from "@/lib/taxonomy";

export function ConditionSelect({
  category,
  value,
  onChange,
  className,
}: {
  category: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const list = CONDITIONS[(category as CategoryKey) in CONDITIONS ? (category as CategoryKey) : "cards"];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
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
