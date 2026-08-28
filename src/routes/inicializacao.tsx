import { createFileRoute } from "@tanstack/react-router";
import { StartupManager } from "@/components/wincare/StartupManager";

export const Route = createFileRoute("/inicializacao")({
  head: () => ({
    meta: [
      { title: "Gerenciador de inicialização | WinCare" },
      {
        name: "description",
        content:
          "Veja o consumo de RAM dos programas que abrem com o Windows e receba recomendações do que desativar para o PC ligar mais rápido.",
      },
      { property: "og:title", content: "Gerenciador de inicialização | WinCare" },
      {
        property: "og:description",
        content: "Controle a inicialização do Windows e reduza lentidão no boot.",
      },
    ],
  }),
  component: StartupPage,
});

function StartupPage() {
  return <StartupManager />;
}
