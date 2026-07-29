import { createFileRoute } from "@tanstack/react-router";
import { ToolSection } from "@/components/wincare/ToolSection";

export const Route = createFileRoute("/sistema")({
  head: () => ({
    meta: [
      { title: "Atalhos das ferramentas do Windows | WinCare" },
      {
        name: "description",
        content:
          "Abra Gerenciador de Dispositivos, Gerenciamento de Disco, Serviços, Regedit, Eventos e Configurações em um clique.",
      },
      { property: "og:title", content: "Atalhos das ferramentas do Windows | WinCare" },
      {
        property: "og:description",
        content: "Todas as consoles nativas do Windows reunidas em uma tela.",
      },
    ],
  }),
  component: () => (
    <ToolSection
      title="Sistema"
      subtitle="Acesso rápido às consoles administrativas nativas do Windows."
      categories={["system"]}
    />
  ),
});
