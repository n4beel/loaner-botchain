"use client";

import { ButtonHTMLAttributes, CSSProperties, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantStyles: Record<Variant, CSSProperties> = {
  primary: {
    backgroundColor: "var(--accent)",
    color: "var(--accent-ink)",
    border: "1px solid var(--accent)",
  },
  secondary: {
    backgroundColor: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
  },
  danger: {
    backgroundColor: "rgba(158, 31, 43, 0.08)",
    color: "var(--danger)",
    border: "1px solid var(--danger)",
  },
  ghost: {
    backgroundColor: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-subtle)",
  },
};

const sizeStyles: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-xs",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled = false,
      children,
      className = "",
      style,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center gap-2",
          "font-serif tracking-normal rounded-xs font-semibold transition-all",
          "cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.99]",
          sizeStyles[size],
          className,
        ].join(" ")}
        style={{
          ...variantStyles[variant],
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <>
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
