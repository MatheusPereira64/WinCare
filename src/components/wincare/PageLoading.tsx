import { useId } from "react";

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
          <span className="absolute inset-3 rounded-full bg-primary/25 blur-2xl" aria-hidden />
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
          <p className="max-w-[16rem] text-sm font-medium tracking-tight text-foreground">
            {label}
          </p>
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
 * Cobre só o &lt;main&gt; (que não rola). O scroll fica no filho — assim o loader
 * permanece no centro da área visível. Sem portal e sem position:fixed.
 */
export function PageLoadingOverlay({
  visible,
  label = "Carregando…",
}: {
  visible: boolean;
  label?: string;
}) {
  if (!visible) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-background/70 backdrop-blur-md"
      style={{ pointerEvents: "none" }}
    >
      <PageLoading compact label={label} />
    </div>
  );
}
