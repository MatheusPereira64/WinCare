# Plano de melhorias do WinCare (10 tasks)

Plano para execução por outro agente, task por task, com review depois de cada uma.
Cada task foi dimensionada para **3 a 5 horas** de trabalho contínuo, incluindo verificação.
Base: branch `development` em `d0a9a7c` (v1.0.6).

---

## Regras para todas as tasks

Leia antes de começar qualquer task. Elas valem mesmo quando a task não as repete.

**Git**

- Uma branch por task, criada a partir de `development`: `feat/t01-responsividade`, `feat/t02-...` etc.
- Commits pequenos e descritivos. Nada de `push --force`, rebase ou amend em commit já enviado: o repositório é sincronizado com o Lovable (ver `AGENTS.md`).
- Não faça push nem merge sem aprovação. A review acontece antes.

**Qualidade (o CI roda tudo isso; a task só está pronta se passar)**

```bash
npm test
npm run lint
npm run typecheck
npm run knip
npm run build
npm run wincare:build
```

- No Windows, `prettier --check` acusa CRLF por causa do `core.autocrlf`. Use `--end-of-line auto` localmente; o que vale é o arquivo no índice (LF).
- Código novo sem uso quebra o `knip`. Em módulos `.cjs`, importe com desestruturação (`const { fn } = require(...)`), senão o knip não enxerga o uso.

**Regras do app (já causaram bugs reais)**

- **Sem campo de texto livre na UI do Electron** (`.cursor/rules/electron-no-free-text-input.mdc`). Use presets, chips (`ChoiceChips`), switches e listas. A única exceção é a busca do `ToolSection`; não copie o padrão.
- **Sem portais/overlays do Radix** (Dialog, Popover, DropdownMenu, Select) no Electron: já prenderam a UI. Use `ModalShell` / `ConfirmModal` de `src/components/wincare/ConfirmModal.tsx`.
- **O renderer nunca manda caminho de arquivo, comando ou chave de registro para o processo principal.** Ele manda o `id` de um item que o processo principal listou antes, e o principal resolve o `id`. Siga o padrão de `electron/cleaner.cjs` e `electron/uninstaller.cjs`.
- **Modo demonstração**: tudo que depende de `window.wincare` precisa de dados simulados em `src/lib/wincare/bridge.ts`, para a versão web e para `npm run wincare:screenshots`.
- **PowerShell 5.1**: scripts longos vão por arquivo `.ps1` com BOM (`psFileJson` / `psAdminJson` em `electron/powershell.cjs`). `ConvertTo-Json` de um item só não vira array; normalize com `parseJsonOutput`.
- Ações que alteram o sistema pedem confirmação e, quando arriscadas, oferecem ponto de restauração (`tool.restorePoint`, `electron/restore-point.cjs`).
- Texto da interface em português do Brasil, com acentuação correta. Não afirme nada que não foi medido (ex.: "nenhum problema encontrado" sem ter verificado).

**Entrega de cada task**

1. Código + testes da task.
2. Screenshots atualizados quando a UI mudar (`npm run wincare:screenshots`; adicione rotas novas em `scripts/capture-screenshots.cjs` e no `README.md`).
3. Um resumo no final: o que foi feito, o que **não** foi feito, o que só foi testado em modo demonstração e o que precisa de UAC/hardware real para validar.

---

## Visão geral

| # | Task | Tipo | Depende de |
|---|------|------|------------|
| T01 | Responsividade, DPI e zoom | UI/responsividade | — |
| T02 | Acessibilidade e navegação por teclado | UX/a11y | T01 (recomendado) |
| T03 | Sistema de design e estados consistentes | UI | — |
| T04 | Recomendações unificadas com adiar/ignorar | Feature + UX | T03 (recomendado) |
| T05 | Primeira execução guiada e checkup rápido | Feature + UX | T04 |
| T06 | Histórico de manutenção ("antes e depois") | Feature | — |
| T07 | Central de atualizações de programas (winget) | Feature | — |
| T08 | Bandeja do sistema, alertas e notificações | Feature | T04 |
| T09 | Bateria e energia | Feature | — |
| T10 | Testes de UI, E2E e regressão visual | Qualidade | Melhor por último |

Ordem sugerida: T03 → T01 → T02 → T04 → T05 → T06 → T07 → T09 → T08 → T10.

---

## T01 — Responsividade, DPI e zoom

**Objetivo.** O app tem que ficar bom em qualquer tamanho de janela permitido e em qualquer escala do Windows, não só em 1360×900 a 100%.

**Contexto.**
- A janela abre em 1360×900 e aceita no mínimo 1024×640 (`electron/main.cjs`, criação da `BrowserWindow`).
- Notebooks comuns rodam com escala de 125% ou 150%: na prática a janela fica com 1024–1280 px úteis.
- A versão web (demo) também abre no celular.
- Layout geral em `src/routes/__root.tsx`; sidebar em `src/components/wincare/AppSidebar.tsx` (`collapsible="icon"`); grids espalhados nas rotas e em `ToolSection`, `ProgramUninstaller`, `BrowserCleaner`, `SchedulePanel`, `monitoramento.tsx`.

**Escopo.**
1. Auditar todas as rotas (`src/routes/*.tsx`) nas larguras 1024, 1280, 1440, 1920 e 2560, e na web em 375 e 768. Registrar os problemas encontrados (texto cortado, overflow horizontal, cards espremidos, botões quebrando linha, gráficos sem altura).
2. Sidebar recolhe sozinha para ícones abaixo de ~1200 px e volta ao expandir; a preferência manual do usuário tem prioridade e fica salva.
3. Cabeçalhos (`PageHeader`): ações e busca descem para a linha de baixo sem quebrar; badges não empurram o título.
4. Listas largas (programas, logs, inicialização, pastas do disco) viram layout empilhado em larguras pequenas, sem rolagem horizontal da página.
5. Gráficos do Monitoramento e do Dashboard redimensionam com a janela, sem altura zero e sem estourar o card.
6. Modais (`ModalShell`) cabem em 1024×640 com rolagem interna; os botões de ação ficam sempre visíveis.
7. Zoom do conteúdo: Ctrl `+`, Ctrl `-` e Ctrl `0` (via `webContents.setZoomFactor` no processo principal), com limite de 80%–150%, valor salvo nas Configurações e um controle de chips lá.
8. Container de conteúdo com largura máxima confortável em telas 2K/4K (hoje 1500 px): rever para os grids usarem a largura sem esticar linhas de texto.

**Fora de escopo.** Redesenho visual (T03), mudanças de navegação.

**Critérios de aceite.**
- Nenhuma rota tem rolagem horizontal da página em 1024×640, a 100% e com zoom de 125%.
- Todas as ações principais continuam visíveis e clicáveis em 1024×640.
- `scripts/capture-screenshots.cjs` ganha uma opção de viewport e gera uma matriz (1024×640, 1366×768, 1920×1080) para as rotas principais, salva em `docs/screenshots/responsivo/`.
- O zoom persiste entre aberturas do app.

**Verificação.** Rodar a matriz de screenshots e anexar as imagens no resumo, com antes e depois das telas que mais mudaram.

---

## T02 — Acessibilidade e navegação por teclado

**Objetivo.** O app inteiro funciona só com teclado e com leitor de tela (Narrador do Windows), atendendo WCAG 2.1 AA nos dois temas.

**Contexto.**
- Há poucos atributos `aria-*` no código.
- O `ModalShell` já foca o painel ao abrir, mas não prende o foco dentro dele.
- Existe `prefers-reduced-motion` em `src/styles.css`, mas não cobre todas as animações (`animate-fade-in`, loader, `hover-lift`).
- Componentes com lógica própria de interação: `ChoiceChips`, `ToolCard`/`ToolTile`, `BrowserCleaner` (itens expansíveis), `ProgramUninstaller` (lista e assistente), `StartupManager` (switches), sidebar.

**Escopo.**
1. Auditoria com axe (ex.: `@axe-core/playwright` ou o plugin do ESLint `jsx-a11y`) em todas as rotas, nos temas claro e escuro. Corrigir todos os problemas sérios e críticos.
2. Contraste AA em texto e ícones informativos nos dois temas (atenção ao `text-muted-foreground` sobre os cards translúcidos e aos badges de risco).
3. Foco visível e consistente em todo elemento interativo; ordem de tabulação lógica; link "Pular para o conteúdo".
4. `ModalShell`: prender o foco no modal, devolver o foco ao fechar, `aria-describedby` apontando para o texto do modal.
5. `ChoiceChips` como `radiogroup` com setas; listas expansíveis com `aria-expanded`/`aria-controls`; progresso com `role="progressbar"` e valores; anúncios de conclusão ou erro de tarefas longas via região `aria-live` (sem duplicar os toasts).
6. Atalhos de teclado globais: Alt+1…9 para as páginas da sidebar, `?` abre um painel de atalhos (modal só de leitura, sem campo de texto). Listar os atalhos na página Configurações.
7. Respeitar `prefers-reduced-motion` em todas as animações, incluindo o loader e as transições de página.

**Fora de escopo.** Tradução para outros idiomas.

**Critérios de aceite.**
- Zero violações sérias ou críticas do axe nas rotas principais, nos dois temas.
- Dá para executar uma ferramenta, confirmar o modal, desinstalar um programa (demo) e limpar um navegador (demo) sem mouse.
- Ao fechar um modal o foco volta para o botão que o abriu.

**Verificação.** Relatório do axe antes e depois no resumo; roteiro de teste só com teclado descrito passo a passo.

---

## T03 — Sistema de design e estados consistentes

**Objetivo.** Todas as telas falam a mesma língua visual: o mesmo cabeçalho, os mesmos estados de carregando/vazio/erro, os mesmos cards e o mesmo texto de ação.

**Contexto.**
- Há duas formas de carregamento: `Skeleton` (`BrowserCleaner`, `ProgramUninstaller`, `SchedulePanel`) e `PageLoading` (`DiskSpaceAnalyzer`, `StartupManager`). Também há `PageLoadingOverlay` no `__root.tsx`.
- Erros de IPC às vezes só viram toast, sem estado na tela.
- Classes repetidas à mão: `surface-panel border-border/50 p-5`, badges arredondados, chips de ícone (`size-10 rounded-xl bg-primary/15`).
- Componentes base: `PageHeader`, `EmptyState`, `StatCard`, `Card` (`src/components/ui/card.tsx`), tokens em `src/styles.css`.

**Escopo.**
1. Inventário rápido (no resumo): quais padrões existem hoje para cabeçalho, card, chip de ícone, badge, estado vazio, carregando e erro, e onde cada um aparece.
2. Definir uma regra: carregamento de página ou seção grande usa `PageLoading`; listas e cards usam skeleton com o formato do conteúdo final. Aplicar em todas as telas.
3. Criar um componente `ErrorState` (com "Tentar de novo") e usá-lo onde hoje uma falha de IPC deixa a tela vazia ou só mostra toast.
4. Extrair os padrões repetidos para variantes reutilizáveis (ex.: `IconChip`, variantes de `Card`/`Badge`) e substituir as cópias.
5. Revisar o tema claro: hoje ele foi pensado depois do escuro. Ajustar tokens de superfície, borda e sombra para os cards terem a mesma hierarquia nos dois temas.
6. Revisão de microcopy em todas as telas: verbos de ação consistentes ("Executar", "Analisar", "Limpar"), sem jargão onde não precisa, acentuação correta, frases de confirmação que dizem o que vai acontecer e se dá para desfazer.
7. Documentar o resultado em `docs/design-system.md` (tokens, componentes, quando usar cada estado, regras de texto).

**Fora de escopo.** Mudar a identidade visual (cores da marca, fonte, logo).

**Critérios de aceite.**
- Nenhuma tela mostra área em branco durante carregamento ou após erro de IPC.
- Não sobram cópias das classes extraídas fora dos componentes novos.
- Tema claro e escuro com a mesma hierarquia visual (comparar screenshots `dashboard` e `dashboard-claro`).

---

## T04 — Recomendações unificadas com adiar/ignorar

**Objetivo.** Um único motor de recomendações, uma única forma de mostrá-las, e o usuário pode adiar ou ignorar uma recomendação.

**Contexto (dívida criada no último merge).**
- Existem dois motores: `src/lib/wincare/intelligence.ts` (`buildRecommendations`: RAM, disco C:, boot, temporários, temperatura, CPU, Defender, novos itens de inicialização, queda de saúde) e `src/lib/wincare/recommendations.ts` (todas as unidades, Defender, SMART, Windows Update atrasado, PC ligado há muitos dias, sem manutenção agendada).
- Existem dois componentes: `RecommendationList` (usado no Dashboard e em `/inteligencia`) e `RecommendationsCard` (card "Manutenção" no Dashboard, também dispara o toast ao abrir o app).
- No Dashboard, `COVERED_BY_MAINTENANCE` em `src/routes/index.tsx` esconde duplicatas na mão.

**Escopo.**
1. Um único módulo de regras (pode manter o nome `intelligence.ts` ou criar `recommendations/`), juntando todas as regras dos dois motores, sem duplicatas, com um formato só: `id`, severidade, título, detalhe, ação (rota interna **ou** alvo do Windows aberto por `openWindowsTarget`) e a evidência medida (ex.: "C: 93% usado").
2. Um único componente de lista, com variante compacta (Dashboard) e completa (`/inteligencia`). Remover `RecommendationsCard`, `recommendations.ts` e `COVERED_BY_MAINTENANCE`.
3. Ações por recomendação: **Adiar** (1 dia / 7 dias, por chips) e **Ignorar** (até a condição mudar, ex.: o disco voltar abaixo do limite e passar dele de novo). Estado salvo no `store` com limite de tamanho. Uma seção "Ignoradas" em `/inteligencia` para desfazer.
4. O aviso ao abrir o app passa a usar o motor único e conta só recomendações ativas (não adiadas nem ignoradas).
5. Testes unitários das regras (limites, deduplicação, adiar e ignorar com relógio fixo).

**Fora de escopo.** Regras novas além das que já existem nos dois motores (a T08 usa este motor para alertas).

**Critérios de aceite.**
- Nenhuma recomendação aparece duas vezes em lugar nenhum.
- Adiar some com o item e ele volta depois do prazo; ignorar só volta se a condição sumir e reaparecer.
- `knip` não acusa sobras dos componentes removidos.

---

## T05 — Primeira execução guiada e checkup rápido

**Objetivo.** Quem abre o WinCare pela primeira vez entende em menos de um minuto o que o app faz, configura o básico e recebe um diagnóstico útil.

**Contexto.**
- Hoje o app abre direto no Dashboard, sem explicação de modo administrador, ponto de restauração, agendamento ou modo demonstração.
- Peças existentes: `useAdmin` (reiniciar como admin), `autoRestorePoint` no `store`, `SchedulePanel`, `FullCheckCard`, motor de recomendações (T04).

**Escopo.**
1. Assistente de primeira execução em 3–4 passos (modal ou tela cheia, sem campo de texto): o que o app faz e o que ele nunca faz (não apaga senhas, favoritos, documentos); preferências com switches (ponto de restauração automático, aviso ao abrir, tema); sugestão de agendar a limpeza semanal (ativa com um clique pelo agendador existente); explicação do modo administrador com botão para reiniciar como admin.
2. Pode ser pulado e reaberto pelas Configurações ("Rever introdução"). Salvar que já foi visto.
3. "Checkup rápido" no fim do assistente e também como botão no Dashboard: roda só leituras rápidas (sem SFC/DISM/chkdsk), mostra o progresso por etapa e termina com um resumo: o que está bem, o que precisa de atenção (do motor da T04) e o atalho para resolver cada item.
4. Na versão web e no modo demonstração, o assistente deixa claro que os dados são simulados.

**Fora de escopo.** Conta de usuário, telemetria.

**Critérios de aceite.**
- Aparece só na primeira abertura (testável limpando os dados do app nas Configurações).
- O checkup não pede UAC e termina em menos de ~15 s numa máquina comum.
- O resumo do checkup só afirma o que foi medido.

---

## T06 — Histórico de manutenção ("antes e depois")

**Objetivo.** Mostrar o valor que o app entregou ao longo do tempo: espaço liberado, programas removidos, reparos feitos e a evolução da saúde do PC.

**Contexto.**
- A página `/logs` lista as últimas execuções (`store.ts`, `MAX_RUNS = 30`, `MAX_LINES_PER_RUN = 30`, tudo em `localStorage` com limite de 512 KB).
- As limpezas agendadas gravam histórico separado no processo principal (`scheduler.readHistory`).
- `intelligenceStore` guarda amostras de saúde (`samples`); `HealthTimelineCard` e `Sparkline` já existem.

**Escopo.**
1. Persistir um histórico de **eventos de manutenção** no processo principal (arquivo JSON em `userData`, com rotação/limite), separado dos logs brutos: tipo (limpeza, desinstalação, reparo, otimização de memória, agendada), data, resultado e números medidos (bytes liberados, itens removidos, duração). Registrar a partir dos fluxos existentes: `BrowserCleaner`, limpezas do `ToolSection`, `ProgramUninstaller`, `FullCheckCard`, `MemoryOptimizerCard` e jobs agendados.
2. Nova página "Histórico" (ou reformular `/logs` com abas por chips "Resumo" / "Execuções"):
   - totais do período (7 / 30 / 90 dias, por chips): espaço liberado, programas removidos, reparos, limpezas agendadas que rodaram;
   - gráfico de espaço liberado por semana e linha de saúde no mesmo período;
   - linha do tempo dos eventos, com filtro por tipo e link para o log da execução quando existir.
3. Exportar o histórico como relatório (HTML ou texto, usando `wincare:saveTextFile`).
4. Botão para apagar o histórico, com confirmação.
5. Dados simulados no `bridge.ts` para a demo e os screenshots.

**Fora de escopo.** Sincronização na nuvem.

**Critérios de aceite.**
- Os números do resumo batem com a soma dos eventos (teste unitário).
- O histórico sobrevive a reiniciar o app e não cresce sem limite.
- Execuções feitas pelo agendador aparecem junto das manuais.

---

## T07 — Central de atualizações de programas (winget)

**Objetivo.** Mostrar quais programas instalados têm atualização disponível e atualizar com um clique, usando o `winget` do próprio Windows.

**Contexto.**
- A página `/programas` (`ProgramUninstaller`, `electron/uninstaller.cjs`) já lista os programas instalados.
- Padrões de execução e segurança em `electron/powershell.cjs` e `electron/native-actions.cjs`; não existe nada de winget hoje.

**Escopo.**
1. Detectar se o `winget` existe (App Installer). Se não existir, mostrar um estado explicando e um botão que abre a página do App Installer na Microsoft Store (alvo fixo).
2. Listar atualizações com `winget upgrade` (preferir saída estruturada; se precisar interpretar texto, cobrir o caso de console em português e inglês com testes). Ler sem pedir UAC.
3. Nova seção ou aba em `/programas`: lista com nome, versão atual → nova versão, origem; filtro por chips (todos / com atualização). Seleção múltipla e "Atualizar selecionados".
4. Atualizar via `winget upgrade --id <id> --exact --silent --accept-package-agreements --accept-source-agreements`, **com o id vindo da lista que o processo principal gerou** (o renderer manda só o índice/id da varredura). Progresso por item no `CommandFeed`; um item com erro não interrompe os outros.
5. Programas que exigem fechar o app ou pedir UAC: avisar antes e tratar o código de saída do winget.
6. Opção "Ignorar esta versão" salva localmente.
7. Dados simulados para a demo e um screenshot novo no README.

**Fora de escopo.** Instalar programas novos, catálogo de programas.

**Critérios de aceite.**
- Funciona com e sem winget instalado (no segundo caso, o estado explicativo).
- Nenhum argumento do winget vem de texto enviado pelo renderer (teste de segurança em `electron/tests/`).
- Falha de um item fica visível na lista e no log.

**Validação manual necessária.** Atualizar de verdade ao menos um programa numa máquina real e registrar no resumo.

---

## T08 — Bandeja do sistema, alertas e notificações

**Objetivo.** O WinCare avisa quando algo importante acontece, mesmo com a janela fechada, sem virar um app chato.

**Contexto.**
- Hoje só o agendador mostra `Notification` nativa (`electron/scheduler.cjs`).
- Fechar a janela encerra o app.
- As métricas vêm de `electron/system-metrics.cjs` / `wincare:systemInfo`.
- O motor de recomendações é o da T04.

**Escopo.**
1. Ícone na bandeja com menu: Abrir, Checkup rápido (T05), Otimizar memória, Limpeza rápida (os mesmos itens seguros do job agendado), Sair.
2. Configuração "Ao fechar a janela": sair / continuar na bandeja (padrão: sair, para não surpreender). Opção "Iniciar com o Windows minimizado na bandeja" (registro de inicialização do usuário, sem admin), desligada por padrão.
3. Monitor leve em segundo plano (intervalo de minutos, não segundos) que avalia só regras de alerta: disco quase cheio, temperatura alta sustentada, Defender desativado, Windows Update atrasado. Reaproveitar as regras do motor da T04.
4. Notificação nativa por alerta com ação "Abrir no WinCare" que leva à página certa. Sem repetir o mesmo alerta antes de um intervalo configurável; respeitar adiar/ignorar da T04.
5. Configurações: ligar/desligar cada tipo de alerta e o "não perturbe" (chips de horário, sem campo de texto).
6. Garantir que o monitor não roda duas vezes (instância única) e não pesa no PC (medir CPU/RAM em repouso e registrar no resumo).

**Fora de escopo.** Alertas por e-mail ou celular.

**Critérios de aceite.**
- Com a opção "continuar na bandeja", fechar a janela não encerra o processo, e Sair encerra de vez.
- Um alerta não reaparece dentro do intervalo nem depois de ignorado.
- Consumo em repouso documentado (ex.: CPU média < 1%).

---

## T09 — Bateria e energia

**Objetivo.** Em notebooks, mostrar a saúde da bateria e dicas de energia que o usuário entende.

**Contexto.**
- `electron/main.cjs` já executa `powercfg` para planos de energia (`runPowerCfg`) e a página Sistema tem perfis (`SystemProfilesCard`).
- Não existe nada sobre bateria.

**Escopo.**
1. Detectar se há bateria (CIM `Win32_Battery`). Em desktop, a seção não aparece.
2. Gerar `powercfg /batteryreport /xml` num arquivo temporário (caminho decidido pelo processo principal) e extrair: capacidade de projeto, capacidade atual de carga completa, % de desgaste, ciclos, histórico de capacidade e estimativa de autonomia.
3. Card "Bateria" na página Sistema (e item no Dashboard só em notebooks): saúde em %, desgaste, ciclos, gráfico de capacidade ao longo do tempo, e o que significa cada faixa (texto honesto: desgaste é normal com o tempo).
4. Botão "Abrir relatório completo" que gera o relatório HTML do `powercfg` e abre no navegador.
5. Dicas de energia quando relevante: plano de alto desempenho ligado na bateria, brilho/suspensão (apenas abrindo as páginas certas de `ms-settings:`), apps com alto consumo se o relatório trouxer.
6. Regras de recomendação para bateria muito desgastada, integradas ao motor da T04 (ou deixar o gancho pronto, se a T04 ainda não estiver feita).
7. Dados simulados para a demo e testes da interpretação do XML com amostras salvas em `electron/tests/fixtures/`.

**Fora de escopo.** Calibração de bateria, alterar configurações de firmware.

**Critérios de aceite.**
- Interpretação do relatório coberta por testes com pelo menos dois XML de exemplo (um saudável, um desgastado).
- Nenhum arquivo temporário fica para trás.

**Validação manual necessária.** Testar num notebook real e num desktop.

---

## T10 — Testes de UI, E2E e regressão visual

**Objetivo.** Ter uma rede de segurança automática para as próximas mudanças, de forma que a review não dependa só de olhar código.

**Contexto.**
- Hoje há só `electron/tests/safety.test.cjs` (node:test, 15 testes de segurança do processo principal).
- Não há testes de componentes nem E2E.
- `scripts/capture-screenshots.cjs` já sabe abrir o app em modo demonstração e capturar cada rota.

**Escopo.**
1. Testes unitários da lógica do renderer com Vitest: `runner.ts`, `store.ts` (persistência e limites), `commandFeed.ts` (interpretação do log), motor de recomendações, `report.ts`.
2. Testes de componentes com Testing Library: `ConfirmModal`/`ModalShell` (Esc, clique fora, bloqueio, foco), `ChoiceChips`, `ToolCard` (confirmação e ponto de restauração), `BrowserCleaner` e `ProgramUninstaller` em modo demonstração.
3. E2E com Playwright contra o Electron (ou a build web em modo demonstração, se o Electron no CI Linux for inviável; justificar a escolha): navegar por todas as rotas, executar uma ferramenta segura, fluxo de desinstalação demo, limpeza demo, troca de tema.
4. Regressão visual: comparar os screenshots gerados com uma linha de base salva no repositório, com tolerância, e falhar mostrando a diferença.
5. Integrar no workflow `.github/workflows/test.yml` (unitários e componentes sempre; E2E/visual pode ser um job separado). Scripts no `package.json`: `test:unit`, `test:e2e`, `test:visual`; `npm test` continua rodando tudo que é rápido.
6. Documentar em `docs/testes.md` como rodar e como atualizar a linha de base visual.

**Fora de escopo.** Testes contra o Windows real no CI (UAC, registro, agendador).

**Critérios de aceite.**
- CI verde com os novos jobs.
- Um bug introduzido de propósito (ex.: quebrar o foco do modal ou o layout de uma rota) faz algum teste falhar; descrever no resumo qual teste pegou.

---

## Checklist de review (para usar em cada task)

- [ ] Todos os comandos de qualidade passam e o CI está verde.
- [ ] A task cumpre todos os critérios de aceite, e o resumo diz claramente o que ficou de fora.
- [ ] Nenhum campo de texto livre novo, nenhum portal Radix novo.
- [ ] Nenhum caminho, comando ou chave de registro vem do renderer para o processo principal.
- [ ] Tudo funciona em modo demonstração e os screenshots foram atualizados.
- [ ] Texto em pt-BR, com acentos, sem afirmar o que não foi medido.
- [ ] Ações destrutivas pedem confirmação; as arriscadas oferecem ponto de restauração.
- [ ] Nada de código morto (knip) e nenhuma duplicação nova de componente ou regra.
- [ ] Layout ok em 1024×640 (depois da T01, rodar a matriz de screenshots).
