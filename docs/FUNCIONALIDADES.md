# Funcionalidades do WinCare

Inventário das telas e ferramentas do aplicativo. Para instalar e rodar o app, veja o [README](../README.md). A especificação original do produto está em [ESPECIFICACAO-ORIGINAL.md](./ESPECIFICACAO-ORIGINAL.md).

**WinCare** é a central de manutenção do Windows: diagnóstico, reparo, limpeza, redes e monitoramento numa interface só — sem abrir CMD ou PowerShell na mão.

| | |
| --- | --- |
| Plataforma | Windows 10 / 11 (64 bits) |
| Modo nativo | App desktop (Electron) — comandos e métricas reais |
| Modo demonstração | Navegador (`npm run dev`) — saídas simuladas |
| Idioma | Português |

---

## Como cada ferramenta funciona

Toda ação do catálogo (Reparo, Limpeza, Disco, Sistema, Redes) tem:

- Nome e descrição em português
- Nível de risco: **Seguro**, **Atenção** ou **Avançado**
- Botão Executar, barra de progresso e log em tempo real
- Resultado final e **Copiar log**
- Confirmação antes de ações críticas (pode desligar em Configurações)
- Elevação via UAC quando a ferramenta exige administrador
- Favoritar (estrela) — aparece no Dashboard
- Busca na página atual (**Ctrl + K**)

---

## Telas

### 1. Dashboard (`/`)

Visão geral do PC, atualizada a cada poucos segundos.

- Anel de **saúde geral (0–100%)**
- CPU, memória, disco C:, tempo ligado (uptime)
- Status do **Windows Defender**
- **Bateria** (só em notebooks): saúde em % e nível, com atalho para os detalhes em Sistema
- Última atualização do Windows
- Hostname, sistema e build
- Ferramentas **favoritas**
- **Verificação completa:** SFC → DISM CheckHealth → DISM ScanHealth → DISM RestoreHealth → chkdsk (somente leitura), em sequência
- **Relatório de diagnóstico** em `.txt` (sistema, discos, pastas, inicialização com recomendações e histórico)
- Mini linha do tempo de saúde e **recomendações** (as 4 mais importantes, com ação direta e “Adiar”; “Ver todas” leva à Inteligência)
- **O que o WinCare já fez:** resumo dos últimos 30 dias (espaço liberado, programas removidos, reparos e a saúde antes → agora), com atalho para o Histórico

### 2. Inteligência (`/inteligencia`)

Camada analítica do WinCare — usa métricas, boot e disco do próprio PC.

- **Linha do tempo da saúde:** amostras de saúde, CPU e RAM (~10 min) enquanto o app está aberto
- **Recomendações:** motor único para o app todo — espaço por unidade, SMART, Defender, temperatura, memória, inicialização pesada ou com programas novos, Windows Update atrasado, temporários, CPU, queda de saúde, PC sem reiniciar e manutenção sem agendamento. Cada uma pode ser **adiada por 1 ou 7 dias** ou **ignorada** (com “Desfazer”); as escondidas ficam em “Adiadas e ignoradas”, com “Restaurar”. Regras completas em [design-system.md](design-system.md#5-recomendações)
- **Diagnóstico por sintoma:** “PC lento”, “jogo travando”, “esquenta”, “sem espaço”, “demora para ligar”, “internet ruim”
- **Snapshots antes/depois:** capture o estado e compare saúde, RAM, disco e itens no boot
- **Perfis:** Equilibrado, Jogos, Trabalho e Bateria — mudam o plano de energia do Windows
- **Sessões de jogo:** detecta processo conhecido ou GPU alta e registra médias de CPU/RAM/GPU

### 3. Monitoramento (`/monitoramento`)

Painéis ao vivo (atualização ~2 s).

- Tiles de CPU, RAM, disco C: e saúde
- Gráfico radial CPU / RAM / disco
- Histórico de CPU e memória
- Uso das unidades (barra usado × livre)
- Top processos por memória (PID, CPU, MB), com atualização automática
- Temperatura de CPU/GPU quando o hardware expõe o sensor

### 4. Reparo (`/reparo`)

Correção de arquivos do sistema, imagem do Windows e disco.

| Ferramenta | O que faz | Risco | Admin |
| --- | --- | --- | --- |
| Verificar arquivos do sistema | `sfc /scannow` — repara arquivos protegidos do Windows (10–30 min) | Seguro | Sim |
| DISM CheckHealth | Verifica se a imagem já foi marcada como corrompida | Seguro | Sim |
| DISM ScanHealth | Varredura completa da imagem em busca de corrupção | Seguro | Sim |
| Restaurar imagem do Windows | `DISM /RestoreHealth` — baixa arquivos íntegros do Windows Update | Atenção | Sim |
| Verificar disco (somente leitura) | `chkdsk C:` — analisa o sistema de arquivos sem alterar | Seguro | Não |
| Verificar e corrigir disco | `chkdsk C: /f` — agenda correção; em geral exige reinício | Avançado | Sim |
| Limpar cache do Windows Update | Para wuauserv/BITS, limpa SoftwareDistribution e catroot2, reinicia os serviços | Atenção | Sim |

### 5. Limpeza (`/limpeza`)

Liberar espaço e caches.

| Ferramenta | O que faz | Risco | Admin |
| --- | --- | --- | --- |
| Limpar arquivos temporários | Esvazia `%TEMP%` e `Windows\Temp` | Seguro | Não |
| Limpar Prefetch | Apaga pré-carregamento; o Windows recria com o uso | Atenção | Sim |
| Limpar cache do Windows | Recria cache de ícones/miniaturas (reinicia o Explorer) | Atenção | Não |
| Abrir Limpeza de Disco | Abre o `cleanmgr` nativo | Seguro | — (atalho) |

### 6. Disco (`/disco`)

Integridade das unidades e pastas que ocupam espaço.

- Cards por unidade: modelo, tipo (SSD/HDD), SMART, espaço livre/total, temperatura
- **Análise de espaço:** Temp do usuário, Temp do Windows, Downloads, Lixeira, cache do IE/Edge — tamanho e limpeza com confirmação (quando for seguro)
- **Inteligência de armazenamento:** varredura de arquivos grandes e duplicados (mesmo nome e tamanho) em Documentos, Downloads, Desktop e pastas de mídia; mostra crescimento das pastas entre varreduras
- Ferramentas:

| Ferramenta | O que faz | Risco |
| --- | --- | --- |
| Status SMART dos discos | Autodiagnóstico dos discos (modelo, status, tamanho) | Seguro |
| Espaço livre por unidade | Lista unidades com livre e total | Seguro |

### 7. Inicialização (`/inicializacao`)

Programas que abrem com o Windows.

- Lista HKCU Run, HKLM Run e pasta Inicializar
- RAM atual do processo (se estiver rodando) e quantidade de instâncias
- Impacto **Alto / Médio / Baixo**
- **Diagnóstico:** carga Leve / Moderada / Pesada, score, RAM total do boot, itens de impacto alto
- Recomendações **Desativar / Avaliar / Manter** (ex.: Discord e Steam vs Windows Security)
- Ativar/desativar item (HKLM exige administrador)
- Ação em lote: desativar os sugeridos (com confirmação)
- **Detecção de mudanças:** aviso quando um programa novo entra na inicialização

### 8. Sistema (`/sistema`)

Bateria, atalhos das consoles do Windows e energia.

**Bateria** (só aparece em notebooks — o WinCare consulta `Win32_Battery` e, havendo bateria, lê `powercfg /batteryreport /xml` num arquivo temporário que é apagado em seguida):

- **Saúde** = carga total atual ÷ capacidade de projeto, com a faixa: Ótima (≥ 90%), Boa (≥ 80%), Desgastada (≥ 60%), Fraca (< 60%). O texto deixa claro que desgaste é normal com o tempo.
- Desgaste, ciclos de carga (quando o fabricante informa), capacidade atual e de projeto, autonomia estimada com carga completa.
- **Capacidade ao longo do tempo:** gráfico mês a mês (até 24 meses, recomeçando quando a bateria foi trocada), com dica ao passar o mouse e versão em tabela.
- **Relatório completo:** gera o relatório HTML do Windows na pasta de dados do app e abre no navegador.
- **Dicas de energia**, só quando se aplicam: bateria fraca (sugere conferir o relatório), desgaste acima de 10 pontos por ano, muitos ciclos, quase sempre na tomada (limite de carga do fabricante), plano de alto desempenho ligado na bateria e autonomia curta. Os botões das dicas só abrem páginas do Windows (`ms-settings:powersleep`, `ms-settings:batterysaver-usagedetails`) — nada muda sozinho.
- Bateria abaixo de 60% também vira recomendação ("Bateria muito desgastada") no Dashboard e na Inteligência.

| Ferramenta | O que faz | Risco |
| --- | --- | --- |
| Gerenciador de Dispositivos | `devmgmt.msc` | Seguro |
| Gerenciamento de Disco | `diskmgmt.msc` | Atenção |
| Serviços | `services.msc` | Atenção |
| Editor de Registro | `regedit` | Avançado |
| Visualizador de Eventos | `eventvwr` | Seguro |
| Gerenciador de Tarefas | `taskmgr` | Seguro |
| Painel de Controle | `control` | Seguro |
| Configurações | App Configurações do Windows (`ms-settings:`) | Seguro |
| Desligar em 1 minuto | `shutdown /s /t 60` | Avançado |
| Desligar em 5 minutos | `shutdown /s /t 300` | Avançado |
| Desligar em 15 minutos | `shutdown /s /t 900` | Avançado |
| Desligar em 1 hora | `shutdown /s /t 3600` | Avançado |
| Cancelar desligamento | `shutdown /a` | Seguro |

### 9. Redes (`/redes`)

Teste de conectividade e reparo da pilha de rede.

| Ferramenta | O que faz | Risco | Admin |
| --- | --- | --- | --- |
| Ping — Google DNS | 4 pacotes para 8.8.8.8 | Seguro | Não |
| Ping — Cloudflare | 4 pacotes para 1.1.1.1 | Seguro | Não |
| DNS — google.com | `nslookup google.com` | Seguro | Não |
| DNS — cloudflare.com | `nslookup cloudflare.com` | Seguro | Não |
| Tracert — google.com | Até 12 saltos até google.com | Seguro | Não |
| Configuração de IP (completa) | `ipconfig /all` | Seguro | Não |
| Limpar cache DNS | `ipconfig /flushdns` | Seguro | Não |
| Renovar IP | `release` + `renew` (DHCP) | Atenção | Não |
| Reset Winsock | `netsh winsock reset` (pode pedir reinício) | Atenção | Sim |
| Reset TCP/IP | `netsh int ip reset` (pode pedir reinício) | Avançado | Sim |
| Velocidade da conexão | Download de 1 MB (Cloudflare) e estimativa em Mbps | Seguro | Não |
| Perfis Wi‑Fi salvos | `netsh wlan show profiles` | Seguro | Não |
| Interfaces Wi‑Fi | Estado, sinal e canal (`netsh wlan show interfaces`) | Seguro | Não |

### 10. Histórico (`/historico`)

O “antes e depois”: quanto o WinCare já ajudou este PC.

- **Totais de 7, 30 ou 90 dias:** espaço liberado (com quantas limpezas; o tamanho dos programas removidos é estimativa e aparece como tal), programas removidos, reparos feitos (mais verificações e ações que falharam) e **saúde do PC** — a média de hoje comparada com o primeiro dia do período, com a curva diária
- Uma linha com o total desde o primeiro registro (“Desde 22 de ago. de 2026: 31,0 GB liberados em 32 manutenções”)
- **Gráfico semana a semana** (segunda a domingo): espaço liberado, número de manutenções ou saúde média; 4 semanas no período de 7 dias, 5 no de 30 e 13 no de 90. **Ver como tabela** mostra os mesmos números em uma tabela
- **Linha do tempo** agrupada por dia (Hoje, Ontem, data), com filtros (Limpezas, Programas, Reparos, Outros), selos **Agendada** e **Falhou**, espaço liberado, horário e duração
- **Exportar** o período em **CSV** (Excel em português: ponto e vírgula, vírgula decimal, acentos corretos) ou **JSON** (totais, eventos e saúde diária); **Apagar** o histórico com confirmação
- Também no Dashboard: card “O que o WinCare já fez” com o resumo dos últimos 30 dias

O que entra no histórico (gravado pelo processo principal com o resultado real): limpeza de navegadores/apps, temporários, Prefetch, pastas do Disco e Lixeira; programas desinstalados e sobras removidas; SFC, DISM, CHKDSK, cache do Windows Update, cache de ícones e reparos de rede; rotinas agendadas; itens tirados da inicialização; otimização de memória; pontos de restauração. Consultas (ping, ipconfig /all…) e UAC recusado não entram. A saúde é registrada enquanto o app está aberto (no máximo uma leitura a cada 5 minutos, guardada como média do dia).

Fica em `%APPDATA%\WinCare\maintenance-history.json`, separado dos logs, com limite de 1.500 registros, 400 dias de saúde e 512 KB — os mais antigos saem primeiro. Na primeira vez, as rotinas agendadas que já tinham rodado entram no histórico.

### 11. Logs (`/logs`)

Histórico das execuções feitas no WinCare.

- Data, ferramenta, comando, status (sucesso / erro / em execução) e log
- Exportar TXT, exportar PDF (impressão), copiar log completo, limpar histórico

### 12. Configurações (`/configuracoes`)

Preferências neste computador (localStorage).

- **Aparência:** tema claro / escuro e **tamanho da interface** (zoom de 80% a 200%, salvo neste computador; também por Ctrl +, Ctrl −, Ctrl 0 e Ctrl + roda do mouse)
- Confirmar comandos críticos
- Verificação automática ao abrir o app e a cada 2 horas (não ao entrar no Dashboard)
- **Bandeja e alertas** (app desktop): manter na bandeja ao fechar a janela, abrir com o Windows minimizado na bandeja, avisar sobre problemas importantes (escolha quais), última leitura de cada verificação, **Verificar agora**, **Testar notificação** e silenciar por 24 horas — detalhes em [Bandeja e alertas](#bandeja-e-alertas-desktop)
- **Atualizações:** consultar tags/releases no GitHub, popup ao abrir se houver versão nova, download automático no ZIP instalado, abrir página de releases
- Atalhos de teclado
- Executar o WinCare como administrador
- Limpar histórico local
- Indicador de modo nativo vs demonstração

---

## Recursos transversais

### Barra superior e lateral

- Navegação por grupos: Visão geral, Manutenção, Sistema, Registro
- Barra lateral adaptável à largura útil da janela (já considerando zoom e escala do Windows): expandida a partir de 1200 px; abaixo disso recolhe sozinha para ícones e, ao abrir, fica por cima do conteúdo; abaixo de 640 px vira gaveta. Recolher manualmente em janela larga fica salvo
- Telas se reorganizam pela largura real do conteúdo (container queries), de 1024×640 a monitores grandes, em 125%/150% de escala e com zoom
- Badge **Nativo** ou **Demonstração**
- Badge de privilégio (Admin / Usuário padrão) e botão **Executar como admin**
- Alternar tema
- Indicador de zoom quando diferente de 100% (clique volta ao padrão)
- Indicador de carregamento na abertura e na troca de telas (e nas listas de inicialização/disco)
- Menu nativo (só no desktop): limpar histórico, abrir logs, verificar atualizações, releases, DevTools (F12), aumentar / diminuir / redefinir zoom, sair
- A janela abre no tamanho que cabe no monitor (maximizada em telas pequenas, como 1920×1080 a 150%)

### Bandeja e alertas (desktop)

Avisa sobre problemas importantes mesmo com a janela fechada, sem incomodar.

- **Ícone na bandeja** sempre que o app está aberto. Clique abre a janela; o menu (botão direito) tem: alertas ativos (clique leva à página que resolve), **Checkup rápido**, **Liberar espaço**, **Histórico**, **Configurações**, ligar/desligar os avisos, **Silenciar por 24 horas** e **Sair do WinCare**. Com alerta ativo, o ícone ganha um ponto âmbar e a dica (passar o mouse) diz qual é
- **Manter na bandeja ao fechar** (desligado por padrão): o X esconde a janela. Na primeira vez, uma notificação explica onde o app ficou. Para sair: **Sair** na bandeja ou no menu WinCare
- **Abrir com o Windows, minimizado na bandeja** (desligado por padrão): entrada em *Aplicativos de inicialização* que abre só o ícone, sem a janela (o renderer nem é criado até você abrir). Aberto assim, fechar a janela também volta para a bandeja. Se o Windows bloquear a entrada, a tela avisa e tem o atalho para reativar. Na página Inicialização o próprio WinCare aparece como “manter”
- **Avisos** (ligados por padrão, cada um pode ser desligado):

| Alerta | Avisa quando | Para de avisar quando | Verifica a cada | Lembra de novo depois de |
| --- | --- | --- | --- | --- |
| Disco do sistema quase cheio | menos de 10 GB livres ou 95% usado | 12 GB livres e abaixo de 93% | 5 min (sem processo externo) | 1 dia |
| Temperatura alta | CPU ou GPU ≥ 90 °C em duas leituras seguidas | abaixo de 80 °C | 3 min (aproveita a leitura do Dashboard com a janela aberta) | 2 horas |
| Antivírus desligado | proteção em tempo real do Defender desligada **e** nenhum outro antivírus ativo | proteção ligada ou outro antivírus ativo | 30 min | 1 dia |
| Windows Update atrasado | 45 dias ou mais sem instalar atualizações | atualização recente | 6 h | 7 dias |

- **Sem ser chato:** um aviso por problema (problema que some e volta cedo não avisa de novo), no máximo uma notificação a cada 10 minutos (vários problemas viram uma só), nada nos primeiros 2 minutos do app (5 quando abre com o Windows), nada enquanto a janela do WinCare está em foco (o painel de recomendações já mostra) e nada com os avisos silenciados. O estado fica salvo: reiniciar o PC não repete o aviso. Os limites de disco e temperatura são mais altos que os das recomendações porque a notificação interrompe
- Clicar na notificação abre o WinCare na página que resolve (Limpeza, Monitoramento ou Dashboard)
- Com a janela escondida ou minimizada, o app para as leituras da interface (Dashboard, processos, jogos); em segundo plano só o monitor leve do processo principal roda

### Atualizações (desktop)

1. Ao abrir o app (se “Verificar ao iniciar” estiver ligado), consulta as tags de release no GitHub
2. Se a versão remota for maior, mostra popup: *Seu aplicativo está na versão X. Deseja baixar a versão Y mais atual?*
3. **Baixar agora** baixa o `WinCare-Windows-x64.zip`, substitui os arquivos e reabre o app (somente no pacote instalado)
4. Em desenvolvimento, o popup abre a página de releases

### Electron (cliques mortos)

No app desktop a janela trava ao abrir uma aba por dois motivos:

1. `<input>` / `<select>` nativos e Dialog Radix (foco / overlay). Use botões/presets e `ConfirmModal`.
2. Na Inteligência: `listStartup` (ícones), `diskUsage` e `topProcesses` no mount — IPC no processo principal. A aba não dispara isso ao entrar.

Detalhes: [electron/README.md](../electron/README.md#ui-no-electron--o-que-trava-a-janela).

- Várias ferramentas (SFC, DISM, Prefetch, Winsock…) pedem administrador
- UAC por comando, ou o app inteiro elevado (botão, `npm run wincare:admin` ou `WinCare-Admin.cmd`)
- Itens de inicialização do sistema (HKLM) só mudam com o app elevado

### Dados locais

- Histórico, favoritos e preferências no `localStorage`
- Histórico de manutenção (tela Histórico): `%APPDATA%\WinCare\maintenance-history.json`
- Bandeja e alertas (opções e estado de cada aviso): `%APPDATA%\WinCare\background.json`
- Log do processo principal: `%APPDATA%\WinCare\logs\wincare.log`

### Atalhos

| Atalho | Ação |
| --- | --- |
| **Alt + 1 … 9** | Abre as páginas na ordem da barra lateral (Dashboard … Agendamento) |
| **Alt + 0** | Abre as Configurações |
| **?** ou **F1** | Mostra a lista de atalhos (também no botão de teclado da barra superior e em Exibir → Atalhos de teclado) |
| **Ctrl + K** | Foca a busca de ferramentas na página atual |
| **Ctrl + B** | Recolhe / expande a barra lateral (em janela estreita, abre por cima do conteúdo) |
| **Ctrl + +** / **Ctrl + −** | Aumenta / diminui o zoom da interface (app desktop; também Ctrl + roda do mouse) |
| **Ctrl + 0** | Volta o zoom para 100% |
| **Alt + T** | Vai para as notificações |
| **Esc** | Fecha diálogos e a barra lateral aberta por cima |
| **Setas / Home / End** | Trocam a opção em grupos de escolha (filtros, agendamento, zoom) e nas abas |
| **F12** | DevTools (app desktop) |

### Introdução e checkup rápido

- Na primeira vez que o WinCare abre, uma **introdução em 4 passos**: o que o app faz e o que nunca faz, as preferências principais (interruptores), a sugestão de agendar a limpeza semanal e o que é o modo administrador. Dá para pular e rever em **Configurações → Introdução**
- **Checkup rápido** (card de Recomendações e fim da introdução): relê sistema, discos, inicialização, pastas e agendamentos em poucos segundos, sem alterar nada, e atualiza as recomendações com um resumo

### Estados e padrões visuais

- Toda lista carregada mostra **carregando** (esqueleto + o que está sendo feito), **erro** com “Tentar novamente” ou **vazio** explicando o porquê — regras em [design-system.md](design-system.md#4-estados)
- Só a abertura do app tem carregamento de tela inteira; trocar de página é imediato

### Acessibilidade

- Tudo funciona só com o teclado: link “Pular para o conteúdo” no primeiro Tab, foco sempre visível (também nos temas de contraste do Windows), ordem de Tab seguindo a tela
- Ao trocar de página o foco vai para o título (o Narrador anuncia a página) e o título da janela muda
- Diálogos prendem o foco, deixam o resto do app inerte para o Narrador, fecham com Esc e devolvem o foco ao botão que os abriu; o mesmo vale para a barra lateral aberta por cima
- Grupos de escolha são `radiogroup` e as seções da Inteligência são abas (`tablist`); barras de progresso têm nome e valor; gráficos têm resumo em texto; operações longas anunciam início e fim
- Contraste AA (4,5:1 em texto, 3:1 em contornos de controles e foco) nos temas escuro e claro

---

## Mapa rápido das rotas

| Rota | Tela |
| --- | --- |
| `/` | Dashboard |
| `/monitoramento` | Monitoramento |
| `/inteligencia` | Inteligência (saúde, recomendações, sintomas, perfis, jogos) |
| `/reparo` | Reparo |
| `/limpeza` | Limpeza |
| `/disco` | Disco |
| `/inicializacao` | Inicialização |
| `/sistema` | Sistema |
| `/redes` | Redes |
| `/historico` | Histórico de manutenção (antes e depois) |
| `/logs` | Logs |
| `/configuracoes` | Configurações |
