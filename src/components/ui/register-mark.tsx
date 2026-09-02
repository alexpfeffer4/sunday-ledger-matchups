import type { CSSProperties } from "react";
import { IDENTITY_VECTORS } from "@/design/identity/generated-vectors";

export type RegisterMaster = "micro" | "compact" | "standard";
export type BrandTone =
  "default" | "currentColor" | "reversed" | "monochrome" | "registry";

const registerVectors = {
  micro: IDENTITY_VECTORS.registerMicro,
  compact: IDENTITY_VECTORS.registerCompact,
  standard: IDENTITY_VECTORS.registerStandard,
} as const;

const registerRanges = {
  micro: "16–20px",
  compact: "24–32px",
  standard: "48px and above",
} as const;

const registerDefaultSizes = {
  micro: "h-[16px] w-[16px] min-h-[16px] min-w-[16px]",
  compact: "h-[28px] w-[28px] min-h-[24px] min-w-[24px]",
  standard: "h-[48px] w-[48px] min-h-[48px] min-w-[48px]",
} as const;

const toneClasses: Record<BrandTone, string> = {
  default: "text-ink",
  currentColor: "",
  reversed: "text-white",
  monochrome: "",
  registry: "text-registry",
};

const visuallyHiddenStyle: CSSProperties = {
  clip: "rect(0, 0, 0, 0)",
  clipPath: "inset(50%)",
  height: 1,
  overflow: "hidden",
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1,
};

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function RegisterMark({
  className,
  label,
  master,
  style,
}: {
  className?: string;
  label?: string;
  master: RegisterMaster;
  style?: CSSProperties;
}) {
  const vector = registerVectors[master];

  return (
    <svg
      {...(label
        ? { "aria-label": label, role: "img" }
        : { "aria-hidden": true })}
      className={classes(registerDefaultSizes[master], "shrink-0", className)}
      data-optical-master={master}
      data-optical-range={registerRanges[master]}
      dangerouslySetInnerHTML={{ __html: vector.inner }}
      fill="none"
      focusable="false"
      style={style}
      viewBox={vector.viewBox}
      xmlns="http://www.w3.org/2000/svg"
    />
  );
}

export function BrandWordmark({
  className = "w-[180px]",
  tone = "currentColor",
}: {
  className?: string;
  tone?: BrandTone;
}) {
  const vector = IDENTITY_VECTORS.wordmark;

  return (
    <span className={classes("inline-flex items-center", toneClasses[tone])}>
      <svg
        aria-hidden="true"
        className={classes("block h-auto", className)}
        dangerouslySetInnerHTML={{ __html: vector.inner }}
        focusable="false"
        viewBox={vector.viewBox}
        xmlns="http://www.w3.org/2000/svg"
      />
      <span className="sr-only" style={visuallyHiddenStyle}>
        Sunday Ledger
      </span>
    </span>
  );
}

type ProductLockupProps = {
  className?: string;
  style?: CSSProperties;
  tone?: BrandTone;
} & (
  | { variant: "horizontal" | "compact"; master?: never }
  | { variant: "mark-only"; master: RegisterMaster }
);

export function BrandLockup({
  className,
  master,
  style,
  tone = "default",
  variant,
}: ProductLockupProps) {
  if (variant === "mark-only") {
    return (
      <span
        className={classes("inline-flex p-[2px]", toneClasses[tone], className)}
        data-brand-clear-space="1X"
        data-brand-lockup="mark-only"
      >
        <RegisterMark master={master} />
        <span className="sr-only" style={visuallyHiddenStyle}>
          Sunday Ledger
        </span>
      </span>
    );
  }

  const vector = IDENTITY_VECTORS[variant];
  const sizeClass =
    variant === "horizontal"
      ? "w-[164px] min-w-[132px] max-w-full"
      : "w-[96px] min-w-[96px] max-w-full";
  const source =
    variant === "horizontal" && tone !== "default" && tone !== "currentColor"
      ? tone === "registry"
        ? "src/design/identity/lockups/one-color.svg"
        : `src/design/identity/lockups/${tone}.svg`
      : vector.source;

  return (
    <span
      className={classes(
        "inline-flex max-w-full items-center p-[4px]",
        toneClasses[tone],
      )}
      data-brand-clear-space={variant === "horizontal" ? "1.25X" : "1X"}
      data-brand-lockup={variant}
      data-brand-source={source}
    >
      <svg
        aria-hidden="true"
        className={classes("block h-auto shrink-0", sizeClass, className)}
        dangerouslySetInnerHTML={{ __html: vector.inner }}
        focusable="false"
        style={style}
        viewBox={vector.viewBox}
        xmlns="http://www.w3.org/2000/svg"
      />
      <span className="sr-only" style={visuallyHiddenStyle}>
        Sunday Ledger
      </span>
    </span>
  );
}
