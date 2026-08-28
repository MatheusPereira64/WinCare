import type { LogLine } from "./types";

export interface CommandInsight {
  title: string;
  label: string;
  phase: string | null;
  message: string;
  progress: number | null;
  tone: "running" | "success" | "error" | "info";
}

const TONE_LABEL: Record<CommandInsight["tone"], string> = {
  running: "Em andamento",
  success: "Concluído",
  error: "Falhou",
  info: "Concluído",
};

/** Junta "c o n c l u í d a" (UTF-16 lido errado) e limpa CR de progresso. */
export function normalizeCmdText(raw: string) {
  let text = String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/\uFFFD/g, "");
  if (text.includes("\r")) {
    const parts = text
      .split("\r")
      .map((part) => part.trim())
      .filter(Boolean);
    text = parts[parts.length - 1] || text;
  }
  const parts = text.split(" ");
  const singles = parts.filter((p) => p.length <= 1).length;
  if (parts.length >= 8 && singles / parts.length > 0.65) {
    text = parts.join("");
  }
  return text.replace(/\s+/g, " ").trim();
}

function lastProgress(texts: string[]) {
  let value: number | null = null;
  for (const text of texts) {
    const bar = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (bar) {
      value = Math.min(100, Math.round(Number(bar[1].replace(",", "."))));
      continue;
    }
    const phase = text.match(/fase\s+(\d+)\s+de\s+(\d+)/i);
    if (phase) {
      value = Math.min(100, Math.round((Number(phase[1]) / Number(phase[2])) * 100));
    }
  }
  return value;
}

function meaningfulMessage(texts: string[]) {
  const skip = /^(executando:|resultado:|solicitando eleva|\[\.\.\.|tempo limite)/i;
  for (let i = texts.length - 1; i >= 0; i--) {
    const line = texts[i];
    if (!line || skip.test(line) || line.length < 8) continue;
    if (/^[_=\-\s]+$/.test(line)) continue;
    return line;
  }
  return "";
}

function classify(text: string, running: boolean, status?: string): CommandInsight["tone"] {
  if (running) return "running";
  if (status === "error") return "error";
  const t = text.toLowerCase();
  if (
    /n[aã]o encontrou nenhuma viola|nenhuma corrup[cç][aã]o|conclu[ií]da? com [eê]xito|n[aã]o encontrou problemas|verificou o sistema de arquivos|no component store corruption|completed successfully/i.test(
      t,
    )
  ) {
    return "success";
  }
  if (
    /encontrou arquivos corrompidos|falha|erro|negada|n[aã]o foi poss|access is denied/i.test(t)
  ) {
    return "error";
  }
  if (status === "success") return "success";
  return "info";
}

function friendlyTitle(tone: CommandInsight["tone"], toolName?: string, running?: boolean) {
  if (running) return toolName || "Operação em andamento";
  if (tone === "success") return toolName || "Concluído";
  if (tone === "error") return toolName || "Não foi possível concluir";
  return toolName || "Resultado";
}

function detectPhase(
  joined: string,
  toolName: string | undefined,
  running: boolean,
  progress: number | null,
) {
  if (!running) return null;
  const t = `${joined} ${toolName || ""}`.toLowerCase();
  if (/sfc|prote[cç][aã]o de recursos|arquivos do sistema/.test(t)) {
    const phase = joined.match(/fase\s+(\d+)\s+de\s+(\d+)/i);
    if (phase) return `Verificando arquivos do sistema · fase ${phase[1]} de ${phase[2]}`;
    if (progress != null && progress >= 99) return "Finalizando a verificação dos arquivos";
    return "Verificando arquivos do sistema";
  }
  if (/dism|restorehealth|scanhealth|checkhealth|imagem do windows/.test(t)) {
    if (/restorehealth|restauração/.test(t)) return "Reparando a imagem do Windows";
    return "Analisando a imagem do Windows";
  }
  if (/chkdsk|sistema de arquivos|verifica[cç][aã]o de disco/.test(t)) {
    return "Verificando o disco";
  }
  if (/ping/.test(t)) return "Testando a conexão";
  if (/nslookup|dns/.test(t)) return "Consultando DNS";
  if (/tracert/.test(t)) return "Rastreando a rota";
  return "Aguardando resposta do Windows";
}

function friendlyMessage(normalized: string, tone: CommandInsight["tone"], running: boolean) {
  const t = normalized.toLowerCase();
  if (/n[aã]o encontrou nenhuma viola[cç][aã]o/.test(t)) {
    return "Nenhuma violação de integridade. Os arquivos do Windows estão íntegros.";
  }
  if (/encontrou arquivos corrompidos/.test(t) && /reparou|corrigiu/.test(t)) {
    return "Arquivos corrompidos foram encontrados e reparados.";
  }
  if (/encontrou arquivos corrompidos/.test(t)) {
    return "Arquivos corrompidos encontrados. Pode ser necessário o DISM RestoreHealth.";
  }
  if (/nenhuma corrup[cç][aã]o|no component store corruption/.test(t)) {
    return "Nenhuma corrupção detectada na imagem do Windows.";
  }
  if (/n[aã]o encontrou problemas|verificou o sistema de arquivos/.test(t)) {
    return "O disco foi verificado e não há problemas no sistema de arquivos.";
  }
  if (/agendada? na pr[oó]xima/.test(t)) {
    return "A verificação de disco foi agendada para a próxima reinicialização.";
  }
  if (/opera[cç][aã]o foi conclu[ií]da com [eê]xito|completed successfully/.test(t)) {
    return "A operação terminou com êxito.";
  }
  if (/iniciando a verifica|essa opera[cç][aã]o pode demorar/.test(t)) {
    return "A verificação começou. Isso pode levar vários minutos.";
  }
  if (running && /\d+\s*%/.test(normalized)) {
    return "Processando… isso pode levar vários minutos.";
  }
  if (tone === "error") {
    return normalized || "O comando terminou com erro.";
  }
  if (normalized.length > 160) return `${normalized.slice(0, 157)}…`;
  return (
    normalized ||
    (running ? "Aguardando a primeira resposta do Windows…" : "Sem detalhes adicionais.")
  );
}

export function interpretCommandFeed(
  lines: LogLine[],
  options?: { running?: boolean; status?: string; toolName?: string; result?: string },
): CommandInsight {
  const texts = lines.map((l) => normalizeCmdText(l.text)).filter(Boolean);
  const result = normalizeCmdText(options?.result || "");
  const joined = [...texts, result].filter(Boolean).join(" ");
  const progress = lastProgress([...texts, result]);
  const rawMessage = meaningfulMessage(texts) || result;
  const running = !!options?.running;
  const tone = classify(`${rawMessage} ${result}`, running, options?.status);
  const message = friendlyMessage(rawMessage || result, tone, running);

  return {
    title: friendlyTitle(tone, options?.toolName, running),
    label: TONE_LABEL[tone],
    phase: detectPhase(joined, options?.toolName, running, progress),
    message,
    progress,
    tone,
  };
}
