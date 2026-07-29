import { createFileRoute } from "@tanstack/react-router";
import { ToolSection } from "@/components/wincare/ToolSection";
import { isNative } from "@/lib/wincare/bridge";
import type { ToolCategory } from "@/lib/wincare/types";

const NETWORK_CATEGORIES: ToolCategory[] = ["network"];

function RedePage() {
  return (
    <ToolSection
      title="Rede"
      developmentBadge="Em desenvolvimento"
      subtitle={
        isNative()
          ? "Testes de conectividade e reparo da pilha de rede — comandos reais do Windows. Esta seção ainda está instável no modo nativo."
          : "Modo demonstração — use o app desktop (npm run electron:dev) para testes reais."
      }
      categories={NETWORK_CATEGORIES}
    />
  );
}

export const Route = createFileRoute("/rede")({
  head: () => ({
    meta: [
      { title: "Diagnóstico de rede e internet | WinCare" },
      {
        name: "description",
        content:
          "Ping, traceroute, consulta DNS, reset do Winsock e TCP/IP, renovação de IP e teste de velocidade.",
      },
      { property: "og:title", content: "Diagnóstico de rede e internet | WinCare" },
      {
        property: "og:description",
        content: "Resolva problemas de conexão com ferramentas nativas do Windows.",
      },
    ],
  }),
  component: RedePage,
});
