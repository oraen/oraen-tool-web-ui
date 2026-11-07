const CHUNK_RELOAD_TIMESTAMP_KEY = "oraen:chunk-reload-timestamp";
const CHUNK_RELOAD_COOLDOWN = 30_000;

const isStaleChunkError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(message);
};

/**
 * A user may keep an old page open while a new build replaces its hashed
 * chunks. Reload once so the browser receives the new index and chunk map.
 */
export const loadRouteWithChunkRecovery = async <T>(loader: () => Promise<T>): Promise<T> => {
  try {
    return await loader();
  } catch (error) {
    if (!isStaleChunkError(error) || window.location.protocol === "file:") throw error;

    const now = Date.now();
    let lastReload = 0;
    try {
      lastReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_TIMESTAMP_KEY)) || 0;
    } catch {
      // Storage may be unavailable in privacy-restricted browsers.
    }

    if (now - lastReload > CHUNK_RELOAD_COOLDOWN) {
      try {
        window.sessionStorage.setItem(CHUNK_RELOAD_TIMESTAMP_KEY, String(now));
      } catch {
        // The reload can still recover even when session storage is unavailable.
      }
      window.location.reload();
      return new Promise<T>(() => undefined);
    }

    throw error;
  }
};
