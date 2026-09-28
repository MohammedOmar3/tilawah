// Line icons drawn at 24 × 24 with the current text colour.
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export const MoonIcon = ({ className = "size-[18px]" }) => (
  <svg {...base} className={className}>
    <path d="M12 3a6.5 6.5 0 1 0 9 9 8 8 0 1 1-9-9z" />
  </svg>
);

export const SunIcon = ({ className = "size-[18px]" }) => (
  <svg {...base} className={className}>
    <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
  </svg>
);

export const SlidersIcon = ({ className = "size-[18px]" }) => (
  <svg {...base} className={className}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);

export const TranslateIcon = ({ className = "size-4" }) => (
  <svg {...base} className={className}>
    <path d="M4 6h9M8.5 4v2c0 4-2 7-4.5 8M6 10c1.5 2 3.5 3.5 6 4.5M13 20l4-9 4 9M14.5 17h5" />
  </svg>
);

export const InfoIcon = ({ className = "size-4" }) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

/** The brand mark: a crescent in a thin ring. */
export const Mark = () => (
  <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
    <circle cx="16" cy="16" r="15" fill="none" stroke="var(--gold)" strokeOpacity=".45" />
    <path d="M20.5 8.2a8.6 8.6 0 1 0 0 15.6 7 7 0 1 1 0-15.6z" fill="var(--gold)" />
  </svg>
);
