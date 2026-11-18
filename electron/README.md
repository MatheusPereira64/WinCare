# WinCare — como usar os dados REAIS do seu computador

No navegador (preview do Lovable) o app roda em **modo demonstração**: uma página web não tem
permissão para ler CPU, disco, Defender ou executar `sfc`, `DISM`, `ipconfig`. Isso é uma limitação
do navegador, não do app.

Para ver os dados reais da sua máquina, é preciso rodar o WinCare como **aplicativo desktop
(Electron)** no Windows. O código já está pronto: quando o app detecta `window.wincare`, a UI troca
o badge para **Modo nativo** e todos os comandos passam a executar de verdade.

## Passo a passo (no seu PC com Windows)

1. Baixe o código do projeto (botão GitHub / Export no Lovable) e abra a pasta no terminal.
2. Instale as dependências:

```bash
npm install
npm install --save-dev electron @electron/packager
```

3. Rode em modo desktop (compila a interface e abre a janela do Electron):

```bash
npm run wincare:dev
```

4. Gere o executável `.exe` (pasta `electron-release/WinCare-win32-x64`):

```bash
npm run wincare:package
```

> Dica: para os comandos que exigem elevação (`sfc`, `DISM`, `chkdsk /f`, `netsh`, limpeza do
> Windows Update), clique com o botão direito no `WinCare.exe` → **Executar como administrador**.

## Como funciona por dentro

- `vite.electron.config.ts` — build client-only (SPA com hash history) para o desktop, saída em `dist/`.
- `electron/renderer/main.tsx` — entrada da interface no Electron.
- `electron/main.cjs` — processo principal: executa comandos via `cmd.exe`, faz streaming do
  stdout/stderr, e coleta CPU, memória, disco, Defender, HotFix e SMART via PowerShell/CIM.
  Serve a interface por um protocolo `app://` (módulos ES não carregam via `file://`).
- `electron/preload.cjs` — expõe `window.wincare` com `contextIsolation: true` e sem `nodeIntegration`.
- `electron/cleaner.cjs` — varre e limpa navegadores/apps. A UI só envia IDs da última varredura, nunca caminhos.
- `electron/uninstaller.cjs` — lista programas, abre o desinstalador e procura resíduos, com bloqueio de pastas e chaves protegidas.
- `electron/restore-point.cjs` — cria pontos de restauração.
- `electron/scheduler.cjs` — tarefas no Agendador do Windows e rotinas sem janela (`--wincare-job=cleanup|full-check`).
- `electron/powershell.cjs` — execução de scripts em UTF-8, com ou sem UAC.
- `electron/maintenance-history.cjs` — histórico de manutenção da tela Histórico (ver abaixo).
- `electron/background.cjs` — bandeja, manter na bandeja ao fechar, abrir com o Windows e o monitor de alertas (ver abaixo).
- `electron/battery.cjs` — bateria: consulta `Win32_Battery`, gera `powercfg /batteryreport /xml` num temporário (sempre apagado) e interpreta o XML; o relatório HTML completo vai para `%APPDATA%\WinCare\reports\battery-report.html`. Testes com amostras em `electron/tests/battery.test.cjs` e `electron/tests/fixtures/`.
- `electron/alerts.cjs` — regras puras dos alertas (limites, histerese, quando avisar, menu da bandeja); testes em `electron/tests/alerts.test.cjs`.
- `electron/tests/safety.test.cjs` — testes das proteções contra exclusão indevida (`npm run test:main`; todas as camadas em [docs/testes.md](../docs/testes.md)).
- `electron/tests/maintenance-history.test.cjs` — limites, saúde diária e classificação de comandos do histórico.
- `src/lib/wincare/bridge.ts` — usa o bridge nativo quando existe; caso contrário, simula.

## Histórico de manutenção

- Quem grava é o processo principal, com o resultado real de cada ação: `native-actions.cjs` (limpeza de navegadores/apps, desinstalação, sobras, ponto de restauração), `main.cjs` (comandos de reparo e limpeza vindos de `wincare:run`, pastas do Disco, inicialização, memória e a nota de saúde do `wincare:systemInfo`) e `scheduler.cjs` (rotinas agendadas, que rodam em outro processo).
- Comandos viram evento por regra (`COMMAND_RULES`): SFC, DISM, CHKDSK, cache do Windows Update, temporários (o espaço vem da própria saída), Prefetch, cache de ícones e reparos de rede. Consultas (ping, ipconfig /all…) não entram; UAC recusado também não.
- Arquivo: `%APPDATA%\WinCare\maintenance-history.json` — a mesma pasta que a rotina agendada enxerga. É separado de `logs/wincare.log`. Cada mudança relê o arquivo, altera e grava em um temporário que substitui o original (nada fica só na memória de um processo, então o app aberto não sobrescreve o que a rotina agendada gravou antes; app fechado no meio não deixa JSON pela metade).
- Limites: 1.500 eventos, 400 dias de saúde e 512 KB no total; o mais antigo sai primeiro. Textos são cortados (título 120, detalhe 240 caracteres) e todo registro é validado ao ler.
- Saúde: no máximo uma leitura a cada 5 min, guardada como média/mínimo/máximo por dia; vai para o disco a cada 10 min e ao fechar o app.
- Na primeira vez, as rotinas de `schedule-history.json` que já rodaram são importadas.
- IPC: `wincare:maintenanceHistory`, `wincare:clearMaintenanceHistory` e o aviso `wincare:historyChanged` (a tela atualiza sozinha; ao voltar o foco para a janela ela também relê, para pegar o que a rotina agendada gravou).

## Bandeja e alertas em segundo plano

- A bandeja é criada sempre que o app (não a rotina agendada) abre. `main.cjs` → `openApp({ to, command })` mostra a janela — criando se o app está só na bandeja — e manda `wincare:trayCommand` (`navigate` ou `quick-checkup`). Se a janela ainda não existia, o comando fica pendente e o renderer pede ao montar (`wincare:takeTrayCommand`, em `TrayBridge.tsx`). Só rotas de uma lista fixa são aceitas.
- Fechar a janela com **Manter na bandeja** (ou quando o app abriu com o Windows) só a esconde (`close` → `preventDefault` + `hide`). `before-quit` marca a saída de verdade (menu Sair, bandeja, atualização, reabrir como admin).
- **Abrir com o Windows**: `app.setLoginItemSettings` com o mesmo executável/argumentos do Agendador (`resolveSelfLaunch`) mais `--hidden`. Com `--hidden`, o `BrowserWindow` nem é criado até você abrir. `executableWillLaunchAtLogin === false` indica que o usuário desativou a entrada no Windows (a tela mostra).
- **Monitor**: um `setInterval` de 1 min decide o que está na hora de ler (disco 5 min com `statfs`; temperatura 3 min reaproveitando o último `wincare:systemInfo` se tiver menos de 2 min; Defender + SecurityCenter2 30 min; `Get-HotFix` 6 h). As decisões (histerese, episódios, lembretes, intervalo mínimo de 10 min, carência ao abrir, silenciar, janela em foco) estão em `alerts.cjs` e têm testes com simulações de dias inteiros.
- Estado salvo em `%APPDATA%\WinCare\background.json` (opções, silenciar, último aviso de cada alerta) — reiniciar não repete aviso.
- Notificações de app portátil: o Windows só mostra toast de um AppUserModelID registrado, então `background.cjs` grava nome e ícone em `HKCU\Software\Classes\AppUserModelId\com.wincare.desktop` ao abrir (sem administrador). **Testar notificação** nas Configurações confirma.
- Janela escondida/minimizada: o Chromium marca a página como `hidden` e as leituras periódicas da interface (`useSystemInfo`, coletor da Inteligência, processos do Monitoramento) pulam a vez (`pageVisibility.ts`).
- IPC: `wincare:backgroundState`, `wincare:setBackgroundSettings`, `wincare:checkAlertsNow`, `wincare:snoozeAlerts`, `wincare:testNotification`, `wincare:takeTrayCommand`; eventos `wincare:backgroundChanged` e `wincare:trayCommand`.

## Janela, escala e zoom

- O tamanho inicial cabe no monitor onde está o cursor (`window-ui.cjs` → `computeWindowBounds`): 1360×900 quando cabe; senão abre maximizada. O mínimo (1024×640) nunca passa da área de trabalho do monitor.
- Zoom (Ctrl +, Ctrl −, Ctrl 0, Ctrl + roda do mouse e menu **Exibir**): o processo principal só traduz a tecla em comando (`wincare:zoomCommand`); o renderer guarda o nível nas Configurações e aplica com `webFrame.setZoomFactor` (preload) antes do primeiro render. O zoom do Chromium reduz a largura útil em px CSS, então barra lateral e grids se reorganizam em vez de cortar.

## UI no Electron — o que trava a janela

> **Causa raiz corrigida:** o `RootShell` (`src/routes/__root.tsx`) renderizava `<html>`/`<body>` dentro do `#root` do app desktop. O React 19 adotava o `<body>` real como nó da própria árvore — que está dentro do `<body>` — e eventos tratados no `document`/`body` (o `selectionchange` ao focar qualquer campo de texto, eventos de portais no `body`) entravam num loop infinito no despacho de eventos do React, travando a janela. No desktop o shell agora renderiza só o conteúdo. Era o que fazia a busca (Ctrl + K), o `Sheet` e overlays “matarem” a UI. As orientações abaixo continuam valendo como cautela.

No Windows, a UI fica “morta” (scroll ainda funciona, cliques não) **assim que a aba monta**. Duas causas distintas:

**1. Controles HTML/Radix (foco / overlay)**

Não usar nestas páginas (e de preferência em lugar nenhum do desktop):

- `<input>`, `<textarea>` e `<select>` nativos (o Chromium do Electron prende o foco)
- Radix `Dialog` / `AlertDialog` / `Select` / `Tooltip` com portal (overlay `inert` / `pointer-events`). Inclui o `Sheet` (que é um Dialog): a gaveta da barra lateral em janela estreita entrava num loop de `pointerout` com o ponteiro sobre o cabeçalho e travava a janela — hoje a gaveta e o painel sobreposto são divs simples em `components/ui/sidebar.tsx`
- Overlay em tela cheia (`ConfirmModal` / `createPortal` no `body`) na sub-aba Perfis e jogos — o clique na aba pode cair no card de perfil e o overlay prende o HUD. Confirmação fica inline, sem portal.

No lugar: botões e presets (veja `NetworkProbeCard`, `PickerRow` na Inteligência e a aba Redes), `ConfirmModal` (portal próprio, sem Radix), e `unlockUi()` ao montar a página (`ToolSection` e Inteligência já chamam).

Busca de ferramentas (`Ctrl + K`) é a única exceção controlada, em `ToolSection`.

**2. IPC pesado no processo principal (Inteligência)**

A aba Inteligência travava ao abrir porque montava `<select>` e disparava no mesmo instante `listStartup` (ícones via `app.getFileIcon`), `diskUsage` (PowerShell recursivo, timeout longo) e `topProcesses`.

Regra: a rota `/inteligencia` **não** chama esses três no mount. Boot vem do coletor (`startupKnown`); disco/processos só na sub-aba Diagnóstico, com atraso. O coletor de jogos chama `topProcesses` no máximo a cada 15 s, sem reiniciar o intervalo a cada métrica.

## Scripts disponíveis

| Script | O que faz |
| --- | --- |
| `npm run wincare:build` | Compila só a interface para `dist/` |
| `npm run wincare:dev` | Compila e abre a janela do WinCare (desktop) |
| `npm run wincare:admin` | Abre o WinCare como administrador (desenvolvimento) |
| `npm run wincare:dev:debug` | Igual ao dev, com DevTools aberto |
| `npm run wincare:package` | Gera o ZIP `WinCare-Windows-x64.zip` em `electron-release/` |
| `npm run wincare:clear-data` | Limpa histórico local do app |
| `npm run wincare:screenshots` | Regera as prévias do README em `docs/screenshots/` (dados simulados) |
| `npm test` | Roda os testes das proteções contra exclusão indevida |
