import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Search, SearchX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOOL_GROUPS, TOOLS, getCommandPreview } from "@/lib/wincare/tools";
import { unlockUi } from "@/lib/wincare/unlockUi";
import type { Tool, ToolCategory } from "@/lib/wincare/types";
import { EmptyState } from "./EmptyState";
import { PageHeader } from "./PageHeader";
import { ToolCard, ToolTile } from "./ToolCard";

interface Props {
  title: string;
  subtitle: string;
  categories: ToolCategory[];
  icon?: ComponentType<{ className?: string }>;
  developmentBadge?: string;
  /** Conteúdo opcional acima do grid de ferramentas. */
  leading?: ReactNode;
  /** Título de seção dentro de outra página, em vez de cabeçalho de página. */
  embedded?: boolean;
}

interface ToolGroup {
  label?: string;
  hint?: string;
  compact?: boolean;
  tools: Tool[];
}

function groupTools(tools: Tool[], categories: ToolCategory[]): ToolGroup[] {
  const groups: ToolGroup[] = [];
  const placed = new Set<string>();
  for (const category of categories) {
    for (const group of TOOL_GROUPS[category] ?? []) {
      const members = group.ids
        .map((id) => tools.find((t) => t.id === id))
        .filter((t): t is Tool => !!t);
      members.forEach((t) => placed.add(t.id));
      if (members.length) groups.push({ ...group, tools: members });
    }
  }
  const rest = tools.filter((t) => !placed.has(t.id));
  if (rest.length) groups.push({ label: groups.length ? "Outras" : undefined, tools: rest });
  return groups;
}

export function ToolSection({
  title,
  subtitle,
  categories,
  icon,
  developmentBadge,
  leading,
  embedded,
}: Props) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    unlockUi();
    const t = window.setTimeout(unlockUi, 200);
    return () => window.clearTimeout(t);
  }, []);

  const tools = useMemo(() => {
    const q = query.trim().toLowerCase();
    const allowed = new Set(categories);
    return TOOLS.filter((t) => allowed.has(t.category)).filter(
      (t) =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        getCommandPreview(t).toLowerCase().includes(q) ||
        t.command.toLowerCase().includes(q),
    );
  }, [categories, query]);

  const groups = useMemo(() => groupTools(tools, categories), [tools, categories]);

  const search = (
    <div className="relative w-full max-w-xs min-w-56">
      <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Pesquisar (Ctrl + K)"
        aria-label="Pesquisar ferramenta"
        className="rounded-full border-border/60 bg-card/60 pl-9"
        data-wincare-search
      />
    </div>
  );

  const countBadge = (
    <Badge variant="outline" className="rounded-full border-border/60 px-2.5 text-muted-foreground">
      {tools.length} {tools.length === 1 ? "ferramenta" : "ferramentas"}
    </Badge>
  );

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {search}
        </div>
      ) : (
        <PageHeader
          icon={icon}
          title={title}
          subtitle={subtitle}
          badges={
            <>
              {countBadge}
              {developmentBadge && (
                <Badge
                  variant="outline"
                  className="rounded-full border-warning/30 bg-warning/10 text-warning"
                  title="Funcionalidade instável — correções em andamento"
                >
                  {developmentBadge}
                </Badge>
              )}
            </>
          }
          actions={search}
        />
      )}

      {leading}

      {groups.map((group) => (
        <section key={group.label ?? "tools"} className="space-y-3">
          {group.label && (
            <div>
              <h2 className="text-sm font-semibold tracking-tight">{group.label}</h2>
              {group.hint && <p className="text-xs text-muted-foreground">{group.hint}</p>}
            </div>
          )}
          {group.compact ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {group.tools.map((tool) => (
                <ToolTile key={tool.id} tool={tool} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {group.tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          )}
        </section>
      ))}

      {tools.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="Nenhuma ferramenta encontrada"
          description={`Nada corresponde a “${query.trim()}” nesta página.`}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => setQuery("")}>
              Limpar pesquisa
            </Button>
          }
        />
      )}
    </div>
  );
}
