# Limpa os dados locais do WinCare (histórico, preferências salvas no Electron).
$paths = @(
  "$env:APPDATA\WinCare\Local Storage",
  "$env:APPDATA\tanstack_start_ts\Local Storage"
)

foreach ($path in $paths) {
  if (Test-Path $path) {
    Remove-Item -Recurse -Force $path
    Write-Host "Removido: $path"
  }
}

Write-Host "Concluido. Reinicie o WinCare com: npm run electron:dev"
