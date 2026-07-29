# Especificação original — System Guardian Pro / WinCare

Este documento preserva o conteúdo do README inicial do projeto (especificação de produto e requisitos funcionais). Para instruções de instalação e uso no PC, consulte o [README.md](../README.md) na raiz do repositório.

---

# System Guardian Pro

Crie um aplicativo desktop moderno chamado WinCare (nome temporário), desenvolvido para Windows, cujo objetivo é centralizar ferramentas nativas de diagnóstico, reparo e otimização do sistema operacional.

O aplicativo deve possuir uma interface moderna inspirada no Windows 11, utilizando tons escuros, azul como cor principal, cantos arredondados, animações suaves e indicadores de progresso.

## Objetivo

Eliminar a necessidade de abrir CMD ou PowerShell para executar comandos técnicos.

Cada funcionalidade deve possuir:

- Nome amigável
- Explicação do que faz
- Nível de risco (Seguro, Atenção ou Avançado)
- Botão Executar
- Barra de progresso
- Log em tempo real
- Resultado final
- Botão para copiar o log

## Tela Inicial

Exibir um dashboard contendo:

- Nome do computador
- Versão do Windows
- Build
- Uso de CPU
- Uso de memória
- Espaço em disco
- Tempo ligado
- Status do Windows Defender
- Última atualização do Windows
- Saúde geral do sistema

## Ferramentas de Reparo

Cada ferramenta deve executar o comando correspondente.

### Verificar arquivos do sistema

Executa `sfc /scannow`

### Restaurar imagem do Windows

Executa `DISM /Online /Cleanup-Image /RestoreHealth`

### ScanHealth

`DISM /Online /Cleanup-Image /ScanHealth`

### CheckHealth

`DISM /Online /Cleanup-Image /CheckHealth`

### Verificar Disco

`chkdsk C:`

Opcionalmente oferecer `chkdsk /f` com confirmação.

### Limpar DNS

`ipconfig /flushdns`

### Renovar IP

`ipconfig /release` e `ipconfig /renew`

### Reset Winsock

`netsh winsock reset`

### Reset TCP/IP

`netsh int ip reset`

### Limpar cache do Windows Update

Criar uma rotina automática que pare os serviços necessários, limpe as pastas e reinicie os serviços.

## Ferramentas de Rede

Adicionar:

- Teste de Internet — `ping google.com`
- Ping personalizado
- Traceroute — `tracert`
- Consulta DNS
- Velocidade da conexão (caso exista API)

## Ferramentas do Sistema

Abrir rapidamente:

| Ferramenta | Comando |
| --- | --- |
| Gerenciador de Dispositivos | `devmgmt.msc` |
| Gerenciamento de Disco | `diskmgmt.msc` |
| Serviços | `services.msc` |
| Editor de Registro | `regedit` |
| Visualizador de Eventos | `eventvwr` |
| Gerenciador de Tarefas | `taskmgr` |
| Painel de Controle | `control` |
| Configurações | `ms-settings:` |

## Ferramentas de Limpeza

- Limpeza de arquivos temporários
- Abrir Limpeza de Disco — `cleanmgr`
- Excluir Temp (`%temp%`), Prefetch, Cache do Windows

## Integridade

Mostrar:

- Status SMART do HD
- Saúde do SSD
- Espaço livre
- Temperatura (caso possível)

## Logs

Toda ação deve ficar registrada.

Exemplo:

```
19:10
Executando: sfc /scannow
Resultado: Windows Resource Protection found no integrity violations.
```

Permitir:

- Exportar TXT
- Exportar PDF
- Copiar Log

## Segurança

Antes de executar comandos críticos:

- Mostrar confirmação
- Executar sempre como Administrador
- Informar riscos

## Interface

Sidebar com:

- Dashboard
- Reparo
- Rede
- Limpeza
- Disco
- Monitoramento
- Logs
- Configurações

## Funcionalidades Extras

Botão **Verificação Completa**, executando automaticamente:

- SFC
- DISM CheckHealth
- DISM ScanHealth
- DISM RestoreHealth
- Flush DNS
- Winsock Reset
- Verificação de Disco

Exibindo uma barra de progresso única.

## Diferenciais

- Histórico de execuções
- Favoritos
- Pesquisa por ferramenta
- Tema claro/escuro
- Atalhos de teclado
- Indicador visual da saúde do computador (0–100%)
- Verificação automática ao iniciar o aplicativo

## Tecnologias sugeridas (especificação inicial)

- **Frontend:** React + TypeScript + Tailwind CSS + shadcn/ui
- **Desktop:** Tauri (preferível) ou Electron
- **Backend:** Rust (Tauri) ou Node.js (Electron)
- **Gráficos:** Recharts
- **Gerenciamento de estado:** Zustand
- **Ícones:** Lucide React

---

## Notas de implementação atual

A versão em desenvolvimento utiliza **React + TypeScript + TanStack Router + Electron** (não Tauri). Detalhes técnicos do shell desktop estão em [electron/README.md](../electron/README.md).

Este projeto foi iniciado com [Lovable](https://lovable.dev).
