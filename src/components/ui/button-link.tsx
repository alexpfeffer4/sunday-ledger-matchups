import Link from "next/link";
import type { ReactNode } from "react";

type ButtonLinkProps = {
  children: ReactNode;
  href: string;
  variant?: "primary" | "secondary" | "tertiary";
  className?: string;
};

export function ButtonLink({
  children,
  href,
  variant = "primary",
  className = "",
}: ButtonLinkProps) {
  const variants = {
    primary:
      "border-registry bg-registry text-white hover:border-registry-hover hover:bg-registry-hover",
    secondary: "border-registry bg-transparent text-registry hover:bg-subtle",
    tertiary: "border-transparent bg-transparent text-action hover:bg-subtle",
  };

  return (
    <Link
      className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors ${variants[variant]} ${className}`}
      href={href}
    >
      {children}
    </Link>
  );
}
