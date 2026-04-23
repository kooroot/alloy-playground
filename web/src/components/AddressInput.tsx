interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function AddressInput({ value, onChange, placeholder }: Props) {
  return (
    <label className="addr-input">
      <span>address to inspect</span>
      <input
        type="text"
        spellCheck={false}
        autoCorrect="off"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
      />
    </label>
  );
}
