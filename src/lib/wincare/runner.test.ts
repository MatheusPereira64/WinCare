import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { formatLog, useToolRunner } from "./runner";
import { actions, getStoreState } from "./store";
import { TOOLS } from "./tools";
import type { RunRecord, Tool } from "./types";

const tool = (id: string): Tool => {
  const found = TOOLS.find((t) => t.id === id);
  if (!found) throw new Error(`ferramenta ${id} não existe`);
  return found;
};

/** Preload falso: o comando "roda" e devolve a saída em pedaços. */
function installNative(overrides: Record<string, unknown> = {}) {
  const native = {
    run: vi.fn(async (_command: string, onData: (chunk: string) => void) => {
      onData("linha 1\r\nlinha 2\r\n");
      return { code: 0, result: "Tudo certo." };
    }),
    isElevated: vi.fn(async () => false),
    createRestorePoint: vi.fn(async () => ({
      ok: true,
      status: "created",
      message: "Ponto criado.",
    })),
    ...overrides,
  };
  (window as unknown as { wincare: unknown }).wincare = native;
  return native;
}

async function runTool(id: string, options?: { skipRestorePoint?: boolean }) {
  const { result } = renderHook(() => useToolRunner(tool(id)));
  let record: RunRecord | undefined;
  await act(async () => {
    record = await result.current.run(options);
  });
  return { result, record: record! };
}

describe("useToolRunner (app para Windows)", () => {
  it("roda o comando, junta a saída e grava no histórico de execuções", async () => {
    const native = installNative();
    const { result, record } = await runTool("dism-check");
    expect(native.run).toHaveBeenCalledWith(
      tool("dism-check").command,
      expect.any(Function),
      expect.objectContaining({ elevated: true }),
    );
    expect(record.status).toBe("success");
    expect(record.result).toBe("Tudo certo.");
    const texts = record.lines.map((l) => l.text);
    expect(texts[0]).toMatch(/^Executando: /);
    expect(texts).toContain("Pedindo permissão de administrador (UAC)…");
    expect(texts).toEqual(expect.arrayContaining(["linha 1", "linha 2"]));
    expect(texts.at(-1)).toBe("Resultado: Tudo certo.");
    expect(result.current.state).toMatchObject({
      running: false,
      progress: 100,
      status: "success",
    });
    expect(getStoreState().runs[0].id).toBe(record.id);
  });

  it("já elevado: não pede UAC", async () => {
    const native = installNative({ isElevated: vi.fn(async () => true) });
    await runTool("dism-check");
    expect(native.run).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ elevated: false }),
    );
  });

  it("código diferente de zero vira erro", async () => {
    installNative({ run: vi.fn(async () => ({ code: 5, result: "Acesso negado." })) });
    const { record, result } = await runTool("dism-check");
    expect(record.status).toBe("error");
    expect(result.current.state.status).toBe("error");
  });

  it("ação avançada cria o ponto de restauração antes", async () => {
    const native = installNative();
    actions.setAutoRestorePoint(true);
    const { record } = await runTool("dism-restore");
    expect(native.createRestorePoint).toHaveBeenCalledWith(tool("dism-restore").name);
    expect(native.createRestorePoint.mock.invocationCallOrder[0]).toBeLessThan(
      native.run.mock.invocationCallOrder[0],
    );
    expect(record.status).toBe("success");
  });

  it("ponto de restauração falhou: a ação não roda", async () => {
    const native = installNative({
      createRestorePoint: vi.fn(async () => ({
        ok: false,
        status: "error",
        message: "Desativado.",
      })),
    });
    actions.setAutoRestorePoint(true);
    const { record } = await runTool("dism-restore");
    expect(native.run).not.toHaveBeenCalled();
    expect(record.status).toBe("error");
    expect(record.restorePointFailed).toBe(true);
    expect(record.result).toMatch(/ponto de restauração falhou/);
  });

  it("o usuário pode seguir sem ponto de restauração", async () => {
    const native = installNative();
    actions.setAutoRestorePoint(true);
    await runTool("dism-restore", { skipRestorePoint: true });
    expect(native.createRestorePoint).not.toHaveBeenCalled();
    expect(native.run).toHaveBeenCalled();
  });

  it("não roda duas vezes a mesma ferramenta ao mesmo tempo", async () => {
    let finish: (v: { code: number; result: string }) => void = () => {};
    const native = installNative({
      run: vi.fn(() => new Promise((resolve) => (finish = resolve))),
    });
    const { result } = renderHook(() => useToolRunner(tool("chkdsk")));
    let first: Promise<RunRecord | undefined> | undefined;
    act(() => {
      first = result.current.run();
    });
    await waitFor(() => expect(native.run).toHaveBeenCalledTimes(1));
    await act(async () => {
      expect(await result.current.run()).toBeUndefined();
    });
    await act(async () => {
      finish({ code: 0, result: "ok" });
      await first;
    });
    expect(native.run).toHaveBeenCalledTimes(1);
  });
});

describe("formatLog", () => {
  it("uma linha por evento com o horário", () => {
    expect(
      formatLog([
        { time: "12:00:01", text: "Executando: sfc", kind: "info" },
        { time: "12:00:09", text: "Resultado: ok", kind: "success" },
      ]),
    ).toBe("[12:00:01] Executando: sfc\n[12:00:09] Resultado: ok");
  });
});
