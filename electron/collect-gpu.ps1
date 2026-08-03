# Saída JSON: { name, usage, temperature, memoryUsedMb, memoryTotalMb }
# Usado pelo WinCare (electron/system-metrics.cjs) para GPUs AMD.

$ErrorActionPreference = 'SilentlyContinue'
$result = @{
  name = $null
  usage = $null
  temperature = $null
  memoryUsedMb = $null
  memoryTotalMb = $null
}

$vc = Get-CimInstance Win32_VideoController |
  Where-Object { $_.Name -and $_.Name -notmatch 'Microsoft Basic|Remote Desktop' } |
  Select-Object -First 1
if ($vc) { $result.name = [string]$vc.Name }

try {
  $memRows = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory)
  $best = $memRows | Sort-Object DedicatedUsage -Descending | Select-Object -First 1
  if ($best -and $best.DedicatedUsage -gt 0) {
    # DedicatedUsage = em uso. TotalCommitted NÃO é a VRAM instalada — não usar como total.
    $result.memoryUsedMb = [int][math]::Round($best.DedicatedUsage / 1MB)
  }
} catch {}

# Temperatura / uso via ADL PMLog (atiadlxx.dll) — mesmo caminho do Adrenalin / Gerenciador de Tarefas.
# Preferir PMLog para USAGE: a média dos contadores Win32_GPUEngine dilui o valor real (~sempre 0%).
try {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class WinCareAdl {
  public const int ADL_OK = 0;
  public const int ADL_PMLOG_MAX_SENSORS = 256;
  public const int PMLOG_TEMPERATURE_EDGE = 8;
  public const int PMLOG_INFO_ACTIVITY_GFX = 17;

  [StructLayout(LayoutKind.Sequential)]
  public struct ADLSingleSensorData {
    public int supported;
    public int value;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct ADLPMLogDataOutput {
    public int size;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = ADL_PMLOG_MAX_SENSORS)]
    public ADLSingleSensorData[] sensors;
  }

  public delegate IntPtr ADL_Main_Memory_Alloc(int size);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool SetDllDirectory(string path);

  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL2_Main_Control_Create(ADL_Main_Memory_Alloc cb, int enumConnected, out IntPtr context);

  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL2_Main_Control_Destroy(IntPtr context);

  [DllImport("atiadlxx.dll", CallingConvention = CallingConvention.Cdecl)]
  public static extern int ADL2_New_QueryPMLogData_Get(IntPtr context, int adapterIndex, ref ADLPMLogDataOutput data);

  public static IntPtr Alloc(int size) { return Marshal.AllocHGlobal(size); }
  public static ADL_Main_Memory_Alloc GetAllocator() { return new ADL_Main_Memory_Alloc(WinCareAdl.Alloc); }
}
"@

  [void][WinCareAdl]::SetDllDirectory("$env:WINDIR\System32")
  $ctx = [IntPtr]::Zero
  $alloc = [WinCareAdl]::GetAllocator()
  $created = [WinCareAdl]::ADL2_Main_Control_Create($alloc, 1, [ref]$ctx)
  if ($created -eq 0 -and $ctx -ne [IntPtr]::Zero) {
    for ($i = 0; $i -lt 16; $i++) {
      $data = New-Object WinCareAdl+ADLPMLogDataOutput
      $data.size = [System.Runtime.InteropServices.Marshal]::SizeOf([type][WinCareAdl+ADLPMLogDataOutput])
      $data.sensors = New-Object WinCareAdl+ADLSingleSensorData[] ([WinCareAdl]::ADL_PMLOG_MAX_SENSORS)
      $qr = [WinCareAdl]::ADL2_New_QueryPMLogData_Get($ctx, $i, [ref]$data)
      if ($qr -ne 0) { continue }

      $edge = $data.sensors[[WinCareAdl]::PMLOG_TEMPERATURE_EDGE]
      $act = $data.sensors[[WinCareAdl]::PMLOG_INFO_ACTIVITY_GFX]

      $gotTemp = $false

      if ($edge.supported -ne 0 -and $edge.value -gt 0 -and $edge.value -lt 130) {
        $result.temperature = [int]$edge.value
        $gotTemp = $true
      }
      # Sempre preferir atividade GFX do ADL neste adaptador (não deixar o fallback WMI sobrescrever).
      if ($act.supported -ne 0 -and $act.value -ge 0 -and $act.value -le 100) {
        $result.usage = [int]$act.value
      }

      # Adaptador discreto (tem edge temp) — já lemos o uso deste índice.
      if ($gotTemp) { break }
    }
    [void][WinCareAdl]::ADL2_Main_Control_Destroy($ctx)
  }
} catch {}

# Fallback Windows: máximo dos engines 3D (média entre PIDs dilui o uso real).
if ($null -eq $result.usage) {
  try {
    $engines = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine |
      Where-Object { $_.Name -like '*engtype_3D*' }
    if ($engines) {
      $max = ($engines | Measure-Object -Property UtilizationPercentage -Maximum).Maximum
      if ($null -ne $max) {
        $result.usage = [int][math]::Min(100, [math]::Round($max))
      }
    }
  } catch {}
}

$result | ConvertTo-Json -Compress
