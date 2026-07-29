# WinCare — empacotamento desktop (Windows)

A interface roda no navegador em **modo demonstração** (comandos simulados com saídas realistas).
Para executar os comandos reais do Windows, empacote o app com Electron.

## Arquivos

- `electron/main.cjs` — processo principal: executa comandos via `cmd.exe`, faz streaming do stdout/stderr, coleta informações do sistema (CPU, memória, disco, Defender, HotFix) e status SMART via PowerShell/CIM.
- `electron/preload.cjs` — expõe `window.wincare` de forma segura (`contextIsolation: true`, sem `nodeIntegration`).

Quando `window.wincare` existe, a UI muda automaticamente para o **modo nativo** e todos os botões passam a executar os comandos reais.

## Como gerar o executável

```bash
npm install --save-dev electron @electron/packager
npx vite build
npx @electron/packager . "WinCare" --platform=win32 --arch=x64 \
  --out=electron-release --overwrite \
  --ignore='node_modules' --ignore='^/src' --ignore='^/public' --ignore='^/electron-release'
```

No `package.json`, defina `"main": "electron/main.cjs"` e, no `vite.config.ts`, use `base: './'`
(o Electron carrega os arquivos via `file://`).

## Execução como Administrador

Comandos como `sfc`, `DISM`, `chkdsk /f`, `netsh` e a limpeza do Windows Update exigem elevação.
Adicione um manifesto `requestedExecutionLevel = requireAdministrator` ao executável final
(por exemplo com `resourcehacker` ou pelo instalador), ou peça ao usuário para abrir o WinCare
com "Executar como administrador". A UI já sinaliza quais ferramentas precisam de elevação.
