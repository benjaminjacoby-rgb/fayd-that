import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function Pill({ active, className = "", ...rest }: Props) {
  return (
    <button
      type="button"
      className={`px-3 py-1.5 rounded-pill text-xs font-medium transition ${
        active ? "bg-yes text-bg" : "bg-bg3 text-text2 hover:bg-bg4"
      } ${className}`}
      {...rest}
    />
  );
}
