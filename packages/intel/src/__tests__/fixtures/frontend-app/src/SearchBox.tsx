// @ts-nocheck
interface SearchBoxProps {
  value: string;
  onChange: (v: string) => void;
}

export default function SearchBox({ value, onChange }: SearchBoxProps) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} />;
}
