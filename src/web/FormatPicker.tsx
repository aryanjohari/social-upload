import type { PostFormat } from "./api";
import { FORMAT_LABELS } from "./labels";

type Props = {
  formats: readonly PostFormat[];
  value: PostFormat;
  onChange: (format: PostFormat) => void;
};

export function FormatPicker({ formats, value, onChange }: Props) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Post type">
      {formats.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          className={value === option ? "primary" : "ghost"}
          onClick={() => onChange(option)}
        >
          {FORMAT_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
