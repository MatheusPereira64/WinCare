import { createFileRoute } from "@tanstack/react-router";
import { Brush } from "lucide-react";
import { BrowserCleaner } from "@/components/wincare/BrowserCleaner";
import { MemoryOptimizerCard } from "@/components/wincare/MemoryOptimizerCard";
import { ToolSection } from "@/components/wincare/ToolSection";
import type { ToolCategory } from "@/lib/wincare/types";

const CLEANUP_CATEGORIES: ToolCategory[] = ["cleanup"];

function LimpezaPage() {
  return (
    <ToolSection
      title="Limpeza"
      icon={Brush}
      subtitle="Libere espaço revisando o que será apagado em navegadores, apps e no sistema."
      categories={CLEANUP_CATEGORIES}
      leading={
        <>
          <MemoryOptimizerCard />
          <BrowserCleaner />
        </>
      }
    />
  );
}

export const Route = createFileRoute("/limpeza")({
  head: () => ({
    meta: [
      { title: "Limpeza de arquivos temporários | WinCare" },
      {
        name: "description",
        content:
          "Limpe navegadores e apps com prévia dos arquivos, pastas Temp, Prefetch e o cache do Windows.",
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
