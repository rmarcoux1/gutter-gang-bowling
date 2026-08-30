export default function BowlingLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="bowling-loader" role="status" aria-label={label}>
      <svg viewBox="0 0 60 24" width="60" height="24">
        <ellipse cx="30" cy="20" rx="16" ry="2.4" fill="rgba(0,0,0,0.4)" />
        <circle cx="12" cy="12" r="9" fill="url(#loaderBall)" className="bowling-loader-ball" filter="url(#loaderGlow)">
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 36 0; 0 0"
            dur="1.1s"
            repeatCount="indefinite"
          />
        </circle>
        <defs>
          <radialGradient id="loaderBall" cx="32%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#a5f3fc" />
            <stop offset="35%" stopColor="#22d3ee" />
            <stop offset="75%" stopColor="#0e7490" />
            <stop offset="100%" stopColor="#052e3b" />
          </radialGradient>
          <filter id="loaderGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
      <span className="muted">{label}</span>
    </div>
  );
}
