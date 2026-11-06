"use client";

import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";

export function ChoiceField({
  label,
  selectedId,
  options,
  open,
  onOpenChange,
  onSelect,
}: {
  label: string;
  selectedId: string;
  options: readonly { id: string; label: string; icon?: ReactNode }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === selectedId);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, onOpenChange]);

  return (
    <div className="move-choice" ref={rootRef}>
      <button
        type="button"
        className="move-choice-trigger"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span>
          <span className="move-choice-label">{label}</span>
          <strong>{selected?.label ?? selectedId}</strong>
        </span>
        <Image src="/figma/move-caret.svg" alt="" width={20} height={20} />
      </button>
      {open && (
        <div className="move-menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === selectedId}
              className={option.id === selectedId ? "is-selected" : undefined}
              onClick={() => {
                onSelect(option.id);
                onOpenChange(false);
              }}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
