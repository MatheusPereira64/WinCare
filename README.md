# System Guardian Pro

Crie um aplicativo desktop moderno chamado WinCare (nome temporário), desenvolvido para Windows, cujo objetivo é centralizar ferramentas nativas de diagnóstico, reparo e otimização do sistema operacional.

O aplicativo deve possuir uma interface moderna inspirada no Windows 11, utilizando tons escuros, azul como cor principal, cantos arredondados, animações suaves e indicadores de progresso.

Objetivo

Eliminar a necessidade de abrir CMD ou PowerShell para executar comandos técnicos.

Cada funcionalidade deve possuir:

 Nome amigável

 Explicação do que faz

 Nível de risco (Seguro, Atenção ou Avançado)

 Botão Executar

 Barra de progresso

 Log em tempo real

 Resultado final

 Botão para copiar o log

Tela Inicial

Exibir um dashboard contendo:

 Nome do computador

 Versão do Windows

 Build

 Uso de CPU

 Uso de memória

 Espaço em disco

 Tempo ligado

 Status do Windows Defender

 Última atualização do Windows

 Saúde geral do sistema

Ferramentas de Reparo

Cada ferramenta deve executar o comando correspondente.

Verificar arquivos do sistema

Executa

sfc /scannow

Restaurar imagem do Windows

Executa

DISM /Online /Cleanup-Image /RestoreHealth

ScanHealth

DISM /Online /Cleanup-Image /ScanHealth

CheckHealth

DISM /Online /Cleanup-Image /CheckHealth

Verificar Disco

chkdsk C:

Opcionalmente oferecer

chkdsk /f

com confirmação.

Limpar DNS

ipconfig /flushdns

Renovar IP

ipconfig /release

ipconfig /renew

Reset Winsock

netsh winsock reset

Reset TCP/IP

netsh int ip reset

Limpar cache do Windows Update

Criar uma rotina automática que pare os serviços necessários, limpe as pastas e reinicie os serviços.

Ferramentas de Rede

Adicionar:

Teste de Internet

ping google.com

Ping personalizado

Traceroute

tracert

Consulta DNS

Velocidade da conexão (caso exista API)

Ferramentas do Sistema

Abrir rapidamente:

Gerenciador de Dispositivos

devmgmt.msc

Gerenciamento de Disco

diskmgmt.msc

Serviços

services.msc

Editor de Registro

regedit

Visualizador de Eventos

eventvwr

Gerenciador de Tarefas

Painel de Controle

Configurações

Ferramentas de Limpeza

Limpeza de arquivos temporários

Abrir Limpeza de Disco

cleanmgr

Excluir:

Temp

%temp%

Prefetch

Cache do Windows

Integridade

Mostrar:

Status SMART do HD

Saúde do SSD

Espaço livre

Temperatura (caso possível)

Logs

Toda ação deve ficar registrada.

Exemplo:

19:10

Executando:

sfc /scannow

Resultado:

Windows Resource Protection found no integrity violations.

Permitir:

Exportar TXT

Exportar PDF

Copiar Log

Segurança

Antes de executar comandos críticos:

Mostrar confirmação.

Executar sempre como Administrador.

Informar riscos.

Interface

Sidebar com:

🏠 Dashboard

🛠 Reparo

🌐 Rede

🧹 Limpeza

💽 Disco

📊 Monitoramento

📜 Logs

⚙ Configurações

Funcionalidades Extras

Adicionar um botão chamado:

Verificação Completa

Ele executa automaticamente:

 SFC

 DISM CheckHealth

 DISM ScanHealth

 DISM RestoreHealth

 Flush DNS

 Winsock Reset

 Verificação de Disco

Exibindo uma barra de progresso única.

Diferenciais

Adicionar:

Histórico de execuções

Favoritos

Pesquisa por ferramenta

Tema claro/escuro

Atalhos de teclado

Indicador visual da saúde do computador (0–100%)

Verificação automática ao iniciar o aplicativo

Tecnologias sugeridas

Frontend: React + TypeScript + Tailwind CSS + shadcn/ui

Desktop: Tauri (preferível, por ser leve e seguro) ou Electron

Backend: Rust (Tauri) ou Node.js (Electron)

Gráficos: Recharts

Gerenciamento de estado: Zustand

Ícones: Lucide React

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b5908917-eb4b-4cdd-9077-908409109966).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
