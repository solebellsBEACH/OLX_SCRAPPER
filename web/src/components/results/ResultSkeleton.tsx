/** Silhuetas enquanto o DB carrega — a página nunca fica em branco. */
export function ResultSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="Carregando anúncios" className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-4 border border-border bg-surface p-4">
          <div className="hidden h-[48px] w-[80px] bg-bg sm:block" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3 w-1/3 bg-bg" />
            <div className="h-3 w-1/2 bg-bg" />
          </div>
          <div className="h-[24px] w-[80px] bg-bg" />
        </div>
      ))}
    </div>
  );
}
