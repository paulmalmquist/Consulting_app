"use client";

import { useState } from "react";
import { steerSession, forkSession, type SteerRecord } from "@/lib/investigation/sessionStream";

// Steering chat rail (plan PR 8). A steering wheel, not a chatbot. Submits a steering
// instruction to the PR 6 steer endpoint (which whitelists the verb server-side and
// applies it to FUTURE sections only — prior sections are never mutated). Renders
// acknowledgements; every steer is audited backend-side.
//
// Honesty constraints:
//   - Steering text is user input; the backend is the injection boundary (whitelist,
//     no raw SQL, no tool override). The rail does no client-side SQL/tool work.
//   - "Show SQL" reveals only EXISTING source_ref provenance already on the page — it
//     never generates SQL.
//   - "Save version" has no backend yet → it is INERT (disabled), labeled as such,
//     rather than faking a save.

type Ack = { id: string; text: string; tone: "ok" | "warn" | "info" };

const COMMAND_CHIPS = [
  { label: "Focus on…", prefix: "focus on ", kind: "steer" as const },
  { label: "Ignore…", prefix: "ignore ", kind: "steer" as const },
  { label: "Compare against…", prefix: "compare against ", kind: "steer" as const },
  { label: "Find similar", prefix: "find similar", kind: "steer" as const },
  { label: "Show SQL", prefix: "", kind: "show_sql" as const },
  { label: "Fork", prefix: "", kind: "fork" as const },
  { label: "Save version", prefix: "", kind: "save_version" as const },
];

export function SteeringChatRail({
  env,
  sessionId,
  businessId,
  title,
  steers,
  onShowSql,
}: {
  env: string | null;
  sessionId: string;
  businessId?: string | null;
  title: string;
  steers: SteerRecord[];
  onShowSql: () => void;
}) {
  const [input, setInput] = useState("");
  const [acks, setAcks] = useState<Ack[]>([]);
  const [busy, setBusy] = useState(false);

  const pushAck = (text: string, tone: Ack["tone"]) =>
    setAcks((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text, tone }]);

  async function submitSteer(instruction: string) {
    const trimmed = instruction.trim();
    if (!trimmed || !env || busy) return;
    setBusy(true);
    pushAck(`You: ${trimmed}`, "info");
    try {
      const res = await steerSession(env, sessionId, trimmed, businessId ?? undefined);
      if (res.status === "revised") {
        pushAck(`Got it — future sections will reflect that. Prior sections are unchanged. (plan v${res.plan_version})`, "ok");
      } else if (res.status === "unsupported") {
        pushAck("That instruction isn't a supported steering command, so nothing was changed.", "warn");
      } else {
        pushAck("Session not found.", "warn");
      }
    } catch {
      pushAck("Could not submit steering instruction.", "warn");
    }
    setInput("");
    setBusy(false);
  }

  async function handleChip(chip: (typeof COMMAND_CHIPS)[number]) {
    if (chip.kind === "show_sql") {
      onShowSql();
      pushAck("Showing the source provenance already attached to each claim.", "info");
      return;
    }
    if (chip.kind === "save_version") {
      pushAck("Saving a named version isn't available yet — coming in a later release.", "warn");
      return;
    }
    if (chip.kind === "fork") {
      if (!env) return;
      pushAck("Forking this investigation…", "info");
      try {
        const r = await forkSession(env, sessionId, `Fork of ${title}`, businessId ?? undefined);
        if (r?.child_session_id) {
          window.location.href = `/app/investigate/${r.child_session_id}`;
        }
      } catch {
        pushAck("Could not fork the investigation.", "warn");
      }
      return;
    }
    // steer chips: prefill the input for the user to complete, or submit if complete
    if (chip.prefix.trim() && chip.prefix.endsWith(" ")) {
      setInput(chip.prefix);
    } else {
      void submitSteer(chip.prefix);
    }
  }

  return (
    <aside className="flex w-full flex-col rounded-md border bg-[rgba(8,11,18,0.6)] lg:w-[320px] lg:shrink-0"
      style={{ borderColor: "rgba(232,236,242,0.10)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "rgba(232,236,242,0.08)" }}>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Steer</p>
        <p className="mt-1 text-[11px] leading-4 text-white/45">
          Direct future sections. Prior findings stay versioned and unchanged.
        </p>
      </div>

      {/* Applied steers */}
      {steers.length > 0 ? (
        <div className="border-b px-4 py-2" style={{ borderColor: "rgba(232,236,242,0.06)" }}>
          {steers.map((s) => (
            <div key={s.steer_id} className="flex items-center gap-2 py-0.5 font-mono text-[10px] text-white/50">
              <span className="text-[rgba(92,213,204,0.85)]">steered</span>
              <span>plan v{s.plan_version}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Acknowledgement log */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3" style={{ minHeight: 120, maxHeight: 320 }}>
        {acks.length === 0 ? (
          <p className="text-[12px] text-white/35">No steering yet. Use a chip or type an instruction.</p>
        ) : (
          acks.map((a) => (
            <div key={a.id} className="text-[12px] leading-5"
              style={{ color: a.tone === "ok" ? "rgba(140,200,158,0.95)" : a.tone === "warn" ? "rgba(209,161,91,0.95)" : "rgba(255,255,255,0.7)" }}>
              {a.text}
            </div>
          ))
        )}
      </div>

      {/* Command chips */}
      <div className="flex flex-wrap gap-1.5 border-t px-4 py-3" style={{ borderColor: "rgba(232,236,242,0.08)" }}>
        {COMMAND_CHIPS.map((chip) => {
          const inert = chip.kind === "save_version";
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => void handleChip(chip)}
              disabled={inert || (!env && chip.kind !== "show_sql")}
              title={inert ? "Coming in a later release" : undefined}
              className="rounded-full border border-white/12 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/65 transition-colors hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Free-text input */}
      <form
        className="flex gap-2 border-t px-4 py-3"
        style={{ borderColor: "rgba(232,236,242,0.08)" }}
        onSubmit={(e) => { e.preventDefault(); void submitSteer(input); }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Steer the investigation…"
          disabled={!env || busy}
          className="min-w-0 flex-1 rounded-md border border-white/12 bg-[rgba(3,7,14,0.6)] px-3 py-1.5 text-[13px] text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!env || busy || !input.trim()}
          className="rounded-md border border-white/15 bg-white/[0.05] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/80 transition-colors hover:border-white/30 hover:text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </aside>
  );
}

export default SteeringChatRail;
