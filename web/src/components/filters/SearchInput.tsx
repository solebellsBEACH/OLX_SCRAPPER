import { useId } from "react";
import { Search } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
}

/** Busca larga (44px, 16px de fonte) com sugestões nativas via <datalist>. */
export function SearchInput({ value, onChange, suggestions }: Props) {
  const listId = useId();
  return (
    <div className="w-full">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-[24px] w-[24px] -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={value}
          list={listId}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar por marca, modelo ou local…"
          aria-label="Buscar por marca, modelo ou local"
          className="h-[44px] w-full rounded-sm border border-border bg-surface pl-[48px] pr-3 text-[16px] text-fg placeholder:text-subtle focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-accent"
        />
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <p className="mt-1 text-xs text-subtle">Exemplo: “Ford KA”, “São Paulo”</p>
    </div>
  );
}
