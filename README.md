# WinCare

Central de manutenção do Windows com interface moderna. O WinCare reúne diagnóstico, reparo, rede, limpeza e monitoramento em um único app — sem precisar abrir CMD ou PowerShell manualmente.

> Especificação completa do produto (documento original do projeto): [docs/ESPECIFICACAO-ORIGINAL.md](docs/ESPECIFICACAO-ORIGINAL.md)

---

## Requisitos

- **Windows 10 ou 11**
- **Node.js 20+** e npm — [instalar com nvm](https://github.com/nvm-sh/nvm#installing-and-updating)
- Conexão com internet (para alguns comandos, como DISM RestoreHealth e teste de velocidade)

---

## Dois modos de uso

| Modo | Como abrir | Comportamento |
| --- | --- | --- |
| **Demonstração** | `npm run dev` | Abre no navegador. Métricas e comandos são **simulados**. |
| **Nativo (recomendado)** | `npm run wincare:dev` | App desktop. Executa comandos **reais** no Windows. |

No modo nativo, a barra superior exibe o badge **Modo nativo**. Comandos como SFC, DISM, `ipconfig` e ping rodam de verdade no sistema.

---

## Instalação e execução no seu PC

### 1. Clonar e instalar

```powershell
git clone <url-do-repositorio>
cd WinCare
npm install
```

### 2. Rodar o app desktop (uso normal)

```powershell
npm run wincare:dev
```

Na primeira execução no Windows, o script prepara a pasta `.electron-dev/` com o runtime do Electron. O processo aparece como **WinCare** no Gerenciador de Tarefas.

### 3. Preview no navegador (opcional)

```powershell
npm run dev
```

Abra a URL exibida no terminal (geralmente `http://localhost:5173`). Útil para desenvolver a interface; **não** executa comandos reais.

### 4. Gerar executável `.exe`

```powershell
npm run wincare:package
```

Saída em `electron-release/WinCare-win32-x64/WinCare.exe`. Para comandos administrativos, clique com o botão direito → **Executar como administrador**.

---

## Scripts npm

| Comando | Descrição |
| --- | --- |
| `npm run wincare:dev` | Compila e abre o WinCare (desktop) |
| `npm run wincare:admin` | Compila e abre o WinCare **como administrador** |
| `npm run wincare:dev:debug` | Igual ao dev, com DevTools (F12) |
| `npm run wincare:build` | Compila só a interface em `dist/` |
| `npm run wincare:package` | Gera o `.exe` para distribuição |
| `npm run wincare:clear-data` | Limpa histórico salvo localmente |
| `npm run wincare:test-network` | Testa comandos de rede fora da UI |
| `npm run dev` | Preview web (modo demonstração) |
| `npm run build` | Build web para produção |
| `npm run lint` | Verifica o código com ESLint |

---

## Funcionalidades do app

### Dashboard

Visão geral do PC: CPU, memória, disco, uptime, Windows Defender, última atualização e **saúde geral (0–100%)**. Ferramentas favoritas e **Verificação completa** (SFC + DISM + DNS + disco em sequência).

### Reparo

- Verificação de arquivos do sistema (`sfc /scannow`)
- DISM CheckHealth, ScanHealth e RestoreHealth
- Verificação de disco (`chkdsk`) e correção com confirmação
- Limpeza do cache do Windows Update

### Rede *(Beta — em desenvolvimento)*

Ping, traceroute, consulta DNS, renovar IP, reset Winsock/TCP/IP, limpar DNS e teste de velocidade. A aba Rede no modo nativo ainda pode apresentar instabilidade; use as demais abas normalmente.

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

Várias ferramentas (SFC, DISM, `netsh`, limpeza do Windows Update etc.) exigem elevação. **No modo desenvolvimento**, use uma destas opções:

1. **`npm run wincare:admin`** — recomendado
2. **`WinCare-Admin.cmd`** na raiz do projeto (duplo clique)
3. Botão **Executar como admin** dentro do app (barra superior)

> **Não** execute diretamente `.electron-dev\WinCare.exe` como administrador — sem o caminho do projeto, o Electron abre a tela padrão vazia.

Após **`npm run wincare:package`**, use o `WinCare.exe` em `electron-release/` — clique com o botão direito → **Executar como administrador**.

O Windows exibirá o prompt UAC quando necessário.

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

---

## Estrutura do projeto (resumo)

```
WinCare/
├── src/                 # Interface React (rotas, componentes, lógica)
├── electron/            # Shell desktop (main, preload, renderer)
├── scripts/             # Launcher dev, limpeza de dados, testes
├── docs/                # Documentação (especificação original)
└── dist/                # Build da interface (gerado)
```

Detalhes técnicos do Electron: [electron/README.md](electron/README.md).

---

## Desenvolvimento

```powershell
npm run lint          # ESLint
npm run format        # Prettier
npm run wincare:dev   # App desktop com hot rebuild da UI
```

---

## Licença e origem

Projeto iniciado com [Lovable](https://lovable.dev). O código é seu; alterações no repositório podem ser sincronizadas de volta ao editor Lovable conforme o fluxo do time.
