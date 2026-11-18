# Design system do WinCare

Guia de como as telas do WinCare são montadas: tokens, componentes, estados (carregando, vazio, erro), recomendações e texto. Antes de escrever classes à mão, procure aqui o componente que já resolve.

> Código: `src/styles.css` (tokens), `src/lib/wincare/tone.ts` (tons), `src/components/wincare/` (componentes), `src/lib/wincare/useResource.ts` (carregamento), `src/lib/wincare/format.ts` (números e plural).

---

## 1. Princípios

1. **Um jeito de fazer cada coisa.** Card é `Panel`, selo é `StatusBadge`, carregando é `LoadingState`. Variação de borda, raio ou espaçamento por tela não é estilo — é inconsistência.
2. **Estado sempre explícito.** Toda tela que busca dados mostra carregando, erro (com “Tentar novamente”) ou vazio — nunca uma tela em branco ou um “nada aqui” quando na verdade falhou.
3. **A cor reforça, não informa sozinha.** Todo estado colorido tem texto (“Crítico”, “Ativa”, “SMART OK”).
4. **Os dois temas têm a mesma hierarquia.** Fundo → barra lateral → cards → caixas internas sobem e descem nos mesmos degraus no escuro e no claro.
5. **Acessível por padrão.** Contraste AA, foco visível, nomes para leitor de tela — os componentes já fazem isso; não desfaça com classes avulsas.

---

## 2. Tokens

### Superfícies (hierarquia)

Degraus medidos em luminosidade OKLCH (perceptual). O claro foi ajustado para repetir os degraus do escuro.

| Nível         | Token / classe     | Escuro (L)               | Claro (L)    | Uso                                           |
| ------------- | ------------------ | ------------------------ | ------------ | --------------------------------------------- |
| Fundo         | `--background`     | 0,145                    | 0,95         | Área da página                                |
| Barra lateral | `--sidebar`        | 0,165 (+0,02)            | 0,97 (+0,02) | Navegação — perto do fundo                    |
| Card          | `--card` + `Panel` | 0,195 (+0,05)            | 1,00 (+0,05) | Todo bloco de conteúdo                        |
| Caixa interna | `surface-inset`    | fundo a 40% sobre o card | idem         | Legendas, opções, sublistas dentro de um card |
| Realce        | `bg-muted`         | 0,25                     | 0,93         | Faixas de barra, teclas, esqueleto            |

- Cards no claro têm sombra de 1px (`--shadow-elevated`) para terem borda nítida sobre o fundo.
- Borda de card e divisores: **sempre** `border-border/60` / `divide-border/60` (já vem no `Panel`/`ListPanel`).
- Contorno de campos e controles: `--input` (≥ 3:1 contra o fundo nos dois temas).

### Cores de texto e tons

| Tom (`Tone`) | Token                | Quando                                  |
| ------------ | -------------------- | --------------------------------------- |
| `neutral`    | `--muted-foreground` | Informação secundária, estado desligado |
| `primary`    | `--primary`          | Ação, seleção, informação em destaque   |
| `success`    | `--success`          | Deu certo, está protegido, é seguro     |
| `warning`    | `--warning`          | Merece atenção, mas não é urgente       |
| `danger`     | `--destructive`      | Problema, risco alto, falha             |

Todos têm ≥ 4,5:1 como texto nos dois temas, inclusive sobre o próprio fundo tingido (`/10`, `/15`). Preenchimentos com texto branco (botão principal, chip selecionado) usam `--primary-solid` / `--destructive-solid`.

Use os mapas de `tone.ts` em vez de escrever as classes:

```ts
import {
  TONE_BADGE,
  TONE_CALLOUT,
  TONE_FILL,
  TONE_SOFT,
  TONE_TEXT,
  usageTone,
} from "@/lib/wincare/tone";

TONE_SOFT.warning; // "bg-warning/15 text-warning"   → chips de ícone
TONE_BADGE.success; // borda + fundo leve + texto     → selos
TONE_CALLOUT.warning; // caixa de aviso dentro de card/diálogo
TONE_FILL.danger; // preenchimento de barra/ponto
usageTone(92); // "danger"  (≥ 90 danger, ≥ 75 warning, senão primary)
```

`usageTone` é a **única** escala de uso de recurso (CPU, memória, disco, GPU) — medidores, cards e o otimizador de memória seguem a mesma.

### Raio, espaço, tipografia

- Raio: cards `rounded-xl` (vem do `Panel`), caixas internas `rounded-xl` (`surface-inset`), selos e chips `rounded-full`.
- Espaço interno do card: `padding="sm" | "md" | "lg"` no `Panel` (16 / 20 / 20→24 px). Entre blocos do card: `gap-4` (padrão).
- Entre cards numa página: `space-y-6`. Grids de cards: `gap-4`.
- Títulos: página `h1` (via `PageHeader`), card `h2` (via `PanelHeader`), item de card `h3`. Texto de apoio: `text-sm text-muted-foreground`; detalhes: `text-xs`.

---

## 3. Componentes

| Componente                                                    | Arquivo                  | Para quê                                                                                                                                      |
| ------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageHeader`                                                  | `PageHeader.tsx`         | Título da tela (h1, recebe o foco ao navegar), subtítulo, selos e ações                                                                       |
| `Panel`                                                       | `Panel.tsx`              | Todo card. `variant="default"` \| `"hero"` (um por tela) \| `"interactive"` (leva a algum lugar)                                              |
| `PanelHeader`                                                 | `Panel.tsx`              | Cabeçalho de card: ícone no tom, título, selos, descrição, ações (descem de linha quando falta espaço)                                        |
| `ListPanel`                                                   | `Panel.tsx`              | Lista dentro de moldura com divisores (programas, execuções, histórico). Passe os `<li>`                                                      |
| `IconChip`                                                    | `IconChip.tsx`           | Quadrado com ícone no tom (`sm` 32px, `md` 40px, `lg` 44px). Decorativo                                                                       |
| `StatusBadge`                                                 | `StatusBadge.tsx`        | Selo de estado com texto; `dot` para estados “ao vivo”                                                                                        |
| `StatCard`                                                    | `StatCard.tsx`           | Número de destaque com rótulo e barra opcional                                                                                                |
| `CheckboxCard`                                                | `CheckboxCard.tsx`       | Opção com caixa em destaque (ex.: “Criar ponto de restauração antes”)                                                                         |
| `SettingSwitch` / `PreferenceSwitches`                        | `Preferences.tsx`        | Linha de preferência com interruptor; `PreferenceSwitches` traz as preferências principais com o mesmo texto em Configurações e na introdução |
| `FirstRunWizard`                                              | `FirstRunWizard.tsx`     | Introdução da primeira execução (seção 6)                                                                                                     |
| `ChoiceChips`                                                 | `ChoiceChips.tsx`        | Escolha única (radiogroup). `variant="letter"` para filtro A–Z                                                                                |
| `LoadingState` / `ErrorState` / `EmptyState` / `ResourceView` | `States.tsx`             | Os três estados de conteúdo (seção 4)                                                                                                         |
| `ModalShell` / `ConfirmModal`                                 | `ConfirmModal.tsx`       | Diálogos (foco preso, Esc, app inerte para o Narrador)                                                                                        |
| `RecommendationsPanel`                                        | `Recommendations.tsx`    | Recomendações, `variant="compact"` (Dashboard) ou `"full"` (Inteligência)                                                                     |
| `HistoryTotals` / `WeeklyChart` / `HistoryTimeline`           | `MaintenanceHistory.tsx` | Tela Histórico: totais do período, gráfico semanal (com “Ver como tabela”) e linha do tempo agrupada por dia                                  |
| `surface-inset` (classe)                                      | `styles.css`             | Caixa rebaixada dentro de um card                                                                                                             |

Exemplo de card:

```tsx
<Panel>
  <PanelHeader
    icon={FileText}
    title="Relatório de diagnóstico"
    description="Exporta um .txt com a saúde do PC…"
    badges={<StatusBadge tone="success">Pronto</StatusBadge>}
    actions={<Button>Exportar relatório</Button>}
  />
  …conteúdo…
</Panel>
```

**Gráficos:** o desenho é decorativo para o leitor de tela — o bloco tem `role="img"` com um resumo em frase (“Espaço liberado por semana, nas últimas 13 semanas. Total: 26,9 GB…”), e os mesmos números ficam acessíveis numa tabela de verdade (`WeeklyChart` → botão **Ver como tabela**, com nome fixo e `aria-pressed`). Com muitas colunas em pouco espaço, os rótulos encurtam (“03/11”) e os valores em cima das barras só aparecem com largura.

**Não faça:** `<Card className="surface-panel gap-4 border-border/50 p-5">`, `<span className="flex size-10 … bg-primary/15 text-primary">`, `<Badge className="rounded-full border-success/30 bg-success/10 text-success">`. Cada uma dessas já tem componente.

---

## 4. Estados

### Regra de carregamento

| Situação                             | O que mostrar                                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Abertura do app                      | Marca + “Lendo informações do sistema…” cobrindo o conteúdo, até a 1ª leitura (máx. 8 s). **Único carregamento de tela inteira.**               |
| Conteúdo ainda sem dados             | `LoadingState`: frase do que está acontecendo (“Lendo os programas instalados…”) + esqueleto no formato do conteúdo (`list`, `cards`, `block`). |
| Atualizar dados que já estão na tela | Os dados continuam visíveis; só o ícone do botão gira e o botão fica desabilitado. Sem esqueleto.                                               |
| Ação (executar, limpar, desinstalar) | O botão vira “Fazendo…” com spinner e fica desabilitado. Resultado por toast.                                                                   |
| Operação longa (> 10 s)              | Barra de progresso (`Progress`/`CommandFeed`) com a etapa atual.                                                                                |
| Trocar de página                     | Nada. Não existe carregamento artificial.                                                                                                       |

### Regra de erro

| Situação                               | O que mostrar                                                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Falhou e não há dados na tela          | `ErrorState` no lugar do conteúdo: o que falhou (“Não foi possível listar os programas”), o motivo técnico e **Tentar novamente**. Nunca o estado vazio. |
| Falhou ao atualizar, com dados na tela | Mantém os dados e mostra toast de erro com a ação **Tentar novamente**.                                                                                  |
| Uma ação falhou                        | Toast: “Não foi possível {fazer X}.” + motivo na descrição.                                                                                              |
| A tela inteira quebrou                 | `ErrorState` da rota com “Tentar novamente” e “Ir para o início”.                                                                                        |

### Regra de vazio

`EmptyState` diz **o que não há** e, se fizer sentido, **o que fazer** (“Nenhuma captura ainda — Capture o estado atual antes de uma limpeza”). `size="sm"` dentro de cards; `tone="success"` quando vazio é bom (“Nada pendente”). Em sublistas de um resultado (ex.: “Nenhum duplicado encontrado nesta busca”), uma linha de texto basta.

### Como implementar

`useResource` + `ResourceView` aplicam as três regras de uma vez:

```tsx
const resource = useResource(loadPrograms, {
  errorMessage: "Não foi possível listar os programas.",
  onLoad: (list) => …,          // opcional (ex.: seleção padrão)
});

<Button onClick={() => void resource.reload()} disabled={resource.refreshing}>Atualizar</Button>

<ResourceView
  resource={resource}
  errorTitle="Não foi possível listar os programas"
  loading={<LoadingState label="Lendo os programas instalados…" rows={6} />}
  isEmpty={(list) => list.length === 0}
  empty={<EmptyState icon={PackageSearch} title="Nenhum programa aqui" />}
>
  {(list) => <ListPanel label="Programas instalados">…</ListPanel>}
</ResourceView>
```

`resource.setData` faz atualizações locais (ex.: alternar um item no modo demonstração). Leituras compartilhadas entre telas (inicialização, pastas, agendamentos) ficam em `systemData.ts` com cache de 60 s; quem altera esses dados chama `invalidateSystemData("startup" | "folders" | "schedules")`.

---

## 5. Recomendações

Um motor (`src/lib/wincare/recommendations.ts`), um hook (`useRecommendations`) e um componente (`RecommendationsPanel`).

- **Dashboard:** `variant="compact"` — até 4 itens, detalhe em 2 linhas, atalho “Ver todas”. Ao abrir o app (uma vez por sessão, se “Avisar sobre problemas ao abrir” estiver ligado) avisa quantos itens críticos/de atenção existem.
- **Inteligência:** `variant="full"` — todos os itens, selo de severidade em texto e a seção **Adiadas e ignoradas** com “Restaurar”.

### Regras

Só afirma o que foi medido: se uma leitura não chegou (agendamentos, inicialização), as regras dela não rodam. Não existe recomendação de “tudo certo” — o vazio mostra “Nada pendente”.

| id                    | Severidade                    | Quando                                                   | Ação                                                      |
| --------------------- | ----------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| `disk-{letra}`        | crítico ≥ 90% · atenção ≥ 80% | Uso de cada unidade (sem lista de unidades, usa o C:)    | Liberar espaço (Limpeza) / Ver o que ocupa espaço (Disco) |
| `smart`               | crítico                       | Algum disco com SMART diferente de OK                    | Ver discos                                                |
| `defender`            | crítico                       | Proteção em tempo real desligada                         | Abrir Segurança do Windows                                |
| `thermals`            | crítico                       | CPU ou GPU ≥ 85 °C                                       | Ver sensores                                              |
| `ram-high`            | crítico                       | Memória ≥ 85%                                            | Otimizar memória                                          |
| `boot-heavy`          | crítico                       | Inicialização pesada                                     | Revisar inicialização                                     |
| `boot-apps`           | atenção                       | Programas sugeridos para sair da inicialização           | Revisar inicialização                                     |
| `windows-update`      | atenção                       | Última atualização há ≥ 45 dias                          | Abrir Windows Update                                      |
| `temp-files`          | atenção                       | Pastas Temp ≥ 1,5 GB                                     | Limpar agora                                              |
| `cpu-load`            | atenção                       | CPU ≥ 88%                                                | Ver processos                                             |
| `startup-new:{grupo}` | atenção                       | Programas novos na inicialização (o id inclui quais são) | Revisar inicialização                                     |
| `health-drop`         | atenção                       | Saúde caiu ≥ 8 pontos em relação às medições anteriores  | Ver histórico                                             |
| `uptime`              | dica                          | Ligado há ≥ 7 dias                                       | Ver opções de energia                                     |
| `schedule`            | dica                          | Nenhuma rotina agendada ativa                            | Agendar                                                   |

Ordem: crítico → atenção → dica; dentro do nível, a ordem da tabela.

### Adiar e ignorar

- Cada item tem **Adiar** → _1 dia_, _7 dias_, _Ignorar_ ou _Cancelar_ (no próprio item, sem menu flutuante). Depois de esconder, um toast oferece **Desfazer** e o foco vai para o próximo item.
- Salvo em `dismissedRecommendations` (store, `localStorage`), por **id**: `{ until: data | null, at }`. `null` = ignorada até restaurar. Adiamentos vencidos voltam sozinhos e são limpos ao abrir o app (máx. 100 entradas).
- Como é por id, ignorar `disk-C:` esconde o aviso do C: em qualquer severidade. O aviso de programas novos na inicialização tem o grupo de programas no id: esconder vale para aqueles programas, e um programa novo depois disso volta a avisar.

### Adicionar uma regra

1. Acrescente no `buildRecommendations` com um **id novo e estável** (ele é a chave de adiar/ignorar — não renomeie ids existentes).
2. Escreva título curto (o problema), detalhe com o número medido e uma ação (página do app ou `start ms-settings:…`).
3. Cubra em `tests/recommendations.test.cjs` e atualize a tabela acima.

### Checkup rápido

Botão **Checkup rápido** no card de Recomendações (e no fim da introdução). Lê de novo, **sem alterar nada**, tudo o que as regras usam: estado do sistema, discos, inicialização, pastas que enchem o disco e rotinas agendadas (`quickCheckup.ts`). Descarta o cache (`invalidateSystemData()`), e as telas que usam `useSystemDataVersion` leem de novo na hora.

- Durante: linha de status “Checkup rápido: verificando a inicialização… (3 de 5)” e barra fina; o botão vira “Fazendo checkup…”.
- No fim: “Checkup concluído: 3 recomendações, 1 crítica.” no card (anunciado ao Narrador) e em um toast; depois, “Último checkup: hoje às 14:32.”
- Se uma leitura falhar, o checkup continua e o resumo diz o que não foi lido.
- Com checkup na sessão, o aviso de abertura (“N itens precisam de atenção”) não aparece — o resumo já diz isso.

---

## 6. Introdução (primeira execução)

`FirstRunWizard`, 4 passos num diálogo: **Boas-vindas** (o que o WinCare faz e o que nunca faz), **Preferências** (interruptores de `PreferenceSwitches`, valem na hora), **Limpeza semanal** (sugere domingo às 12:00, com dia e horário ajustáveis; se já houver rotina, mostra qual) e **Modo administrador** (o que é, as duas formas de usar e o estado atual).

- Aparece para quem nunca abriu o app (sem estado salvo). Quem já usava uma versão anterior não vê; qualquer um pode rever em **Configurações → Introdução**.
- Pular, Esc ou concluir marca como vista (`onboardingDone`). Clicar fora não fecha. “Concluir e fazer checkup rápido” vai ao Dashboard e roda o checkup com o foco no resultado.
- Enquanto ela está aberta, o aviso de versão nova e o aviso de problemas ao abrir esperam — nunca dois diálogos ao mesmo tempo.
- O texto de “o que ele nunca faz” é uma promessa: antes de mudar o comportamento do app (ex.: nova consulta à internet), atualize esse passo.

---

## 7. Texto

Português do Brasil, direto, falando com “você”.

| Regra                                         | Sim                                                            | Não                         |
| --------------------------------------------- | -------------------------------------------------------------- | --------------------------- |
| Botões: verbo no infinitivo                   | Limpar agora · Tentar novamente · Reabrir como administrador   | Clique aqui · OK            |
| Erros: o que não deu certo + motivo           | Não foi possível listar os programas. _(motivo no detalhe)_    | Falha! · Erro ao executar   |
| Em andamento: verbo no gerúndio + reticências | Limpando… · Lendo os programas instalados…                     | Carregando... (três pontos) |
| Reticências                                   | `…` (um caractere)                                             | `...`                       |
| Plural de verdade                             | 1 programa · 3 programas (`plural()`)                          | programa(s)                 |
| Números                                       | 15,4 GB · 6.214 arquivos (`formatDecimal`, `formatBytes`)      | 15.4 GB                     |
| Maiúsculas                                    | Só a primeira palavra e nomes próprios: “Verificação completa” | Verificação Completa        |
| Títulos de recomendação                       | O problema: “Unidade C: quase cheia”                           | “Atenção!”                  |

Glossário:

| Use                                               | Evite                                               |
| ------------------------------------------------- | --------------------------------------------------- |
| inicialização (programas que abrem com o Windows) | boot                                                |
| memória                                           | RAM (ok em rótulos técnicos curtos, como medidores) |
| captura                                           | snapshot                                            |
| administrador · permissão de administrador        | admin · elevação · privilégios elevados             |
| sobreposição (overlay)                            | overlay sozinho                                     |
| app desktop                                       | Electron · nativo                                   |
| Dashboard, Inteligência, Limpeza…                 | nomes diferentes dos da barra lateral               |

---

## 8. Acessibilidade (resumo)

Detalhes em `docs/FUNCIONALIDADES.md` → Acessibilidade. O que o design system já garante:

- Contraste AA (texto 4,5:1, contornos e foco 3:1) nos dois temas; estados também nos temas de contraste do Windows.
- `PanelHeader` gera `h2`; `PageHeader` gera o `h1` que recebe o foco ao trocar de página.
- `LoadingState` é `role="status"`; `ErrorState` é `role="alert"`; `StatusBadge` sempre tem texto.
- `IconChip` é decorativo (`aria-hidden`); o nome vem do texto ao lado.
- Toasts seguem o tema do app e usam a superfície `--popover` (texto ≥ 10:1 nos dois temas).

---

## 9. Checklist para uma tela nova

- [ ] `PageHeader` com ícone, título e subtítulo.
- [ ] Cada bloco é um `Panel` com `PanelHeader`; nenhuma classe `surface-panel`, `border-border/50` ou tom escrito à mão.
- [ ] Dados carregados com `useResource` + `ResourceView` (carregando, erro com “Tentar novamente”, vazio).
- [ ] Atualizar mantém os dados na tela; ações mostram “Fazendo…” e respondem por toast.
- [ ] Selos com `StatusBadge` e tons de `tone.ts`; números com `format.ts`.
- [ ] Textos seguindo a seção 7.
- [ ] Conferida nos dois temas, em janela estreita e só com o teclado.
