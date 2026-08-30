import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClassName, type ButtonIntent } from "@/components/ui/button";

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
  const intent: Record<
    NonNullable<ButtonLinkProps["variant"]>,
    ButtonIntent
  > = {
    primary: "primary",
    secondary: "secondary",
    tertiary: "quiet",
  };

  return (
    <Link
      className={buttonClassName({ className, intent: intent[variant] })}
      href={href}
    >
      {children}
    </Link>
  );
}
