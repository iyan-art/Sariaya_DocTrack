import { useId, useRef, useState } from 'react';
import { loadAddressIndex, suggestAddresses } from '../../utils/addressSuggestions';

/**
 * A text box (or textarea, with `multiline`) for an address or place that
 * suggests barangays, cities/municipalities and provinces from the PSGC as
 * the user types, Sariaya's first. Picking one fills it in after whatever
 * house number and street were already typed; the user can also ignore the
 * list and type freely. Arrow keys move through the list, Enter picks,
 * Escape closes it.
 *
 * The place list loads on first focus, so forms without an address field
 * never download it.
 */
export default function AddressAutocomplete({
  value,
  onChange,
  multiline = false,
  className = '',
  ...inputProps
}) {
  const [entries, setEntries] = useState(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const fieldRef = useRef(null);

  const suggestions = open && entries ? suggestAddresses(entries, value || '') : [];
  const showList = suggestions.length > 0;

  const ensureLoaded = () => {
    if (entries) return;
    loadAddressIndex().then(setEntries).catch(() => {
      // No suggestions (e.g. offline before the list was ever cached); the
      // field still works as a plain text box.
    });
  };

  const pick = (suggestion) => {
    onChange(suggestion.value);
    setOpen(false);
    fieldRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (!showList) {
      if (event.key === 'ArrowDown' && entries) setOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault(); // pick the suggestion, don't submit the form
      pick(suggestions[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  const Field = multiline ? 'textarea' : 'input';

  return (
    <div className="relative w-full">
      <Field
        ref={fieldRef}
        {...(multiline ? { rows: 2 } : { type: 'text' })}
        {...inputProps}
        value={value || ''}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => { ensureLoaded(); setOpen(true); }}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        className={className}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-30 max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
        >
          {suggestions.map((suggestion, i) => (
            <li
              key={suggestion.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: picking must happen before the field's blur closes the list.
              onMouseDown={(event) => { event.preventDefault(); pick(suggestion); }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 text-sm cursor-pointer flex items-baseline gap-2 ${
                i === active
                  ? 'bg-blue-50 dark:bg-slate-700 text-blue-800 dark:text-blue-200'
                  : 'text-slate-800 dark:text-slate-100'
              }`}
            >
              <span className="flex-1 min-w-0">{suggestion.label}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {suggestion.kind === 'barangay' ? 'Barangay' : suggestion.kind === 'place' ? 'City/Mun.' : 'Province'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
