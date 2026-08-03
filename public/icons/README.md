# Ícones WinCare

Pacotes Android / iOS + assets usados pelo app.

## No projeto

| Arquivo | Uso |
|---|---|
| `../wincare-icon.png` | Logo da sidebar e favicon PNG |
| `../favicon.ico` | Favicon web / SPA Electron |
| `../../electron/icon.ico` | Ícone do `.exe`, janela e `wincare:package` |
| `android/playstore-icon.png` | Fonte canônica 512×512 |

## Regenerar

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-app-icons.ps1
```

Troque `playstore-icon.png` se quiser outra arte base e rode o script de novo.
