export default function LaunchDataProblemHeader() {
  return (
    <section className="w-full bg-[#030814] text-white px-6 py-8 md:px-10 md:py-10 rounded-xl border border-white/5">
      <div className="max-w-6xl">
        <div className="mb-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-300/90">
          <span className="h-px w-8 bg-cyan-300/90" />
          <span>Overview</span>
        </div>

        <h1
          className="text-4xl leading-[0.96] tracking-[-0.05em] md:text-6xl lg:text-[78px]"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          <span className="text-white">Why </span>
          <span className="bg-gradient-to-r from-fuchsia-500 via-violet-400 to-fuchsia-500 bg-clip-text text-transparent">
            Launch
          </span>
          <span className="text-white"> Became A </span>
          <span className="bg-gradient-to-r from-violet-500 via-fuchsia-400 to-violet-500 bg-clip-text text-transparent">
            Data
          </span>
          <span className="text-white"> Problem</span>
        </h1>

        <p className="mt-6 max-w-5xl text-base leading-8 text-slate-300 md:text-[17px]">
          Spaceflight moves by breaking what holds it back. First, reaching orbit. Then lowering the
          cost. Then flying again. Then building at scale. Now the hard part is speed of judgment:
          reading the telemetry, trusting the model, tracing the source, and acting before delay
          becomes risk.
        </p>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Timeline"
            value="1957 – 2026"
            note="full range"
            valueClassName="text-white"
          />
          <Metric
            label="Launch Attempts"
            value="7,173"
            note="orbital, total"
            valueClassName="text-white"
          />
          <Metric
            label="Commercial Share"
            value="70%"
            note="as of 2025"
            valueClassName="text-emerald-300"
          />
          <Metric
            label="Cost Per Kg To LEO"
            value="$12k → $2,340"
            note="Saturn V to Terran R, 2025 $"
            valueClassName="text-amber-300"
          />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, note, valueClassName = 'text-white' }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className={`mt-3 text-3xl font-semibold tracking-[-0.03em] ${valueClassName}`}>{value}</div>
      <div className="mt-2 text-sm text-slate-400">{note}</div>
    </div>
  );
}
