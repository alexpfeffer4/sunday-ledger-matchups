import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonIntent = "primary" | "secondary" | "quiet" | "destructive";

const intents: Record<ButtonIntent, string> = {
  primary:
    "border-registry bg-registry text-white hover:border-registry-hover hover:bg-registry-hover",
  secondary:
    "border-control bg-surface text-ink hover:border-registry hover:text-registry",
  quiet:
    "border-transparent bg-transparent text-action hover:bg-subtle hover:text-ink",
  destructive:
    "border-negative bg-negative text-white hover:border-negative hover:brightness-90",
};

export function buttonClassName({
  block = false,
  className = "",
  intent = "primary",
}: {
  block?: boolean;
  className?: string;
  intent?: ButtonIntent;
} = {}): string {
  return `inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${intents[intent]} ${block ? "w-full" : ""} ${className}`;
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { intent?: ButtonIntent }
>(function Button({ className = "", intent = "primary", ...props }, ref) {
  return (
    <button
      className={buttonClassName({ className, intent })}
      ref={ref}
      {...props}
    />
  );
});
