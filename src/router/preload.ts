import routes from "./auto";

const routeLoaders = new Map<string, () => Promise<unknown>>(
  routes.map((route) => [route[MENU_PATH], route.components]),
);
const pendingLoads = new Map<string, Promise<unknown>>();

export const preloadRoute = (path: string) => {
  const routePath = path.split(/[?#]/, 1)[0];
  const loader = routeLoaders.get(routePath);
  if (!loader || pendingLoads.has(routePath)) return;

  const pending = loader().catch(() => {
    pendingLoads.delete(routePath);
  });
  pendingLoads.set(routePath, pending);
};
