# Testes do WinCare

Quatro camadas, do mais rápido ao mais completo. As duas primeiras rodam em `npm test`
(alguns segundos); E2E e visual têm scripts próprios. Todas rodam no CI
(`.github/workflows/test.yml`) em cada push e pull request para `main` e `development`.

| Camada                           | Ferramenta                       | Onde ficam                  | Comando               |
| -------------------------------- | -------------------------------- | --------------------------- | --------------------- |
| Processo principal               | `node --test`                    | `electron/tests/*.test.cjs` | `npm run test:main`   |
| Lógica do renderer e componentes | Vitest + Testing Library (jsdom) | `src/**/*.test.ts(x)`       | `npm run test:unit`   |
| Fluxos principais (E2E)          | Playwright (Chromium)            | `e2e/flows/*.spec.ts`       | `npm run test:e2e`    |
| Regressão visual                 | Playwright `toHaveScreenshot`    | `e2e/visual/`               | `npm run test:visual` |

```bash
npm test                 # processo principal + Vitest (rápido; rode antes de cada commit)
npm run test:unit:watch  # Vitest em modo observação, enquanto você edita
npm run test:coverage    # Vitest com cobertura (relatório em coverage/index.html)
npm run test:e2e         # compila o renderer e roda os fluxos no Chromium
npm run test:visual      # compila e compara as telas com a linha de base (precisa de Docker)
npm run test:all         # tudo acima, em sequência
```

Antes de rodar Playwright pela primeira vez: `npx playwright install chromium`.

---

## 1. Processo principal — `electron/tests/`

Testes com `node:test`, sem Electron: cada módulo do processo principal expõe as funções
puras que importam e os testes as chamam diretamente.

| Arquivo                        | O que garante                                                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `safety.test.cjs`              | Proteções contra exclusão indevida (pastas do sistema, caminhos fora da lista, chaves de registro protegidas)                                                                                                                                                      |
| `battery.test.cjs`             | Leitura do `powercfg /batteryreport /xml`: amostras em `fixtures/` (notebook saudável, desgastado com troca de bateria, desktop), histórico mês a mês, uso na tomada, e **nenhum arquivo temporário fica para trás** — nem quando o `powercfg` ou a leitura falham |
| `maintenance-history.test.cjs` | Limites, saúde diária e classificação de comandos do histórico                                                                                                                                                                                                     |
| `alerts.test.cjs`              | Regras dos alertas da bandeja (histerese, lembretes, silenciar) com dias simulados                                                                                                                                                                                 |
| `window-ui.test.cjs`           | Tamanho inicial da janela, atalhos de zoom e de página                                                                                                                                                                                                             |

As amostras de bateria (`electron/tests/fixtures/battery-*.xml`) seguem o formato real do
Windows 11 (CRLF, namespace, atributos do `HistoryEntry`) sem dados pessoais. Para
acrescentar uma amostra real: `powercfg /batteryreport /xml /output bateria.xml`, troque
`ComputerName`, `SerialNumber` e `SystemProductName`, e salve em `fixtures/`.

## 2. Renderer — Vitest + Testing Library

Config: `vitest.config.ts` (separada do `vite.config.ts` do Lovable, que traz TanStack
Start/nitro). Ambiente comum em `src/test/setup.ts`: matchers do jest-dom, limpeza do DOM,
`localStorage`, `window.wincare` e do cache de leituras (`systemData`) entre testes.

**Lógica** (`src/lib/wincare/*.test.ts`): `battery` (saúde, desgaste, faixas, dicas),
`recommendations` (inclui a regra de bateria muito desgastada), `history`, `runner`
(execução, UAC, ponto de restauração antes da ação, sem execução dupla), `store`
(persistência, limites, dados corrompidos), `commandFeed` (interpretação da saída do
SFC/DISM/chkdsk) e `report` (relatório de diagnóstico).

**Componentes** (`src/components/wincare/*.test.tsx`): `ModalShell`/`ConfirmModal` (Esc,
clique fora, bloqueio, foco preso e devolvido, app inerte), `ChoiceChips` (radiogroup,
setas), `ToolCard` (confirmação, ponto de restauração marcado/desmarcado), `BrowserCleaner`
e `ProgramUninstaller` em modo demonstração, `BatteryCard`, `BatteryCapacityChart` e
`HealthRing`.

Como testar o app para Windows sem Windows: instale um `window.wincare` falso no teste
(veja `installNative` em `BatteryCard.test.tsx` e `runner.test.ts`). Sem ele, o componente
usa o modo demonstração.

> **Windows, letra do drive:** `npm run test:unit` passa por `scripts/vitest.cjs`, que
> reinicia o Vitest com a letra do drive em maiúscula. Aberto como `f:\…` (comum no
> VS Code), o Vitest carrega o runner duas vezes e todo arquivo falha com
> "failed to find the current suite". Use os scripts npm em vez de `npx vitest`.

## 3. E2E — Playwright (`e2e/flows/`)

Rodam no **build do renderer** (`dist/`, o mesmo que o Electron carrega), servido por
`scripts/serve-dist.cjs`, em **modo demonstração**: sem o preload do Electron o app usa
dados simulados.

**Por que não contra o Electron:** o processo principal só funciona de verdade no Windows
(PowerShell, `powercfg`, registro, UAC, Agendador). No CI Linux ele não teria o que
executar, e no Windows os testes mexeriam no sistema de quem roda. O que cada ação
nativa faz já é coberto em `electron/tests/` e os componentes testam a ponte com um
`window.wincare` falso; o E2E cobre a interface inteira, a navegação e os fluxos ponta a
ponta com os mesmos dados da demonstração.

Fluxos cobertos:

- `navigation.spec.ts` — todas as rotas pela barra lateral; recomendação do Dashboard leva
  à página certa; tema claro aplica na hora e continua depois de recarregar.
- `maintenance.spec.ts` — limpeza de navegadores (com confirmação) entra no Histórico;
  desinstalação + remoção de sobras; ferramenta segura (DISM CheckHealth) até "Concluído"
  com a saída técnica; cancelar a confirmação não executa nada.
- `battery.spec.ts` — card da bateria, gráfico (dica ao passar o mouse e tabela), dicas e
  relatório completo.

`e2e/fixtures.ts` fixa o ambiente: relógio em 18/11/2026 12:00 (Brasília), `pt-BR`,
`Math.random` com semente, introdução já vista e checagem automática desligada.

## 4. Regressão visual (`e2e/visual/`)

`screens.spec.ts` captura Dashboard (escuro e claro), Sistema, Limpeza, Programas,
Reparo, diálogo de confirmação, Histórico, Configurações e o card da bateria (escuro e
claro), e compara com as referências em `e2e/visual/__screenshots__/`.

**Determinismo:** o relógio fica parado e avança uma quantidade fixa (`settle`) — o
Dashboard atualiza a cada 3 s, então o número de atualizações é sempre o mesmo. Animações
e cursor desligados.

**Sempre no contêiner Linux:** fontes e antialiasing mudam entre sistemas, então as
referências são geradas e comparadas na imagem oficial do Playwright
(`mcr.microsoft.com/playwright:v<versão>-noble`) — localmente via Docker
(`scripts/visual-docker.cjs`) e no CI no mesmo contêiner. Por isso as capturas usam a
fonte de reserva do Linux, não a Segoe UI: o objetivo é pegar mudanças de layout, cor e
conteúdo, não reproduzir o Windows pixel a pixel.

**Tolerância:** no máximo 10 pixels diferentes por imagem (`maxDiffPixels` em
`playwright.config.ts`). No contêiner a renderização é idêntica entre execuções; com uma
tolerância de 1% da tela, trocar uma letra de um título passava despercebido.

### Atualizar a linha de base

Quando uma mudança visual é intencional:

```bash
npm run test:visual:update      # regrava e2e/visual/__screenshots__/ no contêiner
git diff --stat e2e/visual      # confira quais telas mudaram
```

Abra as imagens alteradas e confirme que só mudou o que você pretendia antes do commit.
Quando o teste falha no CI, o artifact **playwright-visual-diffs** traz, para cada tela, a
referência, a captura atual e a imagem de diferença (também no `playwright-report/` local:
`npx playwright show-report`).

Ao atualizar `@playwright/test`, troque a tag da imagem em `.github/workflows/test.yml`
(o script local lê a versão instalada) e regrave a linha de base.

## CI

`.github/workflows/test.yml`, três jobs em paralelo:

1. **Lint, types, unit tests & build** — `test:main`, Vitest com cobertura (artifact
   `coverage`), ESLint, `tsc`, knip e os dois builds.
2. **E2E (Playwright)** — Chromium no Ubuntu; em falha, relatório e traces no artifact
   `playwright-e2e-report`.
3. **Visual regression** — no contêiner do Playwright; em falha, diffs no artifact
   `playwright-visual-diffs`.

## A rede pega erros de verdade?

Conferido de propósito antes de fechar esta camada:

- **Foco do modal quebrado** (`useFocusTrap` sem o `focus()` inicial): 7 testes falham em
  `ConfirmModal.test.tsx` e `ModalShell.test.tsx` (foco, Esc, devolução do foco).
- **Mudança visual pequena** (título "Bateria" → "Baterias"): `tela: sistema`,
  `card da bateria` e `card da bateria (claro)` falham com 40–42 pixels diferentes.
- **Bug encontrado pelos testes novos:** `normalizeCmdText` juntava colunas de tabelas do
  `wmic` ("C: 1428… 5111…" virava "C:1428…5111…") porque contava os espaços repetidos
  como letras soltas. Corrigido e coberto em `commandFeed.test.ts`.

## Escrevendo testes novos

- Lógica pura: `src/lib/wincare/<módulo>.test.ts`, sem DOM quando possível.
- Componente: busque pelo papel e nome acessível (`getByRole("button", { name })`) — se
  o teste não acha, o Narrador também não.
- Fluxo novo: `e2e/flows/`, usando `test`/`openRoute` de `e2e/fixtures.ts`.
- Tela nova: acrescente em `SCREENS` de `e2e/visual/screens.spec.ts` e rode
  `npm run test:visual:update`.
