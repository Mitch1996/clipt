import { cn } from "@/lib/utils";

export interface LogoProps extends React.SVGAttributes<SVGSVGElement> {
  /** Animate the purple dot with `pulse-dot` (respects prefers-reduced-motion). */
  pulse?: boolean;
}

/**
 * Clipt wordmark. The dot is a separate <circle id="dot"> so it can be
 * animated independently — see Tailwind's `animate-pulse-dot`.
 *
 * Color: the "Clipt" text inherits `currentColor` (use `text-primary` in
 * light, `text-foreground` on dark surfaces). The dot is brand-purple via
 * `fill-accent`, also overridable via className.
 */
export function Logo({ pulse = false, className, ...props }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 220 56"
      role="img"
      aria-label="Clipt"
      className={cn("h-8 w-auto text-primary dark:text-foreground", className)}
      {...props}
    >
      <text
        x="0"
        y="44"
        fontFamily="var(--font-sans), Inter, system-ui, sans-serif"
        fontWeight={800}
        fontSize={48}
        letterSpacing={-1.5}
        fill="currentColor"
      >
        Clipt
      </text>
      <circle
        id="dot"
        cx={125}
        cy={42}
        r={6}
        className={cn(
          "fill-accent",
          pulse && "motion-safe:animate-pulse-dot origin-center",
        )}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </svg>
  );
}
