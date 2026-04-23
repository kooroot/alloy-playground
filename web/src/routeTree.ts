/**
 * Route tree. Code-based for now — migrate to `@tanstack/router-plugin/vite`
 * if the app passes ~5 routes.
 */
import { createRootRouteWithContext, createRoute } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { RootLayout } from "./routes/__root";
import { LandingPage } from "./routes/index";
import { TransferPage } from "./routes/transfer";
import { Erc20Page } from "./routes/erc20";
import { EventsPage } from "./routes/events";
import { WalletPage } from "./routes/wallet";

export interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

const transferRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transfer",
  component: TransferPage,
});

const erc20Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/erc20",
  component: Erc20Page,
});

const eventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/events",
  component: EventsPage,
});

const walletRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/wallet",
  component: WalletPage,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  transferRoute,
  erc20Route,
  eventsRoute,
  walletRoute,
]);
