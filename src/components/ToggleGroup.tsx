import { cn } from "@/lib/utils";

export interface ToggleOption<T extends string> {
  value: T;
  label: string;
  activeClassName?: string;
}

interface ToggleGroupProps<T extends string> {
  options: Array<ToggleOption<T>>;
  value: T;
  onChange: (value: T) => void;
}

export function ToggleGroup<T extends string>({ options, value, onChange }: ToggleGroupProps<T>) {
  return (
    <div className="flex gap-0 rounded bg-gray-900">
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            type="button"
            className={cn(
              "px-2 py-1 text-[11px] font-sans rounded-sm border-none cursor-pointer transition-all duration-150 bg-transparent",
              isActive
                ? "text-toggle-text-active bg-gray-800 font-medium"
                : "text-toggle-text font-normal hover:text-toggle-text-hover hover:bg-toggle-hover",
              isActive && option.activeClassName
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
