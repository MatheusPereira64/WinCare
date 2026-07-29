import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { TOOLS } from "@/lib/wincare/tools";
import type { ToolCategory } from "@/lib/wincare/types";
import { ToolCard } from "./ToolCard";

interface Props {
  title: string;
  subtitle: string;
  categories: ToolCategory[];
}

export function ToolSection({ title, subtitle, categories }: Props) {
  const [query, setQuery] = useState("");

  const tools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TOOLS.filter((t) => categories.includes(t.category)).filter(
      (t) =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.command.toLowerCase().includes(q),
    );
  }, [categories, query]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar ferramenta (Ctrl + K)"
            className="pl-9"
            data-wincare-search
          />
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>

      {tools.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma ferramenta encontrada.</p>
      )}
    </div>
  );
}
