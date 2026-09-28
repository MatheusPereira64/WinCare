import { createFileRoute } from "@tanstack/react-router";
import { MemoryOptimizerCard } from "@/components/wincare/MemoryOptimizerCard";
import { ToolSection } from "@/components/wincare/ToolSection";
import type { ToolCategory } from "@/lib/wincare/types";

const CLEANUP_CATEGORIES: ToolCategory[] = ["cleanup"];

function LimpezaPage() {
  return (
    <div className="space-y-6">
      <MemoryOptimizerCard />
      <ToolSection
        title="Limpeza"
        subtitle="Libere espaço removendo arquivos temporários e caches do sistema."
        categories={CLEANUP_CATEGORIES}
      />
    </div>
  );
}

export const Route = createFileRoute("/limpeza")({
  head: () => ({
    meta: [
      { title: "Limpeza de arquivos temporários | WinCare" },
      {
        name: "description",
        content:
          "Limpe pastas Temp, Prefetch e o cache do Windows, e abra a Limpeza de Disco nativa direto do WinCare.",
      },
      { property: "og:title", content: "Limpeza de arquivos temporários | WinCare" },
      {
        property: "og:description",
        content: "Libere espaço removendo temporários, Prefetch e caches do Windows.",
      },
    ],
  }),
  component: LimpezaPage,
});
