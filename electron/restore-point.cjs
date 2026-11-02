const { psAdminJson, psQuote } = require("./powershell.cjs");

const RESTORE_POINT_TIMEOUT_MS = 5 * 60 * 1000;

/** Só letras, números e pontuação simples — a descrição aparece no Restaurar Sistema. */
const sanitizeDescription = (value) =>
  String(value || "manutenção")
    .replace(/[^\p{L}\p{N} .,_()/-]+/gu, "")
    .slice(0, 48)
    .trim();

/**
 * O Windows limita a um ponto a cada 24 h e ignora os demais só com um aviso:
 * por isso comparamos o mais recente antes e depois, e aceitamos um ponto de menos de 24 h.
 */
function restorePointScript(description) {
  return String.raw`
$ErrorActionPreference = 'Stop'
try {
  $before = @(Get-ComputerRestorePoint -ErrorAction SilentlyContinue)
  $lastSeq = ($before | Measure-Object -Property SequenceNumber -Maximum).Maximum
  Checkpoint-Computer -Description ${psQuote(`WinCare - ${sanitizeDescription(description)}`)} -RestorePointType 'MODIFY_SETTINGS' -WarningAction SilentlyContinue
  $newest = @(Get-ComputerRestorePoint) | Sort-Object SequenceNumber | Select-Object -Last 1
  if (-not $newest) {
    @{ ok = $false; status = 'failed'; message = 'A Proteção do Sistema parece estar desativada.' } | ConvertTo-Json -Compress
    return
  }
  $created = [Management.ManagementDateTimeConverter]::ToDateTime($newest.CreationTime)
  if ($null -eq $lastSeq -or $newest.SequenceNumber -gt $lastSeq) {
    @{ ok = $true; status = 'created'; createdAt = $created.ToString('o'); message = 'Ponto de restauração criado.' } | ConvertTo-Json -Compress
  } elseif (((Get-Date) - $created).TotalHours -lt 24) {
    @{ ok = $true; status = 'recent'; createdAt = $created.ToString('o'); message = 'Já existe um ponto de restauração das últimas 24 horas.' } | ConvertTo-Json -Compress
  } else {
    @{ ok = $false; status = 'failed'; message = 'O Windows não criou o ponto de restauração.' } | ConvertTo-Json -Compress
  }
} catch {
  @{ ok = $false; status = 'failed'; message = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
}

async function createRestorePoint(description) {
  try {
    const out = await psAdminJson(restorePointScript(description), RESTORE_POINT_TIMEOUT_MS);
    if (out?.reason === "cancelled") {
      return {
        ok: false,
        status: "cancelled",
        message: "Permissão de administrador negada ou cancelada.",
      };
    }
    return out ?? { ok: false, status: "failed", message: "Sem resposta do Windows." };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : "Falha ao criar o ponto de restauração.",
    };
  }
}

module.exports = { createRestorePoint, sanitizeDescription };
