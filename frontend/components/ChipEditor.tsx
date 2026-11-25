'use client';
import { useState } from 'react';
import { Plus, X } from 'lucide-react';

/** Editable list of short strings shown as chips (topics, skills). */
export default function ChipEditor({ value, onChange, placeholder, max = 30 }: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  max?: number;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const items = text.split(',').map((s) => s.trim()).filter(Boolean);
    const next = [...value];
    for (const it of items) if (!next.some((v) => v.toLowerCase() === it.toLowerCase())) next.push(it);
    onChange(next.slice(0, max));
    setText('');
  };
  return (
    <div className="stack-sm">
      <div className="chips">
        {value.map((v) => (
          <span key={v} className="chip">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}><X /></button>
          </span>
        ))}
        {value.length === 0 && <span className="muted small">None yet</span>}
      </div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          className="input"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button type="button" className="btn" onClick={add} disabled={!text.trim() || value.length >= max}><Plus /> Add</button>
      </div>
    </div>
  );
}
