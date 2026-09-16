function reportScroll(text: string): void {
  chrome.runtime.sendMessage({ type: "scrollProgress", text }).catch(() => {
    /* popup fechado */
  });
}

export function scrollAutomatic(duration: number): Promise<number> {
  return new Promise<number>((resolve) => {
    const startY = window.scrollY;
    const maxY = (): number =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const start = performance.now();
    let lastBucket = -1;

    const step = (now: number): void => {
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
