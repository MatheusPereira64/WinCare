import { createFileRoute } from "@tanstack/react-router";
import { SchedulePanel } from "@/components/wincare/SchedulePanel";

export const Route = createFileRoute("/agendamento")({
  head: () => ({
    meta: [
      { title: "Agendar manutenção automática | WinCare" },
      {
        name: "description",
        content:
          "Agende limpeza e verificação completa em horário fixo pelo Agendador de Tarefas do Windows.",
      },
      { property: "og:title", content: "Agendar manutenção automática | WinCare" },
      {
        property: "og:description",
        content: "Limpeza e verificação do Windows rodando sozinhas em horário fixo.",
      },
    ],
  }),
  component: SchedulePanel,
});
