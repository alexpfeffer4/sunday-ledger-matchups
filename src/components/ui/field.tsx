import { useId, type InputHTMLAttributes } from "react";

export function Field({
  className = "",
  error,
  hint,
  label,
  tone = "default",
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  hint?: string;
  label: string;
  tone?: "default" | "destructive";
}) {
  const generatedId = useId();
  const id = inputProps.id ?? generatedId;
  const helpId = hint || error ? `${id}-help` : undefined;

  return (
    <label className="mt-4 block text-sm font-semibold" htmlFor={id}>
      {label}
      <input
        aria-describedby={helpId}
        aria-invalid={error ? true : undefined}
        className={`bg-surface mt-2 min-h-11 w-full rounded-lg border px-3 text-base outline-none ${
          tone === "destructive"
            ? "border-negative/40 focus:border-negative"
            : "border-control focus:border-registry"
        } ${className}`}
        id={id}
        {...inputProps}
      />
      {hint || error ? (
        <span
          className={`mt-2 block text-xs leading-5 ${error ? "text-negative" : "text-muted"}`}
          id={helpId}
        >
          {error ?? hint}
        </span>
      ) : null}
    </label>
  );
}
