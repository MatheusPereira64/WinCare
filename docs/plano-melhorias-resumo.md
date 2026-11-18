# Tasks do WinCare (resumo)

Detalhes completos de cada task em `docs/plano-melhorias.md`.

---

## T01 — Responsividade, DPI e zoom

**Task description**
Quero que o app fique bom em qualquer tamanho de janela, não só em 1360×900. A janela mínima é 1024×640 e muita gente usa notebook com escala de 125% ou 150%, então hoje tem tela cortada e card espremido. Revisa todas as páginas nessas larguras, faz a sidebar recolher sozinha em janela pequena, ajusta cabeçalhos, listas, gráficos e modais, e adiciona zoom com Ctrl +, Ctrl − e Ctrl 0 (salvo nas Configurações).

**How to judge completion**
- Nenhuma página tem rolagem horizontal em 1024×640, nem com zoom de 125%.
- Todos os botões principais continuam visíveis e clicáveis nesse tamanho.
- O script de screenshots gera uma matriz em 1024×640, 1366×768 e 1920×1080 em `docs/screenshots/responsivo/`.
- O zoom continua o mesmo depois de fechar e abrir o app.

**Other notes for the reviewer**
Compara os screenshots antes e depois. Atenção aos modais em 1024×640: os botões de ação não podem sumir. Não era para mudar o visual, só o layout.

---

## T02 — Acessibilidade e navegação por teclado

**Task description**
Quero dar para usar o app inteiro só com teclado e com o Narrador do Windows, nos dois temas. Roda o axe em todas as páginas e corrige os problemas, arruma contraste, foco visível, foco preso dentro dos modais, `aria` nos chips, listas e barras de progresso, e cria atalhos (Alt+1…9 para as páginas e `?` para ver os atalhos).

**How to judge completion**
- Zero violações sérias ou críticas do axe nas páginas principais, no tema claro e no escuro.
- Dá para executar uma ferramenta, confirmar um modal, desinstalar um programa e limpar um navegador (no modo demonstração) sem usar o mouse.
- Ao fechar um modal, o foco volta para o botão que o abriu.

**Other notes for the reviewer**
Testa você mesmo só com o teclado. O painel de atalhos não pode ter campo de texto. Animações devem respeitar "reduzir movimento" do Windows.

---

## T03 — Sistema de design e estados consistentes

**Task description**
Hoje cada tela carrega, mostra vazio e mostra erro de um jeito diferente, e tem muita classe CSS copiada na mão. Quero padronizar: uma regra para carregamento (`PageLoading` ou skeleton), um `ErrorState` com "Tentar de novo", componentes reaproveitáveis para os padrões repetidos, tema claro com a mesma hierarquia do escuro, e uma revisão dos textos. Documenta tudo em `docs/design-system.md`.

**How to judge completion**
- Nenhuma tela fica em branco carregando ou depois de um erro.
- Não sobram cópias das classes que viraram componente.
- Tema claro e escuro com a mesma hierarquia (compara `dashboard` e `dashboard-claro`).
- `docs/design-system.md` existe e explica quando usar cada estado.

**Other notes for the reviewer**
Não era para mudar a identidade visual (cores da marca, fonte, logo). Confere os textos: verbos consistentes, acentos certos e nada afirmando o que não foi medido.

---

## T04 — Recomendações unificadas com adiar/ignorar

**Task description**
Hoje temos dois motores de recomendação (`intelligence.ts` e `recommendations.ts`) e dois componentes (`RecommendationList` e `RecommendationsCard`), e o Dashboard esconde as duplicatas na mão. Quero um motor só, com todas as regras dos dois, um componente só (compacto no Dashboard e completo em Inteligência), e opção de adiar (1 ou 7 dias) ou ignorar uma recomendação.

**How to judge completion**
- Nenhuma recomendação aparece duplicada em lugar nenhum.
- `RecommendationsCard`, `recommendations.ts` e `COVERED_BY_MAINTENANCE` foram removidos e o knip passa.
- Adiar esconde o item até o prazo; ignorar só traz de volta se a condição sumir e voltar.
- Tem teste unitário das regras, de adiar e de ignorar.

**Other notes for the reviewer**
Confere que nenhuma regra dos dois motores antigos se perdeu (SMART, Windows Update atrasado, PC ligado há dias, sem agendamento, todas as unidades de disco). O aviso ao abrir o app tem que contar só as recomendações ativas.

---

## T05 — Primeira execução guiada e checkup rápido

**Task description**
Quem abre o WinCare pela primeira vez cai direto no Dashboard sem entender nada. Quero um assistente de 3–4 passos explicando o que o app faz (e o que nunca faz), com as preferências principais em switches, sugestão de agendar a limpeza semanal e explicação do modo administrador. No fim, um checkup rápido só com leituras, que também fica como botão no Dashboard.

**How to judge completion**
- O assistente aparece só na primeira abertura, pode ser pulado e reaberto nas Configurações.
- O checkup não pede UAC e termina em uns 15 segundos.
- O resumo do checkup mostra o que está bem, o que precisa de atenção e o atalho para resolver.

**Other notes for the reviewer**
Sem campo de texto no assistente. No modo demonstração tem que ficar claro que os dados são simulados. O checkup não pode rodar SFC, DISM nem chkdsk.

---

## T06 — Histórico de manutenção ("antes e depois")

**Task description**
Quero mostrar o quanto o app já ajudou: espaço liberado, programas removidos, reparos feitos e a saúde do PC ao longo do tempo. Grava um histórico de eventos de manutenção no processo principal (separado dos logs, com limite de tamanho), registrando limpezas, desinstalações, reparos, otimização de memória e jobs agendados. Cria uma página de histórico com totais por período (7/30/90 dias), gráfico semanal, linha do tempo e exportação.

**How to judge completion**
- Os totais batem com a soma dos eventos (com teste).
- O histórico sobrevive a reiniciar o app e não cresce sem limite.
- Limpezas agendadas aparecem junto com as manuais.
- Dá para exportar e apagar o histórico (com confirmação).

**Other notes for the reviewer**
Confere se todos os fluxos estão registrando eventos, principalmente desinstalação e jobs agendados. Precisa de dados simulados para a demo e os screenshots.

---

## T07 — Central de atualizações de programas (winget)

**Task description**
Quero mostrar em Programas quais apps têm atualização e deixar atualizar com um clique usando o `winget`. Detecta se o winget existe (se não existir, explica e abre o App Installer na Store), lista as atualizações sem pedir UAC, permite selecionar vários e atualizar com progresso por item, e deixa ignorar uma versão.

**How to judge completion**
- Funciona com e sem winget instalado.
- Um item com erro não interrompe os outros e o erro aparece na lista e no log.
- Tem teste garantindo que nenhum argumento do winget vem de texto mandado pelo renderer.
- Tem dados simulados e screenshot novo no README.

**Other notes for the reviewer**
Ponto mais importante: o renderer só manda o id da lista que o processo principal gerou, nunca o comando. Se a saída do winget for lida como texto, tem que funcionar com o console em português e em inglês. Precisa de teste numa máquina real atualizando pelo menos um programa.

---

## T08 — Bandeja do sistema, alertas e notificações

**Task description**
Quero que o WinCare avise quando algo importante acontece, mesmo com a janela fechada, sem virar app chato. Coloca um ícone na bandeja com atalhos (abrir, checkup, otimizar memória, limpeza rápida, sair), opção de continuar na bandeja ao fechar e de iniciar minimizado com o Windows, e um monitor leve que manda notificação para disco cheio, temperatura alta, Defender desligado e Windows Update atrasado.

**How to judge completion**
- Com "continuar na bandeja", fechar a janela não encerra o app e "Sair" encerra de vez.
- Um alerta não se repete antes do intervalo nem depois de ignorado.
- Cada tipo de alerta pode ser desligado e existe "não perturbe".
- O consumo em repouso está medido no resumo (CPU média abaixo de 1%).

**Other notes for the reviewer**
Por padrão, fechar a janela continua saindo do app e iniciar com o Windows vem desligado. Os alertas devem usar as regras do motor da T04 e respeitar adiar/ignorar. Confere que o monitor não roda duas vezes.

---

## T09 — Bateria e energia

**Task description**
Em notebook, quero mostrar a saúde da bateria de um jeito fácil de entender. Detecta se tem bateria, lê o `powercfg /batteryreport` e mostra saúde em %, desgaste, ciclos e gráfico da capacidade ao longo do tempo, com botão para abrir o relatório completo e dicas de energia quando fizer sentido.

**How to judge completion**
- Em desktop a seção não aparece.
- A leitura do relatório tem testes com pelo menos dois XML de exemplo (bateria boa e desgastada).
- Nenhum arquivo temporário fica para trás.

**Other notes for the reviewer**
O texto tem que ser honesto: desgaste é normal com o tempo, nada de assustar o usuário. As dicas só abrem páginas do Windows, não mudam configuração sozinhas. Precisa testar num notebook e num desktop de verdade.

---

## T10 — Testes de UI, E2E e regressão visual

**Task description**
Hoje só temos os testes de segurança do processo principal. Quero uma rede de segurança de verdade: Vitest para a lógica do renderer, Testing Library para os componentes principais (modal, chips, ToolCard, limpeza e desinstalação demo), Playwright para os fluxos principais e comparação visual dos screenshots com uma linha de base. Tudo no CI e documentado em `docs/testes.md`.

**How to judge completion**
- CI verde com os jobs novos.
- `test:unit`, `test:e2e` e `test:visual` existem e `npm test` continua rápido.
- Um bug colocado de propósito (por exemplo, quebrar o foco do modal ou o layout de uma página) faz algum teste falhar, e o resumo diz qual.

**Other notes for the reviewer**
Se o E2E rodar na build web em vez do Electron, tem que ter uma justificativa. Confere que a tolerância da comparação visual não é tão alta que deixa tudo passar.
