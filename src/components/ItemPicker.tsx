import { useId, useMemo, useRef, useState } from 'react';
import type { Category, Item } from '../api';
import { CATEGORY_LABELS } from '../format';
import './ItemPicker.css';

interface ItemPickerProps {
  items: Item[];
  value: string;
  onChange: (itemId: string) => void;
  categories?: Category[];
  placeholder?: string;
  id?: string;
}

/** Searchable product picker: every typed word must appear ("2.5 3 core"). */
function ItemPicker({ items, value, onChange, categories, placeholder, id }: ItemPickerProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = items.find((i) => i.item_id === value);

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return items
      .filter((i) => i.active && (!categories || categories.includes(i.category)))
      .filter((i) => {
        const hay = `${i.name} ${i.code ?? ''}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 60);
  }, [items, query, categories]);

  const choose = (item: Item) => {
    onChange(item.item_id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="item-picker">
      <input
        id={id}
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        placeholder={selected ? selected.name : (placeholder ?? 'Search items…')}
        value={open ? query : (selected?.name ?? '')}
        onFocus={() => {
          setOpen(true);
          setCursor(0);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === 'Enter' && open && matches[cursor]) {
            e.preventDefault();
            choose(matches[cursor]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul className="item-picker-list" id={listId} role="listbox">
          {matches.length === 0 && <li className="item-picker-empty">No matching items</li>}
          {matches.map((item, i) => (
            <li
              key={item.item_id}
              role="option"
              aria-selected={item.item_id === value}
              className={i === cursor ? 'cursor' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(item);
              }}
            >
              <span>{item.name}</span>
              <span className="sub">
                {CATEGORY_LABELS[item.category]} · {item.base_unit}
                {item.code ? ` · ${item.code}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ItemPicker;
