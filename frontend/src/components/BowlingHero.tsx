// A hand-built SVG bowling lane illustration used as a themed page banner —
// no external images, so nothing to fetch, license, or go missing at deploy time.

interface BowlingHeroProps {
  title: string;
  subtitle?: string;
  compact?: boolean;
}

const PIN_ROWS: { x: number; y: number; fallen?: boolean }[] = [
  { x: 200, y: 30 },
  { x: 178, y: 46 },
  { x: 222, y: 46 },
  { x: 156, y: 62 },
  { x: 200, y: 62, fallen: true },
  { x: 244, y: 62 },
  { x: 134, y: 78 },
  { x: 178, y: 78 },
  { x: 222, y: 78 },
  { x: 266, y: 78 },
];

function Pin({ x, y, fallen }: { x: number; y: number; fallen?: boolean }) {
  return (
    <g transform={fallen ? `translate(${x} ${y}) rotate(72)` : `translate(${x} ${y})`}>
      <ellipse cx={0} cy={17} rx={7.5} ry={2.4} fill="rgba(11,18,32,0.35)" />
      <path
        d="M0,-16 C4.5,-16 5.5,-11 4,-7 C7,-2 7,7 4.5,13 C3.5,16.5 -3.5,16.5 -4.5,13 C-7,7 -7,-2 -4,-7 C-5.5,-11 -4.5,-16 0,-16 Z"
        fill="url(#pinBody)"
        stroke="rgba(11,18,32,0.15)"
        strokeWidth={0.5}
      />
      <rect x={-4.6} y={-2} width={9.2} height={2.6} fill="#eb6834" />
    </g>
  );
}

export default function BowlingHero({ title, subtitle, compact = false }: BowlingHeroProps) {
  const height = compact ? 130 : 230;

  return (
    <div className={`bowling-hero${compact ? " compact" : ""}`}>
      <svg viewBox={`0 0 400 ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="laneSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1220" />
            <stop offset="55%" stopColor="#131c30" />
            <stop offset="100%" stopColor="#1d2b4a" />
          </linearGradient>
          <radialGradient id="spotlight" cx="50%" cy="15%" r="65%">
            <stop offset="0%" stopColor="rgba(249,178,110,0.35)" />
            <stop offset="45%" stopColor="rgba(249,178,110,0.08)" />
            <stop offset="100%" stopColor="rgba(249,178,110,0)" />
          </radialGradient>
          <linearGradient id="laneBoards" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a2416" />
            <stop offset="100%" stopColor="#6b4226" />
          </linearGradient>
          <radialGradient id="pinBody" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#dfe3ea" />
          </radialGradient>
          <radialGradient id="ballGradient" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#3987e5" />
            <stop offset="100%" stopColor="#12356e" />
          </radialGradient>
        </defs>

        <rect width="400" height={height} fill="url(#laneSky)" />
        <rect width="400" height={height} fill="url(#spotlight)" />

        {/* Lane, drawn in perspective toward the pins at the top */}
        <polygon points={`120,${height} 280,${height} 235,20 165,20`} fill="url(#laneBoards)" opacity={0.9} />
        <polygon points={`120,${height} 280,${height} 235,20 165,20`} fill="none" stroke="rgba(255,255,255,0.06)" />
        {/* board seams */}
        {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((t) => (
          <line
            key={t}
            x1={120 + (280 - 120) * t}
            y1={height}
            x2={165 + (235 - 165) * t}
            y2={20}
            stroke="rgba(0,0,0,0.15)"
            strokeWidth={1}
          />
        ))}
        {/* lane arrows */}
        {[-24, -12, 0, 12, 24].map((dx) => (
          <polygon
            key={dx}
            points={`${200 + dx},${height - 40} ${196 + dx},${height - 52} ${204 + dx},${height - 52}`}
            fill="rgba(255,255,255,0.25)"
          />
        ))}

        {!compact && (
          <>
            {PIN_ROWS.map((p, i) => (
              <Pin key={i} x={p.x} y={p.y} fallen={p.fallen} />
            ))}
            {/* ball mid-roll, with a motion trail */}
            <ellipse cx={200} cy={height - 26} rx={14} ry={5} fill="rgba(11,18,32,0.4)" />
            <circle cx={190} cy={height - 60} r={7} fill="rgba(57,135,229,0.18)" />
            <circle cx={195} cy={height - 45} r={9} fill="rgba(57,135,229,0.28)" />
            <circle cx={200} cy={height - 30} r={13} fill="url(#ballGradient)" />
            <circle cx={196} cy={height - 34} r={1.4} fill="#0b1220" opacity={0.8} />
            <circle cx={201} cy={height - 33} r={1.4} fill="#0b1220" opacity={0.8} />
            <circle cx={198.5} cy={height - 29} r={1.4} fill="#0b1220" opacity={0.8} />
          </>
        )}
      </svg>

      <div className="bowling-hero-copy">
        <h1 className="bowling-hero-title">{title}</h1>
        {subtitle && <p className="bowling-hero-subtitle">{subtitle}</p>}
      </div>
    </div>
  );
}
