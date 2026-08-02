import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

export interface BloquinSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface BloquinSelectProps {
  id?: string;
  value: string;
  options: BloquinSelectOption[];
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  leadingIcon?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function BloquinSelect({
  id,
  value,
  options,
  onChange,
  label,
  disabled = false,
  required = false,
  placeholder = 'Selecione…',
  leadingIcon,
  className = '',
  compact = false,
}: BloquinSelectProps) {
  const generatedId = useId().replace(/:/g, '');
  const listboxId = `bloquin-select-${generatedId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const firstEnabledIndex = options.findIndex((option) => !option.disabled);
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const enabledIndexes = useMemo(
    () => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0),
    [options],
  );

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', closeOnOutsidePress);
    return () => window.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
  }, [firstEnabledIndex, open, selectedIndex]);

  const moveHighlight = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const currentPosition = enabledIndexes.indexOf(highlightedIndex);
    const nextPosition = currentPosition < 0
      ? direction === 1 ? 0 : enabledIndexes.length - 1
      : (currentPosition + direction + enabledIndexes.length) % enabledIndexes.length;
    setHighlightedIndex(enabledIndexes[nextPosition]);
  };

  const selectIndex = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div ref={rootRef} className={`bloquin-select ${compact ? 'bloquin-select--compact' : ''} ${open ? 'is-open' : ''} ${className}`.trim()}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="bloquin-select-trigger"
        role="combobox"
        aria-label={label}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open && highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) setOpen(true);
            else moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
          } else if (event.key === 'Home' && open) {
            event.preventDefault();
            if (enabledIndexes.length > 0) setHighlightedIndex(enabledIndexes[0]);
          } else if (event.key === 'End' && open) {
            event.preventDefault();
            if (enabledIndexes.length > 0) setHighlightedIndex(enabledIndexes[enabledIndexes.length - 1]);
          } else if ((event.key === 'Enter' || event.key === ' ') && open) {
            event.preventDefault();
            selectIndex(highlightedIndex);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === 'Tab') {
            setOpen(false);
          } else if (event.key.length === 1 && event.key !== ' ') {
            const normalizedKey = event.key.toLocaleLowerCase('pt-BR');
            const matchIndex = options.findIndex((option) => (
              !option.disabled && option.label.toLocaleLowerCase('pt-BR').startsWith(normalizedKey)
            ));
            if (matchIndex >= 0) {
              event.preventDefault();
              setOpen(true);
              setHighlightedIndex(matchIndex);
            }
          }
        }}
      >
        {leadingIcon && <span className="bloquin-select-leading-icon" aria-hidden="true">{leadingIcon}</span>}
        <span className={`bloquin-select-value ${selectedOption ? '' : 'is-placeholder'}`.trim()}>{selectedOption?.label ?? placeholder}</span>
        <span className="bloquin-select-chevron" aria-hidden="true">
          <svg viewBox="0 0 12 8" focusable="false">
            <path d="m1 1.5 5 5 5-5" />
          </svg>
        </span>
      </button>

      {open && (
        <div id={listboxId} className="bloquin-select-menu" role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <div
              id={`${listboxId}-option-${index}`}
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              className={`bloquin-select-option ${index === highlightedIndex ? 'is-highlighted' : ''} ${option.value === value ? 'is-selected' : ''}`.trim()}
              onPointerMove={() => { if (!option.disabled) setHighlightedIndex(index); }}
              onClick={() => selectIndex(index)}
            >
              <span>{option.label}</span>
              {option.value === value && <span aria-hidden="true">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
