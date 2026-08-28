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
- Última atualização do Windows
- Hostname, sistema e build
- Ferramentas **favoritas**
- **Verificação completa:** SFC → DISM CheckHealth → DISM ScanHealth → DISM RestoreHealth → chkdsk (somente leitura), em sequência
- **Relatório de diagnóstico** em `.txt` (sistema, discos, pastas, inicialização com recomendações e histórico)
- Mini linha do tempo de saúde e **recomendações** geradas com dados reais (link para Inteligência)

### 2. Inteligência (`/inteligencia`)

Camada analítica do WinCare — usa métricas, boot e disco do próprio PC.

- **Linha do tempo da saúde:** amostras de saúde, CPU e RAM (~10 min) enquanto o app está aberto
- **Recomendações inteligentes:** RAM cheia, disco no limite, boot pesado, temperatura, programas novos no boot, queda de saúde
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

Atalhos das consoles do Windows e energia.

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

### 10. Logs (`/logs`)

Histórico das execuções feitas no WinCare.

- Data, ferramenta, comando, status (sucesso / erro / em execução) e log
- Exportar TXT, exportar PDF (impressão), copiar log completo, limpar histórico

### 11. Configurações (`/configuracoes`)

Preferências neste computador (localStorage).

- Tema claro / escuro
- Confirmar comandos críticos
- Verificação automática ao iniciar o app
- **Atualizações:** consultar tags/releases no GitHub, popup ao abrir se houver versão nova, download automático no ZIP instalado, abrir página de releases
- Atalhos de teclado
- Executar o WinCare como administrador
- Limpar histórico local
- Indicador de modo nativo vs demonstração

---

## Recursos transversais

### Barra superior e lateral

- Navegação por grupos: Visão geral, Manutenção, Sistema, Registro
- Badge **Nativo** ou **Demonstração**
- Badge de privilégio (Admin / Usuário padrão) e botão **Executar como admin**
- Alternar tema
- Menu nativo (só no desktop): limpar histórico, abrir logs, verificar atualizações, releases, DevTools (F12), sair

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
- Log do processo principal: `%APPDATA%\WinCare\logs\wincare.log`

### Atalhos

| Atalho | Ação |
| --- | --- |
| **Ctrl + K** | Foca a busca de ferramentas na página atual |
| **Ctrl + B** | Recolhe / expande a barra lateral |
| **F12** | DevTools (app desktop) |

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
| `/logs` | Logs |
| `/configuracoes` | Configurações |
