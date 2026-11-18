import { Toaster as Sonner } from "sonner";

import { useStore } from "@/lib/wincare/store";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  // Segue o tema do app (sem isto o Sonner usa o claro mesmo no tema escuro).
  const theme = useStore((s) => s.theme);
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      // Cores do Sonner = superfície "popover" do design system (nos dois temas).
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary-solid group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
