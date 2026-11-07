import { useCallback, useEffect, useRef } from "react";
export default function useUrls() {
  const urls = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current.clear();
    };
  }, []);
  const make = useCallback((blob: Blob) => {
    if (!alive.current) return "";
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  }, []);
  const revoke = useCallback((url?: string) => {
    if (url) {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
    }
  }, []);
  return { make, revoke };
}
