import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createHashHistory, createRouter } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import { PageLoading } from "@/components/wincare/PageLoading";
import { routeTree } from "@/routeTree.gen";
import { hydrateStore } from "@/lib/wincare/store";
import "@/styles.css";

/**
 * Electron renderer entry: the desktop shell loads the app from file://,
 * so we run the router as a client-only SPA with hash history.
 */
const router = createRouter({
  routeTree,
  context: { queryClient: new QueryClient() },
  history: createHashHistory(),
  defaultPreloadStaleTime: 0,
  scrollRestoration: false,
  defaultPendingComponent: () => <PageLoading label="Carregando…" />,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

hydrateStore();

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
