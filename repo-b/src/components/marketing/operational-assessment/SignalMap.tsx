import styles from '../../../app/(marketing)/operational-assessment/scan-console.module.css';

/* ── Deterministic PRNG (mulberry32) — identical to what-we-do/page.tsx ── */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Main path anchors (matches mockup bezier) ── */
const PATH_ANCHORS = [
  [92, 18], [132, 132], [250, 205], [470, 242],
  [648, 348], [858, 416], [1066, 386],
] as const;

const MAIN_PATH =
  'M92 18 C120 120 170 178 250 205 C338 235 396 218 470 242 ' +
  'C542 266 560 328 648 348 C724 365 774 432 858 416 ' +
  'C932 402 982 365 1066 386';

function basePoint(t: number): [number, number] {
  const anchors = PATH_ANCHORS;
  const n = anchors.length - 1;
  const p = Math.min(n - 0.0001, Math.max(0, t * n));
  const i = Math.floor(p);
  const f = p - i;
  const a = anchors[i];
  const b = anchors[i + 1];
  const ease = f * f * (3 - 2 * f);
  return [a[0] + (b[0] - a[0]) * ease, a[1] + (b[1] - a[1]) * ease];
}

function colorAt(t: number): string {
  if (t < 0.38) return '#55FFF4';
  if (t < 0.54) return '#FFB12D';
  if (t < 0.76) return '#FF38B6';
  if (t < 0.88) return '#FF3B52';
  return '#55FFF4';
}

/* ── Pre-compute frays at module scope (stable across renders) ── */
type FrayPath = { d: string; color: string; width: number; opacity: number };

function precomputeFrays(): FrayPath[] {
  const rand = mulberry32(12841);
  function gauss(mean: number, sd: number): number {
    const u = 1 - rand();
    const v = 1 - rand();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  const frays: FrayPath[] = [];

  function addFray(
    offset: number, amp: number, opacity: number,
    width: number, phase: number, start: number, end: number,
  ) {
    const steps = 44;
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const t = start + (end - start) * (i / steps);
      const [bx, by] = basePoint(t);
      const wob =
        Math.sin(t * 22 + phase) * amp +
        Math.sin(t * 47 + phase * 0.7) * (amp * 0.35);
      const fall = (t - 0.5) * offset;
      const x = bx + gauss(0, 1.6);
      const y = by + wob + fall + gauss(0, 1.2);
      d += (i === 0 ? 'M' : ' L') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    const midT = (start + end) / 2;
    frays.push({ d, color: colorAt(midT), width, opacity });
  }

  for (let i = 0; i < 34; i++) {
    addFray(
      gauss(0, 42), 4 + rand() * 18,
      0.08 + rand() * 0.18, 0.35 + rand() * 0.55,
      rand() * 20, Math.max(0, rand() * 0.18 - 0.04),
      Math.min(1, 0.72 + rand() * 0.32),
    );
  }
  for (let i = 0; i < 18; i++) {
    addFray(
      gauss(0, 72), 14 + rand() * 34,
      0.035 + rand() * 0.09, 0.25 + rand() * 0.35,
      rand() * 30, rand() * 0.38,
      0.52 + rand() * 0.44,
    );
  }

  return frays;
}

/* ── Pre-compute speckles at module scope ── */
type Speckle = { cx: number; cy: number; r: number; fill: string; opacity: number };

function precomputeSpeckles(): Speckle[] {
  const rand = mulberry32(12841);
  function gauss(mean: number, sd: number): number {
    const u = 1 - rand();
    const v = 1 - rand();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const sizes = [0.28, 0.34, 0.42, 0.55, 0.72];
  const speckles: Speckle[] = [];

  function add(x: number, y: number, r: number, fill: string, opacity: number) {
    speckles.push({ cx: +x.toFixed(1), cy: +y.toFixed(1), r: +r.toFixed(2), fill, opacity: +opacity.toFixed(2) });
  }

  for (let i = 0; i < 150; i++) {
    const x = gauss(120, 58);
    const y = rand() * 330;
    if (x > 8 && x < 280) {
      add(x, y, sizes[Math.floor(rand() * sizes.length)], '#55FFF4', 0.10 + rand() * 0.62);
    }
  }
  for (let i = 0; i < 210; i++) {
    const t = rand();
    const [bx, by] = basePoint(t);
    add(bx + gauss(0, 95), by + gauss(0, 56), sizes[Math.floor(rand() * 4)], colorAt(t), 0.035 + rand() * 0.22);
  }
  for (let i = 0; i < 155; i++) {
    const t = rand() * 0.38;
    const [bx, by] = basePoint(t);
    add(bx + gauss(0, 34), by + gauss(0, 28), sizes[Math.floor(rand() * sizes.length)], '#55FFF4', 0.12 + rand() * 0.48);
  }
  for (let i = 0; i < 92; i++) {
    const t = 0.38 + rand() * 0.17;
    const [bx, by] = basePoint(t);
    add(bx + gauss(0, 36), by + gauss(0, 24), sizes[Math.floor(rand() * sizes.length)], '#FFB12D', 0.13 + rand() * 0.46);
  }
  for (let i = 0; i < 112; i++) {
    const t = 0.55 + rand() * 0.22;
    const [bx, by] = basePoint(t);
    add(bx + gauss(0, 44), by + gauss(0, 30), sizes[Math.floor(rand() * sizes.length)], '#FF38B6', 0.11 + rand() * 0.42);
  }
  for (let i = 0; i < 82; i++) {
    const t = 0.75 + rand() * 0.14;
    const [bx, by] = basePoint(t);
    add(bx + gauss(0, 38), by + gauss(0, 24), sizes[Math.floor(rand() * sizes.length)], '#FF3B52', 0.10 + rand() * 0.38);
  }
  for (let i = 0; i < 88; i++) {
    const t = 0.88 + rand() * 0.12;
    const [bx, by] = basePoint(t);
    add(bx + gauss(0, 42), by + gauss(0, 28), sizes[Math.floor(rand() * 4)], '#55FFF4', 0.08 + rand() * 0.34);
  }

  return speckles;
}

/* ── Static particle arrays (computed once at module load) ── */
const FRAYS = precomputeFrays();
const SPECKLES = precomputeSpeckles();

/* ── Scan wall bar definitions ── */
const SCAN_BARS = [
  { left: 24, height: 210 },
  { left: 38, height: 270 },
  { left: 52, height: 315 },
  { left: 68, height: 250 },
  { left: 85, height: 355 },
  { left: 102, height: 290 },
  { left: 124, height: 240 },
  { left: 145, height: 200 },
  { left: 168, height: 150 },
];

/* ── Pin definitions ── */
const PINS = [
  { id: 'p1', left: '13%',  top: '54px',  color: '#55FFF4', num: '01', name: 'Intake',    kind: 'System' },
  { id: 'p2', left: '30%',  top: '132px', color: '#A8FFF8', num: '02', name: 'Review',    kind: 'System' },
  { id: 'p3', left: '46%',  top: '234px', color: '#FFB12D', num: '03', name: 'Handoff',   kind: 'Manual' },
  { id: 'p4', left: '61%',  top: '302px', color: '#FF38B6', num: '04', name: 'Approval',  kind: 'Unclear owner' },
  { id: 'p5', left: '74%',  top: '378px', color: '#FF3B52', num: '05', name: 'Evidence',  kind: 'Missing' },
  { id: 'p6', left: '88%',  top: '358px', color: '#55FFF4', num: '06', name: 'Output',    kind: 'System' },
];

/* ── Halo definitions ── */
const HALOS = [
  { id: 'h1', left: '12%',  top: '154px', color: '#55FFF4' },
  { id: 'h2', left: '31%',  top: '266px', color: '#A8FFF8' },
  { id: 'h3', left: '48%',  top: '352px', color: '#FFB12D' },
  { id: 'h4', left: '62%',  top: '408px', color: '#FF38B6' },
  { id: 'h5', left: '76%',  top: '444px', color: '#FF3B52' },
  { id: 'h6', left: '90%',  top: '446px', color: '#55FFF4' },
];

/* ── Soft block zones ── */
const SOFT_BLOCKS = [
  { left: '21%', top: '132px', width: 110, height: 95 },
  { left: '38%', top: '158px', width: 116, height: 110 },
  { left: '52%', top: '256px', width: 126, height: 92 },
  { left: '68%', top: '300px', width: 110, height: 100 },
];

export function SignalMap() {
  return (
    <div className={styles.visual} aria-hidden="true">
      {/* 1. Background mist */}
      <div className={styles.mist} />

      {/* 2. Terrain contour */}
      <div className={styles.terrain} />

      {/* 3. Soft block zones */}
      {SOFT_BLOCKS.map((b, i) => (
        <div
          key={i}
          className={styles.softBlock}
          style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
        />
      ))}

      {/* 4. SVG: grid lines → under trace → frays → speckles → main trace → dashes */}
      <svg
        className={styles.flowSvg}
        viewBox="0 0 1120 560"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <filter id="smGlow">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="smSpeckleGlow">
            <feGaussianBlur stdDeviation="1.1" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="smMainFlow" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%"   stopColor="#55FFF4" />
            <stop offset="36%"  stopColor="#55FFF4" />
            <stop offset="50%"  stopColor="#FFB12D" />
            <stop offset="68%"  stopColor="#FF38B6" />
            <stop offset="82%"  stopColor="#FF3B52" />
            <stop offset="100%" stopColor="#55FFF4" />
          </linearGradient>
          <linearGradient id="smUnder" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%"   stopColor="#55FFF4" stopOpacity="0.2" />
            <stop offset="50%"  stopColor="#FFB12D" stopOpacity="0.18" />
            <stop offset="72%"  stopColor="#FF38B6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#55FFF4" stopOpacity="0.12" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        <g stroke="#55FFF4" strokeOpacity="0.105" fill="none" strokeWidth="1">
          <path d="M34 366 C190 274 304 358 466 334 C612 312 716 406 914 390" />
          <path d="M76 396 C210 342 356 380 500 366 C630 350 724 438 942 420" />
          <path d="M120 428 C280 392 408 420 560 406 C718 392 818 458 1010 444" />
        </g>

        {/* Base horizon lines */}
        <path d="M16 452 L1090 452" stroke="#263243" strokeWidth="1" strokeOpacity="0.75" />
        <path d="M40 486 L1060 486" stroke="#17212C" strokeWidth="1" strokeOpacity="0.9" />
        <path d="M20 518 L1050 518" stroke="#17212C" strokeWidth="1" strokeOpacity="0.55" />

        {/* Under trace — behind frays so density reads on top */}
        <path
          d={MAIN_PATH}
          fill="none"
          stroke="url(#smUnder)"
          strokeWidth="7"
          strokeLinecap="round"
          opacity="0.12"
        />

        {/* Frays — carry the form, render above under trace */}
        <g>
          {FRAYS.map((f, i) => (
            <path
              key={i}
              d={f.d}
              fill="none"
              stroke={f.color}
              strokeWidth={f.width}
              strokeOpacity={f.opacity}
              strokeLinecap="round"
              style={{ mixBlendMode: 'screen' }}
            />
          ))}
        </g>

        {/* Speckles — render above frays */}
        <g filter="url(#smSpeckleGlow)">
          {SPECKLES.map((s, i) => (
            <circle
              key={i}
              cx={s.cx}
              cy={s.cy}
              r={s.r}
              fill={s.fill}
              opacity={s.opacity}
              style={{ mixBlendMode: 'screen' }}
            />
          ))}
        </g>

        {/* Main trace — barely visible, above speckles */}
        <path
          d={MAIN_PATH}
          fill="none"
          stroke="url(#smMainFlow)"
          strokeWidth="0.75"
          strokeLinecap="round"
          opacity="0.42"
        />

        {/* Dashed secondaries */}
        <path
          d="M98 104 C190 196 302 224 452 250 C576 272 660 372 812 400"
          fill="none"
          stroke="#55FFF4"
          strokeWidth="1.2"
          strokeOpacity="0.22"
          strokeDasharray="20 22"
        />
        <path
          d="M160 164 C292 332 486 430 706 382"
          fill="none"
          stroke="#FF3B52"
          strokeWidth="1.2"
          strokeOpacity="0.23"
          strokeDasharray="14 18"
        />
      </svg>

      {/* 5. Scan wall — CSS bars on top of SVG */}
      <div className={styles.scanwall}>
        {SCAN_BARS.map((b, i) => (
          <i key={i} style={{ left: b.left, height: b.height }} />
        ))}
      </div>

      {/* 6. Pins */}
      {PINS.map(p => (
        <div
          key={p.id}
          className={styles.pin}
          style={{ left: p.left, top: p.top, color: p.color }}
        >
          <div className={styles.pinNum}>{p.num}</div>
          <div className={styles.pinName}>{p.name}</div>
          <div className={styles.pinKind}>{p.kind}</div>
        </div>
      ))}

      {/* 7. Halos */}
      {HALOS.map(h => (
        <div
          key={h.id}
          className={styles.halo}
          style={{ left: h.left, top: h.top, color: h.color }}
        />
      ))}

      {/* 8. Scan Summary card */}
      <div className={styles.summary}>
        <div className={styles.summaryHead}>
          <span>Scan summary</span>
          <span className={styles.live}>&#9679; Live</span>
        </div>
        <div className={styles.stat}>
          <span>Workflows scanned</span>
          <b>12</b>
        </div>
        <div className={styles.stat}>
          <span>Friction points detected</span>
          <b>37</b>
        </div>
        <div className={styles.stat}>
          <span>Avg. friction score</span>
          <b className={styles.warn}>68 / 100</b>
        </div>
        <div className={styles.stat}>
          <span>Est. value at risk</span>
          <b className={styles.danger}>$4.7M</b>
        </div>
        <div className={styles.lastScan}>Last scan&nbsp;&nbsp;14:22:08 UTC</div>
      </div>
    </div>
  );
}
