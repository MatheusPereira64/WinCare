import { createFileRoute } from "@tanstack/react-router";
import { ProgramUninstaller } from "@/components/wincare/ProgramUninstaller";

export const Route = createFileRoute("/programas")({
  head: () => ({
    meta: [
      { title: "Desinstalar programas e remover resíduos | WinCare" },
      {
        name: "description",
        content:
          "Desinstale programas e remova pastas e chaves de registro deixadas para trás, revisando tudo antes.",
      },
      { property: "og:title", content: "Desinstalar programas e remover resíduos | WinCare" },
      {
        property: "og:description",
        content: "Desinstalador com remoção de resíduos e revisão antes de apagar.",
      },
    ],
  }),
  component: ProgramUninstaller,
});
