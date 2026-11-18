import { describe, expect, it } from "vitest";

import { interpretCommandFeed, normalizeCmdText } from "./commandFeed";
import type { LogLine } from "./types";

const lines = (...texts: string[]): LogLine[] =>
  texts.map((text): LogLine => ({ time: "12:00:00", text, kind: "output" }));

describe("normalizeCmdText", () => {
  it("junta texto UTF-16 lido como bytes (letras separadas por espaço/nulo)", () => {
    expect(normalizeCmdText("c o n c l u í d a c o m ê x i t o")).toBe("concluídacomêxito");
    expect(normalizeCmdText("V\0e\0r\0i\0f\0i\0c\0a\0ç\0ã\0o")).toBe("Verificação");
  });

  it("fica só com a última atualização de uma linha de progresso com CR", () => {
    expect(normalizeCmdText("[==   10.0% ]\r[=====  55.0% ]\r[==========100.0%]")).toBe(
      "[==========100.0%]",
    );
  });

  it("tabela com colunas alinhadas não é confundida com texto UTF-16 espaçado", () => {
    expect(normalizeCmdText("C:       142857483264   511101108224")).toBe(
      "C: 142857483264 511101108224",
    );
  });

  it("remove caractere de substituição e espaços repetidos", () => {
    expect(normalizeCmdText("  Opera�ção   concluída  ")).toBe("Operação concluída");
    expect(normalizeCmdText("")).toBe("");
  });
});

describe("interpretCommandFeed", () => {
  it("SFC sem violações: sucesso com mensagem amigável", () => {
    const out = interpretCommandFeed(
      lines(
        "Início da verificação do sistema.",
        "A Proteção de Recursos do Windows não encontrou nenhuma violação de integridade.",
      ),
      { toolName: "Verificar arquivos do sistema", status: "success" },
    );
    expect(out.tone).toBe("success");
    expect(out.label).toBe("Concluído");
    expect(out.message).toBe(
      "Nenhuma violação de integridade. Os arquivos do Windows estão íntegros.",
    );
    expect(out.phase).toBeNull();
  });

  it("SFC em andamento: fase e progresso pela 'fase X de Y'", () => {
    const out = interpretCommandFeed(lines("Verificação da fase 2 de 3 concluída."), {
      running: true,
      toolName: "sfc /scannow",
    });
    expect(out.tone).toBe("running");
    expect(out.label).toBe("Em andamento");
    expect(out.progress).toBe(67);
    expect(out.phase).toBe("Verificando arquivos do sistema · fase 2 de 3");
  });

  it("DISM com barra de progresso usa a última porcentagem", () => {
    const out = interpretCommandFeed(
      lines("[==========  20.0% ]", "[==================  55,0% ]"),
      {
        running: true,
        toolName: "DISM ScanHealth",
      },
    );
    expect(out.progress).toBe(55);
    expect(out.phase).toBe("Analisando a imagem do Windows");
    expect(out.message).toBe("Processando… isso pode levar vários minutos.");
  });

  it("arquivos corrompidos reparados x não reparados", () => {
    expect(
      interpretCommandFeed(lines("O sistema encontrou arquivos corrompidos e reparou todos."))
        .message,
    ).toBe("Arquivos corrompidos foram encontrados e reparados.");
    const notFixed = interpretCommandFeed(lines("A proteção encontrou arquivos corrompidos."));
    expect(notFixed.tone).toBe("error");
    expect(notFixed.message).toMatch(/DISM RestoreHealth/);
  });

  it("acesso negado vira erro mesmo sem status", () => {
    const out = interpretCommandFeed(lines("Erro: Acesso negado."));
    expect(out.tone).toBe("error");
    expect(out.label).toBe("Falhou");
  });

  it("status de erro do runner prevalece", () => {
    expect(interpretCommandFeed(lines("qualquer coisa aqui"), { status: "error" }).tone).toBe(
      "error",
    );
  });

  it("ignora linhas de controle (Executando:, separadores) ao escolher a mensagem", () => {
    const out = interpretCommandFeed(
      lines("Algo útil aconteceu aqui", "Executando: sfc", "======"),
    );
    expect(out.message).toBe("Algo útil aconteceu aqui");
  });

  it("sem saída: mensagens de espera e de 'sem detalhes'", () => {
    expect(interpretCommandFeed([], { running: true }).message).toBe(
      "Aguardando a primeira resposta do Windows…",
    );
    expect(interpretCommandFeed([]).message).toBe("Sem detalhes adicionais.");
  });

  it("mensagem longa é cortada em 160 caracteres", () => {
    const out = interpretCommandFeed(lines("x".repeat(300)));
    expect(out.message).toHaveLength(158);
    expect(out.message.endsWith("…")).toBe(true);
  });
});
