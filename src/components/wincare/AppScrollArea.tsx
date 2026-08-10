import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

type AppScrollAreaProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  /** Classe no viewport interno. */
  viewportClassName?: string;
  /** Ref do viewport — útil para auto-scroll (logs). */
  viewportRef?: React.Ref<HTMLDivElement>;
};

/**
 * Área de scroll do WinCare — trilho fino translúcido no tema do app.
 * Preferir este componente a `overflow-y-auto` nativo em listas longas.
 */
const AppScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  AppScrollAreaProps
>(({ className, children, viewportClassName, viewportRef, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    type="hover"
    className={cn("relative min-h-0 overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport
      ref={viewportRef}
      className={cn(
        "h-full w-full rounded-[inherit] outline-none [&>div]:!block [&>div]:!min-w-0",
        viewportClassName,
      )}
    >
      {children}
    </ScrollAreaPrimitive.Viewport>
    <AppScrollBar />
    <AppScrollBar orientation="horizontal" />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
AppScrollArea.displayName = "AppScrollArea";

const AppScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-[width,height,opacity,colors] duration-200",
      "data-[state=hidden]:pointer-events-none data-[state=hidden]:opacity-0",
      "data-[state=visible]:opacity-100",
      orientation === "vertical" &&
        "h-full w-1.5 border-l border-l-transparent p-px hover:w-2",
      orientation === "horizontal" &&
        "h-1.5 w-full flex-col border-t border-t-transparent p-px hover:h-2",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb
      className={cn(
        "relative flex-1 rounded-full",
        "bg-muted-foreground/30",
        "hover:bg-primary/50 active:bg-primary/60",
        "before:absolute before:left-1/2 before:top-1/2 before:size-full before:min-h-10 before:min-w-10 before:-translate-x-1/2 before:-translate-y-1/2",
      )}
    />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
AppScrollBar.displayName = "AppScrollBar";

export { AppScrollArea, AppScrollBar };
