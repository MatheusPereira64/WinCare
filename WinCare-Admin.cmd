@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "EXE=%ROOT%\.electron-dev\WinCare.exe"

if not exist "%EXE%" (
  echo [WinCare] WinCare.exe nao encontrado. Rode: npm run wincare:dev
  pause
  exit /b 1
)

net session >nul 2>&1
if not %errorLevel%==0 (
  set "VBS=%TEMP%\wincare-admin-%RANDOM%.vbs"
  >"%VBS%" echo Set sh = CreateObject("Shell.Application")
  >>"%VBS%" echo sh.ShellExecute "%~f0", "", "", "runas", 1
  cscript //nologo "%VBS%"
  del "%VBS%" >nul 2>&1
  exit /b
)

cd /d "%ROOT%"
"%EXE%" "%ROOT%"
