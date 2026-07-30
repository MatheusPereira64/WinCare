# WinCare

Central de manutenção do Windows com interface moderna. O WinCare reúne diagnóstico, reparo, limpeza e monitoramento em um único app — sem precisar abrir CMD ou PowerShell manualmente.

[![Baixar última versão](https://img.shields.io/github/v/release/MatheusPereira64/WinCare?label=Baixar&color=2ea44f)](https://github.com/MatheusPereira64/WinCare/releases/latest)
[![Licença](https://img.shields.io/github/license/MatheusPereira64/WinCare)](https://github.com/MatheusPereira64/WinCare)

---

## Baixar o aplicativo (usuários)

Não precisa instalar Node.js nem clonar o projeto.

1. Abra a página de **[Releases](https://github.com/MatheusPereira64/WinCare/releases/latest)**
2. Baixe o arquivo **`WinCare-Windows-x64.zip`**
3. Extraia a pasta (botão direito → **Extrair tudo**)
4. Abra **`WinCare.exe`**

### Dicas rápidas

| Situação | O que fazer |
| --- | --- |
| SmartScreen: “Windows protegeu seu PC” | **Mais informações** → **Executar assim mesmo** (o app ainda não tem assinatura digital) |
| Ferramentas que pedem administrador (SFC, DISM…) | Botão direito em `WinCare.exe` → **Executar como administrador** |
| Atualizar | Baixe o ZIP da release mais nova e substitua a pasta antiga |

**Requisito:** Windows 10 ou 11 (64 bits).

---

## Publicar uma nova versão (desenvolvedores)

Quando o código estiver pronto na branch principal:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

O GitHub Actions gera o ZIP automaticamente e publica em **Releases**.

Para testar o pacote localmente:

```powershell
npm run wincare:package
```

Saída: `electron-release/WinCare-Windows-x64.zip`.

---

## Desenvolvimento (modo nativo / demonstração)

> Especificação completa do produto (documento original): [docs/ESPECIFICACAO-ORIGINAL.md](docs/ESPECIFICACAO-ORIGINAL.md)

### Requisitos

- **Windows 10 ou 11**
- **Node.js 22+** e npm
- Conexão com internet (para alguns comandos, como DISM RestoreHealth)

### Dois modos

| Modo | Como abrir | Comportamento |
| --- | --- | --- |
| **Demonstração** | `npm run dev` | Abre no navegador. Métricas e comandos são **simulados**. |
| **Nativo (recomendado)** | `npm run wincare:dev` | App desktop. Executa comandos **reais** no Windows. |

### Instalação

```powershell
git clone https://github.com/MatheusPereira64/WinCare.git
cd WinCare
npm install
npm run wincare:dev
```

### Scripts npm

| Comando | Descrição |
| --- | --- |
| `npm run wincare:dev` | Compila e abre o WinCare (desktop) |
| `npm run wincare:admin` | Compila e abre o WinCare **como administrador** |
| `npm run wincare:dev:debug` | Igual ao dev, com DevTools (F12) |
| `npm run wincare:build` | Compila só a interface em `dist/` |
| `npm run wincare:package` | Gera o ZIP `WinCare-Windows-x64.zip` para distribuição |
| `npm run wincare:clear-data` | Limpa histórico salvo localmente |
| `npm run dev` | Preview web (modo demonstração) |
| `npm run build` | Build web para produção |
| `npm run lint` | Verifica o código com ESLint |

---

## Funcionalidades do app

### Dashboard

Visão geral do PC: CPU, memória, disco, uptime, Windows Defender, última atualização e **saúde geral (0–100%)**. Ferramentas favoritas e **Verificação completa** (SFC + DISM + disco em sequência).

### Reparo

- Verificação de arquivos do sistema (`sfc /scannow`)
- DISM CheckHealth, ScanHealth e RestoreHealth
- Verificação de disco (`chkdsk`) e correção com confirmação
- Limpeza do cache do Windows Update

### Limpeza

Arquivos temporários, Prefetch, cache de ícones e atalho para a Limpeza de Disco nativa (`cleanmgr`).

### Disco

Status SMART, espaço por unidade e informações dos volumes.

### Sistema

Atalhos para Gerenciador de Dispositivos, Discos, Serviços, Registro, Eventos, Tarefas, Painel de Controle e Configurações do Windows.

### Monitoramento

Gráficos de CPU e memória em tempo real (modo nativo usa dados reais).

### Logs

Histórico das execuções com opção de copiar logs.

### Configurações

Tema claro/escuro, confirmação de comandos críticos, verificação ao iniciar, **Executar como administrador** e limpeza de dados locais.

---

## Cada ferramenta inclui

- Nome e descrição em português
- Nível de risco: **Seguro**, **Atenção** ou **Avançado**
- Barra de progresso e log em tempo real
- Resultado final e botão **Copiar log**
- Confirmação antes de ações críticas (configurável)

Atalho global: **Ctrl + K** foca a busca de ferramentas na página atual.

---

## Privilégios de administrador

Várias ferramentas (SFC, DISM, limpeza do Windows Update etc.) exigem elevação.

**No modo desenvolvimento**, use:

1. **`npm run wincare:admin`** — recomendado
2. **`WinCare-Admin.cmd`** na raiz do projeto (duplo clique)
3. Botão **Executar como admin** dentro do app (barra superior)

> **Não** execute diretamente `.electron-dev\WinCare.exe` como administrador — sem o caminho do projeto, o Electron abre a tela padrão vazia.

Após baixar o ZIP da Release (ou `npm run wincare:package`), use o `WinCare.exe` — clique com o botão direito → **Executar como administrador**.

---

## Dados e logs locais

- Histórico e preferências ficam em `localStorage` do app
- Logs do processo principal: `%APPDATA%\WinCare\logs\wincare.log`
- Menu **WinCare → Abrir arquivo de log** (no app desktop)
- Limpar histórico: **Configurações → Dados locais** ou `npm run wincare:clear-data`

---

## Solução de problemas

| Problema | O que fazer |
| --- | --- |
| Tela padrão do Electron (“run a local app…”) | Você abriu `.electron-dev\WinCare.exe` sem argumentos. Use `npm run wincare:dev` ou `WinCare-Admin.cmd` |
| Processo aparece como "Electron" | Feche todas as instâncias e rode `npm run wincare:dev` de novo |
| Erro de cache / ICU | Feche o app, apague `.electron-dev/` e execute `wincare:dev` novamente |
| Ferramenta presa em "Executando..." | `npm run wincare:clear-data` e reinicie o app |
| Comandos não rodam de verdade | Use `wincare:dev`, não `npm run dev` (navegador) |
| Duas janelas / app não abre | Só uma instância é permitida; foque a janela existente |
| SmartScreen ao abrir o .exe da Release | **Mais informações** → **Executar assim mesmo** |

---

## Estrutura do projeto (resumo)

```
WinCare/
├── src/                 # Interface React (rotas, componentes, lógica)
├── electron/            # Shell desktop (main, preload, renderer)
├── scripts/             # Launcher, empacote ZIP, limpeza de dados
├── .github/workflows/   # Release automática no GitHub
├── docs/                # Documentação (especificação original)
└── dist/                # Build da interface (gerado)
```

Detalhes técnicos do Electron: [electron/README.md](electron/README.md).

---

## Licença e origem

Projeto iniciado com [Lovable](https://lovable.dev). O código é seu; alterações no repositório podem ser sincronizadas de volta ao editor Lovable conforme o fluxo do time.
