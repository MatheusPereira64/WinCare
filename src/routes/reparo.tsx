import { createFileRoute } from "@tanstack/react-router";
import { ToolSection } from "@/components/wincare/ToolSection";

export const Route = createFileRoute("/reparo")({
  head: () => ({
    meta: [
      { title: "Ferramentas de reparo do Windows | WinCare" },
      {
        name: "description",
        content:
          "Execute SFC, DISM, chkdsk e a limpeza do cache do Windows Update com log em tempo real e confirmação de risco.",
      },
      { property: "og:title", content: "Ferramentas de reparo do Windows | WinCare" },
      {
        property: "og:description",
        content: "SFC, DISM e chkdsk em um clique, sem abrir o CMD.",
      },
    ],
  }),
  component: () => (
    <ToolSection
      title="Reparo"
      subtitle="Correção de arquivos do sistema, imagem do Windows e disco."
      categories={["repair"]}
    />
  ),
});
