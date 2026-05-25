import { useState } from 'react';

type KbTab = '123' | 'f(x)' | 'ABC';

const KB_KEYS: Record<KbTab, { label: string; insert: string }[][]> = {
  '123': [
    [
      { label: 'x',   insert: 'x' },
      { label: 'y',   insert: 'y' },
      { label: 'z',   insert: 'z' },
      { label: 't',   insert: 't' },
      { label: 'π',   insert: 'pi' },
      { label: '7',   insert: '7' },
      { label: '8',   insert: '8' },
      { label: '9',   insert: '9' },
      { label: '×',   insert: '*' },
      { label: '÷',   insert: '/' },
    ],
    [
      { label: 'x²',  insert: '^2' },
      { label: 'xⁿ',  insert: '^' },
      { label: '√',   insert: 'sqrt(' },
      { label: 'e',   insert: 'e' },
      { label: '4',   insert: '4' },
      { label: '5',   insert: '5' },
      { label: '6',   insert: '6' },
      { label: '+',   insert: '+' },
      { label: '−',   insert: '-' },
    ],
    [
      { label: '<',   insert: '<' },
      { label: '>',   insert: '>' },
      { label: '|x|', insert: 'abs(' },
      { label: '±',   insert: '+-' },
      { label: '1',   insert: '1' },
      { label: '2',   insert: '2' },
      { label: '3',   insert: '3' },
      { label: '=',   insert: '=' },
      { label: '⌫',   insert: '__DEL__' },
    ],
    [
      { label: '(',   insert: '(' },
      { label: ')',   insert: ')' },
      { label: ',',   insert: ',' },
      { label: '0',   insert: '0' },
      { label: '.',   insert: '.' },
      { label: '↵',   insert: '__ENTER__' },
    ],
  ],
  'f(x)': [
    [
      { label: 'sin',   insert: 'sin(' },
      { label: 'cos',   insert: 'cos(' },
      { label: 'tan',   insert: 'tan(' },
      { label: 'ln',    insert: 'log(' },
      { label: 'log',   insert: 'log10(' },
    ],
    [
      { label: 'asin',  insert: 'asin(' },
      { label: 'acos',  insert: 'acos(' },
      { label: 'atan',  insert: 'atan(' },
      { label: 'atan2', insert: 'atan2(' },
      { label: 'exp',   insert: 'exp(' },
    ],
    [
      { label: 'sqrt',  insert: 'sqrt(' },
      { label: 'cbrt',  insert: 'cbrt(' },
      { label: 'abs',   insert: 'abs(' },
      { label: 'ceil',  insert: 'ceil(' },
      { label: 'floor', insert: 'floor(' },
    ],
    [
      { label: 'mod',   insert: '%' },
      { label: 'max',   insert: 'max(' },
      { label: 'min',   insert: 'min(' },
      { label: 'round', insert: 'round(' },
      { label: 'sign',  insert: 'sign(' },
    ],
  ],
  'ABC': [
    [...'abcdefghij'.split('').map(c => ({ label: c, insert: c }))],
    [...'klmnopqrst'.split('').map(c => ({ label: c, insert: c }))],
    [...'uvwxyz'.split('').map(c => ({ label: c, insert: c }))],
  ],
};

interface MathKeyboardProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
}

export function MathKeyboard({ inputRef, value, onChange, onEnter }: MathKeyboardProps) {
  const [tab, setTab] = useState<KbTab>('123');

  const insert = (token: string) => {
    const el = inputRef.current;
    if (!el) return;

    if (token === '__DEL__') {
      const start = el.selectionStart ?? value.length;
      const end   = el.selectionEnd   ?? value.length;
      if (start !== end) {
        onChange(value.slice(0, start) + value.slice(end));
        setTimeout(() => el.setSelectionRange(start, start), 0);
      } else if (start > 0) {
        onChange(value.slice(0, start - 1) + value.slice(start));
        setTimeout(() => el.setSelectionRange(start - 1, start - 1), 0);
      }
      return;
    }
    if (token === '__ENTER__') { onEnter?.(); return; }

    const start = el.selectionStart ?? value.length;
    const end   = el.selectionEnd   ?? value.length;
    const newVal = value.slice(0, start) + token + value.slice(end);
    onChange(newVal);
    const cursor = start + token.length;
    setTimeout(() => { el.focus(); el.setSelectionRange(cursor, cursor); }, 0);
  };

  const tabs: KbTab[] = ['123', 'f(x)', 'ABC'];

  return (
    <div style={{
      background: '#f1f5f9',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '10px 8px 8px',
      marginTop: '6px',
      userSelect: 'none',
    }}>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '4px 12px',
            borderRadius: '20px',
            border: 'none',
            background: tab === t ? '#7c3aed' : '#e2e8f0',
            color: tab === t ? '#fff' : '#475569',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}>{t}</button>
        ))}
      </div>

      {KB_KEYS[tab].map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
          {row.map((key, ki) => (
            <button
              key={ki}
              onMouseDown={(e) => { e.preventDefault(); insert(key.insert); }}
              style={{
                flex: key.label === '↵' ? '2 1 auto' : '1 1 auto',
                minWidth: '28px',
                padding: '7px 3px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: key.label === '⌫' || key.label === '↵' ? '#dde3ea' : 'white',
                color: '#1e293b',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                transition: 'background 0.1s',
              }}
            >
              {key.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
