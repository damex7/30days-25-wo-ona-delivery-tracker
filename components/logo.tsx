// The Wo Ọ̀nà mark: a road running to the horizon (ọ̀nà, "the road") with a
// blue dot on it: the parcel you're watching come towards you. Hand-drawn SVG.
export function LogoMark({ className = "size-8", inverted = false }: { className?: string; inverted?: boolean }) {
  const ground = inverted ? "#FFFFFF" : "currentColor";
  const road = inverted ? "#0B0B0C" : "var(--canvas, #fff)";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="30" height="30" rx="8" fill={ground} />
      {/* the road narrowing towards the horizon */}
      <path d="M8 29 L14.4 9 h3.2 L24 29 Z" fill={road} />
      {/* the dashed centre line */}
      <path d="M16 27.5v-3.2M16 21.6v-2.6M16 16.6v-2" stroke={ground} strokeWidth="1.6" strokeLinecap="round" />
      {/* the parcel on its way */}
      <circle cx="16" cy="7.2" r="3.4" fill="#1446C8" stroke={road} strokeWidth="1.4" />
    </svg>
  );
}

/** The name, with its tone marks. lang="yo" tells screen readers it's Yoruba. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span lang="yo" className={`display ${className}`}>
      Wo Ọ̀nà
    </span>
  );
}
