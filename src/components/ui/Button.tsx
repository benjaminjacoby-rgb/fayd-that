import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "yes" | "no" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary:   "bg-yes text-bg hover:brightness-110 active:brightness-95",
  secondary: "bg-bg3 text-text hover:bg-bg4",
  yes:       "bg-yes/15 text-yes border border-yes/30 hover:bg-yes/25",
  no:        "bg-no/15 text-no border border-no/30 hover:bg-no/25",
  ghost:     "bg-transparent text-text2 hover:text-text hover:bg-bg3",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", full, className = "", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${VARIANT[variant]} rounded-input px-4 py-3 font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${full ? "w-full" : ""} ${className}`}
      {...rest}
    />
  );
});
