import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // Desligado: trilho com contorno e botão visíveis (>= 3:1); ligado: azul sólido com botão branco.
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 shadow-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary-solid data-[state=checked]:bg-primary-solid data-[state=unchecked]:border-input data-[state=unchecked]:bg-muted forced-colors:border-[ButtonText]",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block size-3 rounded-full shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-[1.125rem] data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-muted-foreground",
        // Temas de contraste do Windows: o botão precisa de cor de sistema para não sumir.
        "forced-colors:forced-color-adjust-none forced-colors:bg-[ButtonText] forced-colors:data-[state=checked]:bg-[Highlight]",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
