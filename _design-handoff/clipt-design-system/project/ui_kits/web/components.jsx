/* Reusable Clipt React components (UMD-style globals) for the UI kit demo. */

const cx = (...c) => c.filter(Boolean).join(' ');

// ------------------------------ Logo --------------------------------
function Logo({ size = 32, animated = true, className }) {
  // SVG inlined so the dot can pulse via CSS animation on the <circle>.
  return (
    <svg viewBox="0 0 220 56" className={className} style={{ height: size, width: 'auto' }} aria-label="Clipt">
      <text x="0" y="44" fontFamily="Inter, system-ui, sans-serif" fontWeight="800"
            fontSize="48" letterSpacing="-1.5"
            fill="currentColor">Clipt</text>
      <circle cx="125" cy="42" r="6" fill="hsl(var(--accent))"
              className={animated ? 'pulse-dot' : ''}
              style={{ transformOrigin: '125px 42px' }} />
    </svg>
  );
}

// ------------------------------ Button ------------------------------
function Button({ variant = 'default', size = 'default', children, className, ...rest }) {
  const v = {
    default:     'bg-accent text-accent-foreground hover:opacity-90',
    secondary:   'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    ghost:       'hover:bg-muted',
    outline:     'border border-border bg-background hover:bg-muted',
    destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
    link:        'text-accent underline-offset-4 hover:underline',
  }[variant];
  const s = {
    default: 'h-10 px-4 text-sm rounded-[calc(var(--radius)-2px)]',
    sm:      'h-8 px-3 text-[13px] rounded-[calc(var(--radius)-4px)]',
    lg:      'h-12 px-6 text-[15px] rounded-[var(--radius)]',
    icon:    'h-10 w-10 p-0 rounded-[calc(var(--radius)-2px)]',
  }[size];
  return (
    <button {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-medium leading-none transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        v, s, className,
      )}>
      {children}
    </button>
  );
}

// ------------------------------ Badge -------------------------------
function Badge({ variant = 'default', children, className }) {
  const v = {
    default:     'bg-primary text-primary-foreground',
    secondary:   'bg-secondary text-secondary-foreground',
    outline:     'border border-border text-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    mint:        'bg-mint/15 text-mint border border-mint/30',
    purple:      'bg-accent/15 text-accent border border-accent/40',
  }[variant];
  return (
    <span className={cx('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold leading-none h-6', v, className)}>
      {children}
    </span>
  );
}

// ------------------- Verified-attribution badge ---------------------
function AttributionBadge({ live = false, label = 'Verified attribution' }) {
  return (
    <span className={cx(
      'inline-flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full',
      'bg-accent/15 border border-accent/45 text-foreground font-semibold text-[13px] leading-none',
      live && 'pulse-attribution',
    )}>
      <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-accent text-white">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
      </span>
      {label}
    </span>
  );
}

// ------------------------- Theme toggle -----------------------------
function ThemeToggle({ value, onChange }) {
  const opts = [
    { id: 'light',  label: 'Light',  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg> },
    { id: 'dark',   label: 'Dark',   icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg> },
    { id: 'system', label: 'System', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full border border-border bg-secondary">
      {opts.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)} aria-label={o.label}
          className={cx(
            'w-9 h-7 rounded-full inline-flex items-center justify-center transition-all',
            value === o.id ? 'bg-background text-accent shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}>
          {o.icon}
        </button>
      ))}
    </div>
  );
}

// --------------------------- Stat strip -----------------------------
function StatStrip({ stats }) {
  return (
    <div className="grid grid-cols-3 rounded-2xl overflow-hidden bg-card/40 backdrop-blur-md border border-mint/20">
      {stats.map((s, i) => (
        <div key={i} className={cx(
          'p-5 flex flex-col gap-1',
          i > 0 && 'border-l border-mint/15',
        )}>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{s.label}</div>
          <div className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            {s.value}<span className="text-mint">{s.unit}</span>
          </div>
          {s.note && <div className="text-xs text-muted-foreground">{s.note}</div>}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { cx, Logo, Button, Badge, AttributionBadge, ThemeToggle, StatStrip });
