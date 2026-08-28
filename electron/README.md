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
- `src/lib/wincare/bridge.ts` — usa o bridge nativo quando existe; caso contrário, simula.

## UI no Electron — o que trava a janela

No Windows, a UI fica “morta” (scroll ainda funciona, cliques não) **assim que a aba monta**. Duas causas distintas:

**1. Controles HTML/Radix (foco / overlay)**

Não usar nestas páginas (e de preferência em lugar nenhum do desktop):

- `<input>`, `<textarea>` e `<select>` nativos (o Chromium do Electron prende o foco)
- Radix `Dialog` / `AlertDialog` / `Select` / `Tooltip` com portal (overlay `inert` / `pointer-events`)
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
