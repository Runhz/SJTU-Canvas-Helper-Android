import { useId, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Modal } from './Modal';
export function ChoicePicker({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const id = useId();
  return <><button type="button" className="choice-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onClick={() => { setQuery(''); setOpen(true); }}><span>{options.find(option => option.value === value)?.label || value || '请选择'}</span><ChevronDown size={15}/></button>
    {open && <Modal title={label} onClose={() => setOpen(false)}><div className="choice-sheet" id={id}>
      {options.length > 6 && <label className="search-field"><Search size={16}/><input aria-label={`搜索${label}`} placeholder="搜索" value={query} onChange={e => setQuery(e.target.value)}/></label>}
      <div className="choice-options">{options.filter(option => option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(option => <button key={option.value} type="button" aria-pressed={value === option.value} className={value === option.value ? 'selected' : ''} onClick={() => { onChange(option.value); setOpen(false); }}><span>{option.label}</span>{value === option.value ? <Check size={18}/> : <i/>}</button>)}</div>
    </div></Modal>}
  </>;
}
