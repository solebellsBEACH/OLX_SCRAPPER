import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

const STEPS = [
  { title: "Bem-vindo!", text: "Aqui você analisa anúncios de carros da OLX." },
  { title: "Filtre", text: "Use a busca e os filtros para encontrar oportunidades." },
  { title: "Compare", text: "Clique em um anúncio para ver detalhes e comparar." },
];
const STEP_MS = 5000;

/** Tour de 3 telas. Avança sozinho a cada 5s, mas pausa com mouse/foco e sempre dá para pular. */
export function Onboarding({ onClose }: { onClose: (dontShowAgain: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [never, setNever] = useState(false);
  const last = step === STEPS.length - 1;

  useEffect(() => {
    if (paused || last) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step, paused, last]);

  const s = STEPS[step];
  return (
    <Modal title={s.title} onClose={() => onClose(never)}>
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        className="flex flex-col gap-4"
      >
        <p aria-live="polite" className="text-[16px]">{s.text}</p>
        <div className="flex gap-1" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? "h-1 w-6 rounded-full bg-accent" : "h-1 w-3 rounded-full bg-border"} />
          ))}
        </div>
        {last && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} className="h-4 w-4" />
            Não mostrar novamente
          </label>
        )}
        <div className="flex justify-between gap-2">
          <Button variant="ghost" className="h-[44px]" onClick={() => onClose(never)}>
            {last ? "Fechar" : "Pular"}
          </Button>
          {!last && (
            <Button variant="default" className="h-[44px]" onClick={() => setStep(step + 1)}>
              Próximo
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
