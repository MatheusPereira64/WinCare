import { createFileRoute } from "@tanstack/react-router";

import { TrayPanel } from "@/components/wincare/TrayPanel";

/** Painel da bandeja (janela pequena ao lado do relógio). Sem barra lateral nem cabeçalho. */
export const Route = createFileRoute("/painel")({
  head: () => ({ meta: [{ title: "WinCare — painel" }] }),
  component: TrayPanel,
});
