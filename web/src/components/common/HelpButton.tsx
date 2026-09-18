import { useState } from "react";
import { HelpCircle, Route, Palette, Filter, MessageCircleQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { TONE_BADGE, TONE_LABEL, TONE_LEGEND } from "@/lib/colors";

type Topic = "cores" | "filtros" | "faq";

const FAQ = [
  ["De onde vêm os anúncios?", "Da extensão: colete e analise os anúncios no OLX e eles aparecem aqui."],
  ["Como o preço “esperado” é calculado?", "É a média de outros anúncios da mesma marca, modelo e ano. Com menos de 2 outros anúncios, o status fica “Sem dados”."],
  ["Posso comparar anúncios?", "Sim: marque de 2 a 4 anúncios na Listagem e clique em “Comparar”."],
] as const;

function Content({ topic }: { topic: Topic }) {
  if (topic === "cores")
    return (
      <ul className="flex flex-col gap-3">
        {TONE_LEGEND.map((l) => (
          <li key={l.tone} className="flex items-start gap-3">
            <Badge tone={TONE_BADGE[l.tone]} className="w-[96px] shrink-0 justify-center px-2 py-1">
              {TONE_LABEL[l.tone]}
            </Badge>
            <span className="text-sm">
              <strong className="font-semibold">{l.title}.</strong> {l.hint}
            </span>
          </li>
        ))}
      </ul>
    );
  if (topic === "filtros")
    return (
      <ol className="list-decimal space-y-2 pl-4 text-sm">
        <li>Digite na busca uma marca, modelo ou cidade (ex.: “Ford KA”).</li>
        <li>Refine por marca, ano, faixa de preço e km. A lista atualiza na hora.</li>
        <li>Os filtros ativos aparecem como etiquetas: clique no ✕ para remover um, ou em “Limpar tudo”.</li>
        <li>A contagem “anúncios encontrados” mostra quantos sobraram e quantos foram filtrados.</li>
      </ol>
    );
  return (
    <dl className="flex flex-col gap-3">
      {FAQ.map(([q, a]) => (
        <div key={q}>
          <dt className="text-sm font-semibold">{q}</dt>
          <dd className="text-sm text-muted">{a}</dd>
        </div>
      ))}
    </dl>
  );
}

const TITLES: Record<Topic, string> = { cores: "O que significam as cores?", filtros: "Como usar os filtros?", faq: "FAQ" };

export function HelpButton({ onTour }: { onTour: () => void }) {
  const [menu, setMenu] = useState(false);
  const [topic, setTopic] = useState<Topic | null>(null);

  const items: Array<{ label: string; icon: typeof Route; run: () => void }> = [
    { label: "Tour guiado", icon: Route, run: onTour },
    { label: "O que significam as cores?", icon: Palette, run: () => setTopic("cores") },
    { label: "Como usar os filtros?", icon: Filter, run: () => setTopic("filtros") },
    { label: "FAQ", icon: MessageCircleQuestion, run: () => setTopic("faq") },
  ];

  return (
    <>
      <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2">
        {menu && (
          <div role="menu" aria-label="Ajuda e suporte" className="w-[240px] animate-fade-in rounded-md border border-border bg-surface p-1 shadow-popover motion-reduce:animate-none">
            <p className="px-3 py-2 text-xs font-semibold text-muted">Ajuda &amp; Suporte</p>
            {items.map(({ label, icon: Icon, run }) => (
              <button
                key={label}
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenu(false);
                  run();
                }}
                className="flex h-[44px] w-full items-center gap-2 rounded-sm px-3 text-left text-sm hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Icon aria-hidden className="h-4 w-4 text-muted" />
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          aria-label="Ajuda"
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
          onKeyDown={(e) => e.key === "Escape" && setMenu(false)}
          className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-accent text-accent-fg shadow-card transition-shadow duration-DEFAULT hover:shadow-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>
      {topic && (
        <Modal title={TITLES[topic]} onClose={() => setTopic(null)}>
          <Content topic={topic} />
        </Modal>
      )}
    </>
  );
}
