import { createFileRoute } from "@tanstack/react-router";
import { ToolSection } from "@/components/wincare/ToolSection";

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
  component: () => (
    <ToolSection
      title="Rede"
      subtitle="Testes de conectividade e reparo da pilha de rede do Windows."
      categories={["network"]}
    />
  ),
});
