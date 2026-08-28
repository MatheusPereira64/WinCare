import { useState } from "react";
import { AppWindow } from "lucide-react";

interface Props {
  src?: string;
  name: string;
  size?: number;
}

/** Ícone extraído do executável; fallback genérico se faltar arquivo. */
export function StartupAppIcon({ src, name, size = 24 }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        style={{ width: size, height: size }}
        title={name}
        aria-hidden
      >
        <AppWindow style={{ width: size * 0.58, height: size * 0.58 }} />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-md object-contain"
      style={{ width: size, height: size }}
      title={name}
      onError={() => setFailed(true)}
    />
  );
}
