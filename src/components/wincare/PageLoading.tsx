import { useId, useLayoutEffect, useState } from "react";

import { cn } from "@/lib/utils";
import appLogo from "@/assets/wincare-icon.png";

export function PageLoading({
  label = "Carregando…",
  compact = false,
  className,
}: {
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const gradientId = useId().replace(/:/g, "");

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-2" : "min-h-[40vh] py-12",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-5 rounded-3xl border border-border/50 px-10 py-8",
          "bg-card/70 shadow-lg backdrop-blur-md",
          "surface-panel animate-fade-in",
        )}
      >
        <div className="relative size-32">
          <span
            className="absolute inset-3 rounded-full bg-primary/25 blur-2xl"
            aria-hidden
          />
          <svg
            className="animate-wincare-loader-spin absolute inset-0 size-full"
            viewBox="0 0 100 100"
            fill="none"
            aria-hidden
          >
            <circle
              cx="50"
              cy="50"
              r="44"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-primary/20"
            />
            <circle
              cx="50"
              cy="50"
              r="44"
              stroke={`url(#${gradientId})`}
              strokeWidth="3.25"
              strokeLinecap="round"
              strokeDasharray="56 220"
              transform="rotate(-90 50 50)"
            />
            <defs>
              <linearGradient id={gradientId} x1="12" y1="8" x2="88" y2="92">
                <stop stopColor="var(--primary)" />
                <stop offset="1" stopColor="var(--primary-glow)" />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute inset-[18%] overflow-hidden rounded-[1.35rem] shadow-md ring-1 ring-primary/25">
            <img
              src={appLogo}
              alt=""
              width={88}
              height={88}
              className="animate-wincare-loader-breathe size-full object-cover"
              draggable={false}
            />
          </span>
        </div>

        <div className="space-y-2.5">
          <p className="max-w-[16rem] text-sm font-medium tracking-tight text-foreground">{label}</p>
          <div className="flex items-center justify-center gap-1.5" aria-hidden>
            <span className="animate-wincare-loader-dot size-1.5 rounded-full bg-primary" />
            <span
              className="animate-wincare-loader-dot size-1.5 rounded-full bg-primary"
              style={{ animationDelay: "0.16s" }}
            />
            <span
              className="animate-wincare-loader-dot size-1.5 rounded-full bg-primary"
              style={{ animationDelay: "0.32s" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Overlay preso à viewport da área de conteúdo (fixed), não ao scroll da página.
 * Sem portal no body — no Electron isso prende o HUD.
 */
export function PageLoadingOverlay({
  visible,
  label = "Carregando…",
}: {
  visible: boolean;
  label?: string;
}) {
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!visible) return;

    const host = document.querySelector<HTMLElement>("[data-wincare-content]");
    if (!host) return;

    const update = () => {
      const rect = host.getBoundingClientRect();
      setBox({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [visible]);

  if (!visible || !box) return null;

  return (
    <div
      className="z-30 flex items-center justify-center bg-background/70 backdrop-blur-md"
      style={{
        position: "fixed",
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        pointerEvents: "auto",
      }}
    >
      <PageLoading compact label={label} />
    </div>
  );
}
