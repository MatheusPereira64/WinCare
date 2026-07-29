import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createHashHistory, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { routeTree } from "@/routeTree.gen";
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
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
