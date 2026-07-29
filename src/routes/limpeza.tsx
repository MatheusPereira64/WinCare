import { createFileRoute } from "@tanstack/react-router";
import { ToolSection } from "@/components/wincare/ToolSection";

export const Route = createFileRoute("/limpeza")({
  head: () => ({
    meta: [
      { title: "Limpeza de arquivos temporários | WinCare" },
      {
        name: "description",
        content:
          "Limpe %temp%, Prefetch e o cache do Windows, e abra a Limpeza de Disco nativa direto do WinCare.",
      },
      { property: "og:title", content: "Limpeza de arquivos temporários | WinCare" },
      {
        property: "og:description",
        content: "Libere espaço removendo temporários, Prefetch e caches do Windows.",
      },
    ],
  }),
  component: () => (
    <ToolSection
      title="Limpeza"
      subtitle="Libere espaço removendo arquivos temporários e caches do sistema."
      categories={["cleanup"]}
    />
  ),
});
