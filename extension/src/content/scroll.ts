function reportScroll(text: string): void {
  chrome.runtime.sendMessage({ type: "scrollProgress", text }).catch(() => {
    /* popup fechado */
  });
}

let stopRequested = false;

export function stopScroll(): void {
  stopRequested = true;
}

export function scrollAutomatic(duration: number): Promise<number> {
  return new Promise<number>((resolve) => {
    stopRequested = false;
    const startY = window.scrollY;
    const maxY = (): number =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const start = performance.now();
    let lastBucket = -1;

    const step = (now: number): void => {
      if (stopRequested) {
        reportScroll("Rolagem cancelada");
        resolve(Math.round(window.scrollY));
        return;
      }
      const t = Math.min((now - start) / duration, 1);
      const target = maxY();
      window.scrollTo({ top: startY + (target - startY) * t, behavior: "auto" });

      const pct = Math.round(t * 100);
      const bucket = Math.floor(pct / 10);
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        reportScroll(`Scroll: ${pct}% concluído`);
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        reportScroll("✅ Scroll concluído");
        resolve(Math.round(window.scrollY));
      }
    };

    requestAnimationFrame(step);
  });
}
