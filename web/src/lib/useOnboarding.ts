import { useCallback, useState } from "react";

const KEY = "olx.onboarding.dismissed";
const SESSION_KEY = "olx.onboarding.skipped";

function read(store: () => Storage, key: string): boolean {
  try {
    return store().getItem(key) === "1";
  } catch {
    return false;
  }
}

function write(store: () => Storage, key: string) {
  try {
    store().setItem(key, "1");
  } catch {
    /* storage bloqueado: só não lembra a preferência */
  }
}

/** Abre sozinho na primeira visita; `start()` reabre a partir do menu de ajuda. */
export function useOnboarding() {
  const [open, setOpen] = useState(
    () => !read(() => localStorage, KEY) && !read(() => sessionStorage, SESSION_KEY),
  );

  const start = useCallback(() => setOpen(true), []);
  const close = useCallback((dontShowAgain: boolean) => {
    write(() => sessionStorage, SESSION_KEY);
    if (dontShowAgain) write(() => localStorage, KEY);
    setOpen(false);
  }, []);

  return { open, start, close };
}
