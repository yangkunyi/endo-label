import { useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { Input } from "./input";

export function Combobox({
  names,
  ariaLabel,
  placeholder = "Type to add",
  onCommit,
  disabled = false,
}: {
  names: string[];
  ariaLabel: string;
  placeholder?: string;
  onCommit: (name: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) {
      return names;
    }
    return names.filter((name) => name.toLowerCase().includes(q));
  }, [names, text]);

  async function commit(raw: string) {
    const name = raw.trim();
    if (!name || disabled) {
      return;
    }
    setText("");
    setOpen(false);
    await onCommit(name);
  }

  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit(text);
          }
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && !disabled ? (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow",
          )}
        >
          {filtered.length === 0 ? (
            <li className="px-2 py-1 text-muted-foreground">{text.trim() ? `Add “${text.trim()}”` : "Type to add"}</li>
          ) : (
            filtered.map((name) => (
              <li key={name} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="w-full px-2 py-1 text-left hover:bg-accent"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void commit(name)}
                >
                  {name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
