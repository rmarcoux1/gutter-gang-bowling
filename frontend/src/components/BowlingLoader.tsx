export default function BowlingLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="bowling-loader" role="status" aria-label={label}>
      <svg viewBox="0 0 60 24" width="60" height="24">
        <ellipse cx="30" cy="20" rx="16" ry="2.4" fill="rgba(11,18,32,0.12)" />
        <circle cx="12" cy="12" r="9" fill="url(#loaderBall)" className="bowling-loader-ball">
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 36 0; 0 0"
            dur="1.1s"
            repeatCount="indefinite"
          />
        </circle>
        <defs>
          <radialGradient id="loaderBall" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#3987e5" />
            <stop offset="100%" stopColor="#12356e" />
          </radialGradient>
        </defs>
      </svg>
      <span className="muted">{label}</span>
    </div>
  );
}
