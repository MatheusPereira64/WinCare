import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type ResourceStatus = "loading" | "ready" | "error";

export interface Resource<T> {
  data: T | undefined;
  status: ResourceStatus;
  /** Mensagem legível da última falha sem dados na tela. */
  error: string | null;
  /** Atualizando com dados já na tela (o conteúdo continua visível). */
  refreshing: boolean;
  reload: () => Promise<T | undefined>;
  /** Atualização local (ex.: alternar um item no modo demonstração). */
  setData: (next: T | ((prev: T | undefined) => T)) => void;
}

const messageOf = (err: unknown) =>
  err instanceof Error ? err.message : typeof err === "string" ? err : undefined;

/**
 * Carrega dados com a regra de estados do app (docs/design-system.md):
 * - primeira carga: status "loading" → "ready" | "error" (sem toast; a tela mostra ErrorState);
 * - recarga com dados na tela: mantém os dados, `refreshing` true; se falhar,
 *   os dados ficam e sai um toast com "Tentar novamente".
 * Respostas antigas (recarga mais nova em andamento) e de telas desmontadas são ignoradas.
 */
export function useResource<T>(
  loader: () => Promise<T>,
  options: {
    /** Frase do toast/ErrorState: "Não foi possível listar os programas." */
    errorMessage: string;
    /** Chamado a cada carga bem-sucedida (ex.: seleção padrão). */
    onLoad?: (data: T) => void;
    /** Adia a primeira carga (telas que não devem disparar IPC pesado ao abrir). */
    delayMs?: number;
  },
): Resource<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [status, setStatus] = useState<ResourceStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loaderRef = useRef(loader);
  const optionsRef = useRef(options);
  const dataRef = useRef<T | undefined>(undefined);
  const requestRef = useRef(0);
  const aliveRef = useRef(true);
  /* O toast de erro chama a versão mais recente de reload sem referência circular. */
  const reloadRef = useRef<() => Promise<T | undefined>>(async () => undefined);
  useEffect(() => {
    loaderRef.current = loader;
    optionsRef.current = options;
  });

  const setData = useCallback((next: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => {
      const value = typeof next === "function" ? (next as (p: T | undefined) => T)(prev) : next;
      dataRef.current = value;
      return value;
    });
  }, []);

  const reload = useCallback(async () => {
    const id = ++requestRef.current;
    const hasData = dataRef.current !== undefined;
    if (hasData) setRefreshing(true);
    else setStatus("loading");
    try {
      const value = await loaderRef.current();
      if (!aliveRef.current || id !== requestRef.current) return value;
      dataRef.current = value;
      setDataState(value);
      setError(null);
      setStatus("ready");
      optionsRef.current.onLoad?.(value);
      return value;
    } catch (err) {
      if (!aliveRef.current || id !== requestRef.current) return undefined;
      const detail = messageOf(err);
      if (dataRef.current !== undefined) {
        toast.error(optionsRef.current.errorMessage, {
          description: detail,
          action: { label: "Tentar novamente", onClick: () => void reloadRef.current() },
        });
        setStatus("ready");
      } else {
        setError(detail ?? null);
        setStatus("error");
      }
      return undefined;
    } finally {
      if (aliveRef.current && id === requestRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    aliveRef.current = true;
    const delay = optionsRef.current.delayMs ?? 0;
    const t = delay > 0 ? window.setTimeout(() => void reload(), delay) : null;
    if (t === null) void reload();
    return () => {
      aliveRef.current = false;
      if (t !== null) window.clearTimeout(t);
    };
  }, [reload]);

  return { data, status, error, refreshing, reload, setData };
}
