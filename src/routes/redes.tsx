import { createFileRoute } from "@tanstack/react-router";
import { ToolSection } from "@/components/wincare/ToolSection";

/**
 * Só ToolSection + tools fixos — sem card de probe com campo de texto.
 * (No Electron, o leading com input travava a UI ao abrir a aba.)
 */
export const Route = createFileRoute("/redes")({
  head: () => ({
    meta: [
      { title: "Testes e reparo de rede | WinCare" },
      {
        name: "description",
        content:
          "Ping, DNS, tracert, ipconfig, flush DNS, reset Winsock/TCP-IP, velocidade e Wi‑Fi.",
      },
      { property: "og:title", content: "Testes e reparo de rede | WinCare" },
      {
        property: "og:description",
        content: "Diagnóstico e reparo de conectividade do Windows em um só lugar.",
      },
    ],
  }),
  component: () => (
    <ToolSection
      title="Redes"
      subtitle="Teste conectividade, consulte DNS e execute reparos da pilha de rede do Windows."
      categories={["network"]}
    />
  ),
});
