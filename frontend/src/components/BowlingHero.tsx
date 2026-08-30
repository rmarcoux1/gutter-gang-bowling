// A hand-built SVG bowling lane illustration used as a themed page banner —
// no external images, so nothing to fetch, license, or go missing at deploy
// time. Styled as a neon midnight lane: black sky, glowing cyan/violet
// light, a bowling ball trailing electric light down the boards.

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

const STARS: { x: number; y: number; r: number; o: number }[] = [
  { x: 30, y: 20, r: 1.2, o: 0.8 },
  { x: 70, y: 45, r: 0.9, o: 0.5 },
  { x: 350, y: 25, r: 1.1, o: 0.7 },
  { x: 320, y: 55, r: 0.8, o: 0.4 },
  { x: 20, y: 90, r: 1, o: 0.6 },
  { x: 375, y: 90, r: 1.3, o: 0.8 },
  { x: 55, y: 115, r: 0.7, o: 0.35 },
  { x: 340, y: 120, r: 0.9, o: 0.5 },
];

function Pin({ x, y, fallen }: { x: number; y: number; fallen?: boolean }) {
  return (
    <g transform={fallen ? `translate(${x} ${y}) rotate(72)` : `translate(${x} ${y})`}>
      <ellipse cx={0} cy={17} rx={7.5} ry={2.4} fill="rgba(0,0,0,0.55)" />
      <path
        d="M0,-16 C4.5,-16 5.5,-11 4,-7 C7,-2 7,7 4.5,13 C3.5,16.5 -3.5,16.5 -4.5,13 C-7,7 -7,-2 -4,-7 C-5.5,-11 -4.5,-16 0,-16 Z"
        fill="url(#pinBody)"
        stroke="rgba(34,211,238,0.55)"
        strokeWidth={0.6}
      />
      <rect x={-4.6} y={-2} width={9.2} height={2.6} fill="#22d3ee" opacity={0.85} />
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
            <stop offset="0%" stopColor="#020308" />
            <stop offset="55%" stopColor="#050b1d" />
            <stop offset="100%" stopColor="#0b1a3a" />
          </linearGradient>
          <radialGradient id="spotlight" cx="50%" cy="10%" r="70%">
            <stop offset="0%" stopColor="rgba(34,211,238,0.45)" />
            <stop offset="45%" stopColor="rgba(99,102,241,0.16)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0)" />
          </radialGradient>
          <linearGradient id="laneBoards" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1330" />
            <stop offset="100%" stopColor="#152552" />
          </linearGradient>
          <radialGradient id="pinBody" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#f4f9ff" />
            <stop offset="100%" stopColor="#c7d6f0" />
          </radialGradient>
          {/* Electric-blue bowling ball with a hot violet core highlight. */}
          <radialGradient id="ballGradient" cx="32%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#a5f3fc" />
            <stop offset="35%" stopColor="#22d3ee" />
            <stop offset="75%" stopColor="#0e7490" />
            <stop offset="100%" stopColor="#052e3b" />
          </radialGradient>
          <filter id="neonGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="400" height={height} fill="url(#laneSky)" />
        <rect width="400" height={height} fill="url(#spotlight)" />

        {/* faint starfield for depth */}
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#a5f3fc" opacity={s.o} />
        ))}

        {/* Lane, drawn in perspective toward the pins at the top, with a glowing neon edge */}
        <polygon points={`120,${height} 280,${height} 235,20 165,20`} fill="url(#laneBoards)" opacity={0.95} />
        <polygon
          points={`120,${height} 280,${height} 235,20 165,20`}
          fill="none"
          stroke="rgba(34,211,238,0.55)"
          strokeWidth={1.4}
          filter="url(#neonGlow)"
        />
        {/* board seams */}
        {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((t) => (
          <line
            key={t}
            x1={120 + (280 - 120) * t}
            y1={height}
            x2={165 + (235 - 165) * t}
            y2={20}
            stroke="rgba(34,211,238,0.08)"
            strokeWidth={1}
          />
        ))}
        {/* lane arrows, glowing */}
        {[-24, -12, 0, 12, 24].map((dx) => (
          <polygon
            key={dx}
            points={`${200 + dx},${height - 40} ${196 + dx},${height - 52} ${204 + dx},${height - 52}`}
            fill="rgba(165,243,252,0.55)"
          />
        ))}

        {!compact && (
          <>
            {PIN_ROWS.map((p, i) => (
              <Pin key={i} x={p.x} y={p.y} fallen={p.fallen} />
            ))}
            {/* ball mid-roll, with a glowing neon motion trail */}
            <ellipse cx={200} cy={height - 26} rx={14} ry={5} fill="rgba(0,0,0,0.5)" />
            <circle cx={188} cy={height - 66} r={6} fill="rgba(34,211,238,0.18)" />
            <circle cx={194} cy={height - 48} r={9} fill="rgba(34,211,238,0.3)" />
            <circle cx={200} cy={height - 30} r={13} fill="url(#ballGradient)" filter="url(#neonGlow)" />
            <circle cx={196} cy={height - 34} r={1.4} fill="#052e3b" opacity={0.85} />
            <circle cx={201} cy={height - 33} r={1.4} fill="#052e3b" opacity={0.85} />
            <circle cx={198.5} cy={height - 29} r={1.4} fill="#052e3b" opacity={0.85} />
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
