import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useDb } from "@/lib/useDb";

const WELCOME = {
  title: "Bem-vindo!",
  text: "Este painel mostra os carros que você analisou na OLX e diz se o preço está bom, normal ou caro comparado a anúncios parecidos.",
};

// Texto muda conforme a lista: vazia, o próximo passo é ir à OLX; com dados, é filtrar e comparar.
const STEPS_EMPTY = [
  WELCOME,
  {
    title: "Comece pela OLX",
    text: "Sua lista ainda está vazia. Abra uma busca de carros na OLX, clique no ícone da extensão e use \"Começar análise\".",
  },
  {
    title: "Volte aqui depois",
    text: "Os anúncios analisados aparecem sozinhos no Dashboard e na Listagem. Para a análise completa, configure uma IA em Configurações.",
  },
];

const STEPS_WITH_DATA = [
  WELCOME,
  {
    title: "Encontre carros",
    text: "Na Listagem, use a busca e os filtros (marca, ano, preço, km). O selo colorido diz se o preço está abaixo, dentro ou acima do esperado.",
  },
  {
    title: "Compare antes de decidir",
    text: "Clique em um anúncio para ver a análise completa, ou marque de 2 a 4 na Listagem e clique em \"Comparar\" para vê-los lado a lado.",
  },
];
const STEP_MS = 8000;

/** Tour de 3 telas. Avança sozinho a cada 8s, mas pausa com mouse/foco e sempre dá para pular. */
export function Onboarding({ onClose }: { onClose: (dontShowAgain: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [never, setNever] = useState(false);
  const { status } = useDb();
  const STEPS = status === "empty" ? STEPS_EMPTY : STEPS_WITH_DATA;
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
