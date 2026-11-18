import { SHORTCUT_PAGES } from "./navigation";

export interface Shortcut {
  keys: string[][];
  action: string;
}

/** Lista única: diálogo de ajuda (? / F1) e página de Configurações. */
export function shortcutSections(): { title: string; items: Shortcut[] }[] {
  return [
    {
      title: "Páginas",
      items: SHORTCUT_PAGES.map((page) => ({
        keys: [["Alt", page.shortcut!]],
        action: page.title,
      })),
    },
    {
      title: "Geral",
      items: [
        { keys: [["?"], ["F1"]], action: "Mostrar os atalhos de teclado" },
        {
          keys: [["Ctrl", "K"]],
          action: "Pesquisar ferramenta (Reparo, Limpeza, Disco, Sistema, Redes)",
        },
        { keys: [["Ctrl", "B"]], action: "Mostrar ou recolher a barra lateral" },
        { keys: [["Alt", "T"]], action: "Ir para as notificações" },
        { keys: [["Esc"]], action: "Fechar diálogo ou barra lateral aberta por cima" },
      ],
    },
    {
      title: "Navegar com o teclado",
      items: [
        { keys: [["Tab"], ["Shift", "Tab"]], action: "Próximo / controle anterior" },
        {
          keys: [
            ["←", "→"],
            ["Home", "End"],
          ],
          action: "Trocar a opção em grupos de escolha e abas",
        },
        { keys: [["Enter"], ["Espaço"]], action: "Ativar botão, link ou interruptor" },
      ],
    },
    {
      title: "Zoom",
      items: [
        { keys: [["Ctrl", "+"]], action: "Aumentar o zoom" },
        { keys: [["Ctrl", "−"]], action: "Diminuir o zoom" },
        { keys: [["Ctrl", "0"]], action: "Zoom padrão (100%)" },
      ],
    },
  ];
}

/* Abrir a ajuda de qualquer lugar (barra superior, Configurações, menu do app). */
const openListeners = new Set<() => void>();

export function openShortcutsHelp() {
  openListeners.forEach((listener) => listener());
}

/** Registra quem mostra o diálogo; retorna a função para cancelar. */
export function onOpenShortcutsHelp(listener: () => void) {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}
