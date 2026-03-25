import { existsSync } from "fs";
import { readdir, readFile } from "fs/promises";
import path from "path";
import type {
  BuildQueueCard,
  IntelCard,
  MarketLandingFeed,
  RotationTarget,
  SourceRef,
} from "@/lib/market-intelligence/types";

type DocHandle = {
  repoPath: string;
  absPath: string;
  content: string;
  date: string | null;
};

function createEmptyFeed(notes: string[] = []): MarketLandingFeed {
  return {
    generatedAt: new Date().toISOString(),
    status: {
      engineStatus: "Unknown",
      regimeLabel: "Unknown",
      confidenceText: "Docs not loaded yet",
      latestDigestDate: null,
      pipelineState: "No market intelligence artifacts were found in the repo.",
      sourceHealthNotes: notes,
    },
    rotation: {
      nextStep: null,
      summary: null,
      selectedSegments: [],
    },
    digest: {
      regimeSummary: null,
      topSignals: [],
      crossVerticalAlertSummary: null,
      pipelineHealthSummary: null,
    },
    dailyIntel: null,
    competitorWatch: [],
    salesPositioning: [],
    featureRadar: null,
    demoAngle: null,
    buildQueue: [],
    sources: [],
  };
}

function toRepoPath(input: string): string {
  return input.split(path.sep).join("/");
}

function normalizeHeading(value: string): string {
  return cleanInline(value).toLowerCase();
}

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  const candidates = [cwd, path.resolve(cwd, "..")];
  const resolved = candidates.find((candidate) =>
    existsSync(path.join(candidate, "docs", "LATEST.md"))
  );
  return resolved || cwd;
}

function extractDate(value: string): string | null {
  return value.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function compareRepoPathsByDateDesc(a: string, b: string): number {
  const dateA = extractDate(a) || "";
  const dateB = extractDate(b) || "";
  if (dateA !== dateB) {
    return dateA < dateB ? 1 : -1;
  }
  return a < b ? 1 : -1;
}

async function readRepoFile(repoRoot: string, repoPath: string): Promise<DocHandle | null> {
  const absPath = path.join(repoRoot, repoPath);
  if (!existsSync(absPath)) {
    return null;
  }

  const content = await readFile(absPath, "utf8");
  return {
    repoPath,
    absPath,
    content,
    date: extractDate(repoPath) || extractDate(content),
  };
}

async function walkMarkdownFiles(repoRoot: string, repoDir: string): Promise<string[]> {
  const absDir = path.join(repoRoot, repoDir);
  if (!existsSync(absDir)) {
    return [];
  }

  const entries = await readdir(absDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const repoPath = toRepoPath(path.join(repoDir, entry.name));
      if (entry.isDirectory()) {
        return walkMarkdownFiles(repoRoot, repoPath);
      }
      if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== ".gitkeep.md") {
        return [repoPath];
      }
      return [];
    })
  );

  return files.flat();
}

async function pickLatestDoc(
  repoRoot: string,
  manifestRefs: string[],
  options: {
    manifestPrefixes?: string[];
    fallbackDirs: string[];
    filter?: (repoPath: string) => boolean;
  }
): Promise<DocHandle | null> {
  const filter = options.filter ?? (() => true);

  const manifestCandidates = manifestRefs.filter((repoPath) => {
    if (!repoPath.endsWith(".md")) return false;
    if (!filter(repoPath)) return false;
    if (!options.manifestPrefixes?.length) return true;
    return options.manifestPrefixes.some((prefix) => repoPath.startsWith(prefix));
  });

  for (const repoPath of manifestCandidates) {
    const doc = await readRepoFile(repoRoot, repoPath);
    if (doc) return doc;
  }

  const fallbackFiles = (
    await Promise.all(options.fallbackDirs.map((repoDir) => walkMarkdownFiles(repoRoot, repoDir)))
  )
    .flat()
    .filter(filter)
    .sort(compareRepoPathsByDateDesc);

  for (const repoPath of fallbackFiles) {
    const doc = await readRepoFile(repoRoot, repoPath);
    if (doc) return doc;
  }

  return null;
}

function cleanInline(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^>\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitParagraphs(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => cleanInline(paragraph))
    .filter((paragraph) => paragraph && !paragraph.startsWith("|"));
}

function firstParagraph(value: string): string {
  return splitParagraphs(value)[0] || "";
}

function excerpt(value: string, maxSentences = 2): string {
  const paragraph = firstParagraph(value) || cleanInline(value);
  if (!paragraph) return "";
  const sentences = paragraph.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, maxSentences).join(" ").trim() || paragraph;
}

function stripNamedLines(value: string): string {
  return value
    .split(/\r?\n/)
    .filter((line) => !line.trim().match(/^(?:-\s*)?\*\*[^*]+:\*\*/))
    .join("\n");
}

function splitSections(
  value: string,
  level: number
): Array<{ title: string; body: string }> {
  const prefix = `${"#".repeat(level)} `;
  const sections: Array<{ title: string; body: string }> = [];
  const lines = value.split(/\r?\n/);
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(prefix)) {
      if (currentTitle) {
        sections.push({ title: currentTitle, body: currentLines.join("\n").trim() });
      }
      currentTitle = line.slice(prefix.length).trim();
      currentLines = [];
      continue;
    }
    if (currentTitle) {
      currentLines.push(line);
    }
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, body: currentLines.join("\n").trim() });
  }

  return sections;
}

function findSectionBody(
  value: string,
  level: number,
  matcher: RegExp | string
): string | null {
  const sections = splitSections(value, level);
  const target = sections.find((section) => {
    if (typeof matcher === "string") {
      return normalizeHeading(section.title) === normalizeHeading(matcher);
    }
    return matcher.test(section.title);
  });
  return target?.body || null;
}

function parseNamedLines(value: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:-\s*)?\*\*([^*]+):\*\*\s*(.+)$/);
    if (match) {
      labels[cleanInline(match[1])] = cleanInline(match[2]);
    }
  }
  return labels;
}

function parseBulletLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => cleanInline(line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "")))
    .filter(Boolean);
}

function parseMarkdownTable(value: string): Array<Record<string, string>> {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));

  if (lines.length < 3) {
    return [];
  }

  const splitRow = (line: string) =>
    line
      .slice(1, -1)
      .split("|")
      .map((cell) => cleanInline(cell.trim()));

  const headers = splitRow(lines[0]);
  const rows = lines.slice(2).filter((line) => {
    const normalized = line.replace(/\|/g, "").replace(/[\s:-]/g, "");
    return normalized.length > 0;
  });

  return rows.map((line) => {
    const cells = splitRow(line);
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = cells[index] || "";
      return acc;
    }, {});
  });
}

function firstSentenceBullets(value: string, maxItems: number): string[] {
  return splitParagraphs(value)
    .slice(0, maxItems)
    .map((paragraph) => excerpt(paragraph, 1))
    .filter(Boolean);
}

function extractManifestRefs(value: string): string[] {
  const refs = [...value.matchAll(/`(docs\/[^`]+\.md)`/g)].map((match) => match[1]);
  return Array.from(new Set(refs));
}

function addSource(
  sources: SourceRef[],
  label: string,
  repoPath: string,
  status: "ok" | "missing" | "fallback" = "ok",
  note?: string
) {
  if (sources.some((source) => source.label === label && source.path === repoPath)) {
    return;
  }
  sources.push({ label, path: repoPath, status, note });
}

function fallbackIntelCard(title: string, doc: DocHandle): IntelCard {
  return {
    title,
    summary: excerpt(doc.content, 3),
    bullets: firstSentenceBullets(doc.content, 3),
  };
}

function parseRotationDoc(doc: DocHandle): {
  nextStep: string | null;
  summary: string | null;
  selectedSegments: RotationTarget[];
} {
  const labels = parseNamedLines(doc.content);
  const selectedSection =
    findSectionBody(doc.content, 2, /selected segments/i) || doc.content;
  const selectionNotes = findSectionBody(doc.content, 2, /selection notes/i) || "";
  const researchSweep = findSectionBody(doc.content, 2, /for fin-research-sweep/i) || "";
  const rows = parseMarkdownTable(selectedSection);

  const notesBySegment = new Map<string, string>();
  for (const line of researchSweep.split(/\r?\n/)) {
    const match = line.match(/^\d+\.\s+\*\*([^*]+)\*\*.*?—\s*(.+)$/);
    if (match) {
      notesBySegment.set(cleanInline(match[1]), cleanInline(match[2]));
    }
  }

  return {
    nextStep: labels["Next step"] || null,
    summary: parseBulletLines(selectionNotes).slice(0, 2).join(" ") || excerpt(selectionNotes, 2) || null,
    selectedSegments: rows.map((row) => ({
      segmentId: row["Segment ID"] || undefined,
      name: row["Segment Name"] || row["Segment"] || "Unnamed segment",
      category: row["Category"] || undefined,
      tier: row["Tier"] || undefined,
      overdueRatio: row["Overdue Ratio"] || undefined,
      note: notesBySegment.get(row["Segment Name"] || "") || undefined,
    })),
  };
}

function parseDailyIntelDoc(doc: DocHandle): IntelCard {
  const subsections = splitSections(doc.content, 3).filter(
    (section) =>
      !/impact statement/i.test(section.title) &&
      !/newsletter scan/i.test(section.title)
  );
  const impact = excerpt(findSectionBody(doc.content, 2, /impact statement/i) || "", 2);
  return {
    title: `Daily Intelligence${doc.date ? ` — ${doc.date}` : ""}`,
    summary: excerpt(subsections[0]?.body || doc.content, 2),
    bullets: subsections
      .slice(0, 4)
      .map((section) => `${cleanInline(section.title)} — ${excerpt(section.body, 1)}`),
    impact: impact || undefined,
  };
}

function parseCompetitorDoc(doc: DocHandle): IntelCard[] {
  return splitSections(doc.content, 2)
    .filter((section) => !/impact statement/i.test(section.title))
    .slice(0, 4)
    .map((section) => {
      const subsection = splitSections(section.body, 3)[0];
      const body = subsection?.body || section.body;
      const title = subsection
        ? `${cleanInline(section.title)} — ${cleanInline(subsection.title)}`
        : cleanInline(section.title);
      const threat =
        body.match(/\*\*Threat level:\*\*\s*(.+)/)?.[1] ||
        section.body.match(/\*\*Threat level:\*\*\s*(.+)/)?.[1] ||
        "";
      const opportunity =
        body.match(/\*\*Opportunity:\*\*\s*(.+)/)?.[1] ||
        section.body.match(/\*\*Opportunity:\*\*\s*(.+)/)?.[1] ||
        "";
      return {
        title,
        summary: excerpt(body, 2),
        bullets: [
          threat ? `Threat: ${cleanInline(threat)}` : "",
          opportunity ? `Opportunity: ${cleanInline(opportunity)}` : "",
        ].filter(Boolean),
        threat: threat ? cleanInline(threat) : undefined,
        opportunity: opportunity ? cleanInline(opportunity) : undefined,
      };
    });
}

function parseSalesPositioningDoc(doc: DocHandle): IntelCard[] {
  const battlecardBody =
    findSectionBody(doc.content, 2, /quick-draw battlecard/i) || doc.content;
  return splitSections(battlecardBody, 3)
    .slice(0, 5)
    .map((section) => {
      const labels = parseNamedLines(section.body);
      return {
        title: cleanInline(section.title),
        summary: labels["Lead with"] || excerpt(stripNamedLines(section.body), 2),
        bullets: [
          labels["Acknowledge"] ? `Acknowledge: ${labels["Acknowledge"]}` : "",
          labels["Kill shot"] ? `Kill shot: ${labels["Kill shot"]}` : "",
        ].filter(Boolean),
      };
    });
}

function parseFeatureRadarDoc(doc: DocHandle): IntelCard {
  const ideasBody = findSectionBody(doc.content, 2, /feature ideas/i) || doc.content;
  const topIdea = splitSections(ideasBody, 3)[0];
  const labels = parseNamedLines(topIdea?.body || "");
  const impact = excerpt(findSectionBody(doc.content, 2, /impact statement/i) || "", 2);
  return {
    title: cleanInline(topIdea?.title || "Top feature radar item"),
    summary: excerpt(stripNamedLines(topIdea?.body || doc.content), 2),
    bullets: [
      labels["Classification"] ? `Classification: ${labels["Classification"]}` : "",
      labels["Signal source"] ? `Signal: ${labels["Signal source"]}` : "",
    ].filter(Boolean),
    impact: impact || undefined,
  };
}

function parseDemoIdeaDoc(doc: DocHandle): IntelCard {
  const topDemo = splitSections(doc.content, 3)[0];
  const labels = parseNamedLines(topDemo?.body || "");
  return {
    title: cleanInline(topDemo?.title || "Demo idea"),
    summary: labels["Tagline"] || excerpt(stripNamedLines(topDemo?.body || doc.content), 2),
    bullets: [
      labels["Target persona"] ? `Persona: ${labels["Target persona"]}` : "",
      labels["Sales angle"] ? `Sales angle: ${labels["Sales angle"]}` : "",
      labels['The "wow moment"'] ? `Wow moment: ${labels['The "wow moment"']}` : "",
    ].filter(Boolean),
  };
}

function parseDigestDoc(
  digestDoc: DocHandle | null,
  regimeDoc: DocHandle | null
): MarketLandingFeed["digest"] {
  if (!digestDoc && !regimeDoc) {
    return {
      regimeSummary: null,
      topSignals: [],
      crossVerticalAlertSummary: null,
      pipelineHealthSummary: null,
    };
  }

  const regimeSummary =
    (regimeDoc &&
      excerpt(findSectionBody(regimeDoc.content, 2, /regime classification/i) || "", 2)) ||
    (digestDoc &&
      excerpt(findSectionBody(digestDoc.content, 2, /regime status/i) || "", 2)) ||
    null;

  const topSignalsSource =
    (regimeDoc && (findSectionBody(regimeDoc.content, 2, /signal readings/i) || "")) ||
    (digestDoc && (findSectionBody(digestDoc.content, 2, /top signals/i) || "")) ||
    "";

  return {
    regimeSummary,
    topSignals: firstSentenceBullets(topSignalsSource, 4),
    crossVerticalAlertSummary:
      (digestDoc &&
        excerpt(findSectionBody(digestDoc.content, 2, /cross-vertical alerts/i) || "", 2)) ||
      null,
    pipelineHealthSummary:
      (digestDoc &&
        excerpt(findSectionBody(digestDoc.content, 2, /pipeline health/i) || "", 3)) ||
      null,
  };
}

function parseHealthNotesFromReport(doc: DocHandle): string[] {
  const summary = findSectionBody(doc.content, 2, /summary/i) || "";
  return parseMarkdownTable(summary)
    .filter((row) => row.Item?.startsWith("DB —"))
    .map((row) => `${row.Item.replace(/^DB —\s*/, "")}: ${row.Status}`);
}

function parseBuildPromptCard(
  promptDoc: DocHandle,
  cardRow: Record<string, string> | undefined,
  repoRoot: string
): BuildQueueCard {
  const heading = cleanInline(promptDoc.content.split(/\r?\n/)[0].replace(/^#\s*FEATURE:\s*/, ""));
  const labels = parseNamedLines(promptDoc.content);
  const summary = excerpt(findSectionBody(promptDoc.content, 3, /what it does/i) || promptDoc.content, 2);
  const whyItMatters = excerpt(
    findSectionBody(promptDoc.content, 3, /why this exists/i) || promptDoc.content,
    2
  );
  const priority =
    cardRow?.Priority ||
    labels["Priority Score"]?.match(/^\d+/)?.[0] ||
    "—";
  const status = resolveBuildStatus(heading, repoRoot);

  return {
    id: cardRow?.["Card ID"] || heading.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title: heading,
    priority,
    estimatedEffort: cardRow?.["Est. Hours"] || undefined,
    status,
    summary,
    whyItMatters,
    segment: cardRow?.Segment || undefined,
    crossVertical: cardRow?.["Cross-Vertical"] || undefined,
    promptPath: promptDoc.repoPath,
  };
}

function resolveBuildStatus(title: string, repoRoot: string): "shipped" | "planned" {
  const normalized = title.toLowerCase();
  if (normalized.includes("regime classifier")) {
    const frontendExists = existsSync(
      path.join(repoRoot, "repo-b", "src", "components", "market", "RegimeClassifierWidget.tsx")
    );
    const backendExists =
      existsSync(path.join(repoRoot, "backend", "app", "routes", "market_regime.py")) &&
      existsSync(path.join(repoRoot, "backend", "app", "services", "market_regime_engine.py"));
    return frontendExists && backendExists ? "shipped" : "planned";
  }
  if (normalized.includes("rwa tokenization")) {
    return existsSync(path.join(repoRoot, "repo-b", "src", "components", "market", "RWAMonitorPanel.tsx"))
      ? "shipped"
      : "planned";
  }
  if (normalized.includes("volatility surface")) {
    return existsSync(path.join(repoRoot, "repo-b", "src", "components", "market", "VolSurfaceViewer.tsx"))
      ? "shipped"
      : "planned";
  }
  return "planned";
}

export async function getMarketLandingFeed(): Promise<MarketLandingFeed> {
  const repoRoot = resolveRepoRoot();
  const feed = createEmptyFeed();
  const sources: SourceRef[] = [];
  const sourceHealthNotes: string[] = [];

  const manifestDoc = await readRepoFile(repoRoot, "docs/LATEST.md");
  const manifestRefs = manifestDoc ? extractManifestRefs(manifestDoc.content) : [];
  if (manifestDoc) {
    addSource(sources, "Autonomous manifest", manifestDoc.repoPath);
  } else {
    sourceHealthNotes.push("docs/LATEST.md is missing; latest-doc precedence fell back to directory sorting.");
  }

  const environmentHealthSection = manifestDoc
    ? findSectionBody(manifestDoc.content, 2, /environment health/i)
    : null;
  const manifestMarketSection = manifestDoc
    ? findSectionBody(manifestDoc.content, 2, /market rotation engine/i)
    : null;
  const manifestEnvironmentLines = parseNamedLines(environmentHealthSection || "");
  const manifestMarketLines = parseNamedLines(manifestMarketSection || "");

  const regimeDoc = await pickLatestDoc(repoRoot, manifestRefs, {
    fallbackDirs: ["docs/market-intelligence"],
    filter: (repoPath) => repoPath.includes("/market-intelligence/") && /regime/i.test(path.basename(repoPath)),
  });
  if (regimeDoc) {
    addSource(sources, "Regime report", regimeDoc.repoPath);
  } else {
    sourceHealthNotes.push("Market regime report missing; status falls back to manifest and digest copy.");
  }

  const rotationDoc = await pickLatestDoc(repoRoot, manifestRefs, {
    fallbackDirs: ["docs/market-intelligence"],
    filter: (repoPath) => repoPath.includes("/market-intelligence/") && /rotation/i.test(path.basename(repoPath)),
  });
  if (rotationDoc) {
    addSource(sources, "Rotation scheduler output", rotationDoc.repoPath);
  } else {
    sourceHealthNotes.push("Rotation selection file missing; targets fall back to manifest summary.");
  }

  const digestDoc = await pickLatestDoc(repoRoot, manifestRefs, {
    fallbackDirs: ["docs/market-digests"],
    filter: (repoPath) =>
      repoPath.includes("/market-digests/") &&
      !repoPath.includes("/health/") &&
      /market-digest/i.test(path.basename(repoPath)),
  });
  if (digestDoc) {
    addSource(sources, "Market digest", digestDoc.repoPath);
  } else {
    sourceHealthNotes.push("Market digest missing; pipeline narrative falls back to manifest bullets.");
  }

  const healthDoc = await pickLatestDoc(repoRoot, manifestRefs, {
    fallbackDirs: ["docs/market-digests/health"],
    filter: (repoPath) => repoPath.includes("/market-digests/health/"),
  });
  if (healthDoc) {
    addSource(sources, "Market health report", healthDoc.repoPath, "fallback");
    sourceHealthNotes.push(...parseHealthNotesFromReport(healthDoc));
  } else {
    sourceHealthNotes.push("Market health report missing; cold-start DB notes were inferred from the digest.");
  }

  const dailyIntelDoc = await pickLatestDoc(repoRoot, manifestRefs, {
    fallbackDirs: ["docs/daily-intel"],
    filter: (repoPath) => repoPath.includes("/daily-intel/"),
  });
  if (dailyIntelDoc) {
    addSource(sources, "Daily intelligence brief", dailyIntelDoc.repoPath);
    try {
      feed.dailyIntel = parseDailyIntelDoc(dailyIntelDoc);
    } catch {
      feed.dailyIntel = fallbackIntelCard("Daily intelligence brief", dailyIntelDoc);
      sourceHealthNotes.push(`Could not fully parse ${dailyIntelDoc.repoPath}; showing excerpt.`);
    }
  } else {
    sourceHealthNotes.push("Daily intelligence brief missing.");
  }

  const competitorDoc = await pickLatestDoc(repoRoot, manifestRefs, {
    manifestPrefixes: [
      "docs/competitor-research/daily-summary/",
      "docs/competitor-tracking/",
    ],
    fallbackDirs: [
      "docs/competitor-research/daily-summary",
      "docs/competitor-tracking",
    ],
    filter: (repoPath) =>
      repoPath.includes("/competitor-research/daily-summary/") ||
      repoPath.includes("/competitor-tracking/"),
  });
  if (competitorDoc) {
    addSource(sources, "Competitor watch", competitorDoc.repoPath);
    try {
      feed.competitorWatch = parseCompetitorDoc(competitorDoc).slice(0, 3);
    } catch {
      feed.competitorWatch = [fallbackIntelCard("Competitor watch", competitorDoc)];
      sourceHealthNotes.push(`Could not fully parse ${competitorDoc.repoPath}; showing excerpt.`);
    }
  } else {
    sourceHealthNotes.push("Competitor watch source missing.");
  }

  const salesDoc = await pickLatestDoc(repoRoot, manifestRefs, {
    fallbackDirs: ["docs/sales-positioning"],
    filter: (repoPath) => repoPath.includes("/sales-positioning/"),
  });
  if (salesDoc) {
    addSource(sources, "Sales positioning", salesDoc.repoPath);
    try {
      feed.salesPositioning = parseSalesPositioningDoc(salesDoc).slice(0, 4);
    } catch {
      feed.salesPositioning = [fallbackIntelCard("Sales positioning", salesDoc)];
      sourceHealthNotes.push(`Could not fully parse ${salesDoc.repoPath}; showing excerpt.`);
    }
  } else {
    sourceHealthNotes.push("Sales positioning guide missing.");
  }

  const featureRadarDoc = await pickLatestDoc(repoRoot, manifestRefs, {
    manifestPrefixes: ["docs/feature-radar/"],
    fallbackDirs: ["docs/feature-radar"],
    filter: (repoPath) =>
      repoPath.includes("/feature-radar/") &&
      extractDate(repoPath) !== null &&
      !repoPath.includes("competitor-derived") &&
      !repoPath.includes("context-aware"),
  });
  if (featureRadarDoc) {
    addSource(sources, "Feature radar", featureRadarDoc.repoPath);
    try {
      feed.featureRadar = parseFeatureRadarDoc(featureRadarDoc);
    } catch {
      feed.featureRadar = fallbackIntelCard("Feature radar", featureRadarDoc);
      sourceHealthNotes.push(`Could not fully parse ${featureRadarDoc.repoPath}; showing excerpt.`);
    }
  } else {
    sourceHealthNotes.push("Feature radar source missing.");
  }

  const demoDoc = await pickLatestDoc(repoRoot, manifestRefs, {
    fallbackDirs: ["docs/demo-ideas"],
    filter: (repoPath) =>
      repoPath.includes("/demo-ideas/") &&
      extractDate(repoPath) !== null &&
      !repoPath.includes("competitor-derived"),
  });
  if (demoDoc) {
    addSource(sources, "Demo ideas", demoDoc.repoPath);
    try {
      feed.demoAngle = parseDemoIdeaDoc(demoDoc);
    } catch {
      feed.demoAngle = fallbackIntelCard("Demo ideas", demoDoc);
      sourceHealthNotes.push(`Could not fully parse ${demoDoc.repoPath}; showing excerpt.`);
    }
  } else {
    sourceHealthNotes.push("Demo ideas source missing.");
  }

  const buildPromptsDoc = await pickLatestDoc(repoRoot, manifestRefs, {
    fallbackDirs: ["docs/market-features"],
    filter: (repoPath) => repoPath.includes("/market-features/") && /build-prompts/i.test(repoPath),
  });
  if (buildPromptsDoc) {
    addSource(sources, "Build prompts summary", buildPromptsDoc.repoPath);
  } else {
    sourceHealthNotes.push("Market feature build summary missing.");
  }

  const promptDocs = (
    await Promise.all([
      pickLatestDoc(repoRoot, manifestRefs, {
        fallbackDirs: ["docs/market-features/prompts"],
        filter: (repoPath) => /multi-asset-regime-classifier-dashboard/i.test(repoPath),
      }),
      pickLatestDoc(repoRoot, manifestRefs, {
        fallbackDirs: ["docs/market-features/prompts"],
        filter: (repoPath) => /rwa-tokenization-pipeline-monitor/i.test(repoPath),
      }),
      pickLatestDoc(repoRoot, manifestRefs, {
        fallbackDirs: ["docs/market-features/prompts"],
        filter: (repoPath) => /volatility-surface-viewer-skew-monitor/i.test(repoPath),
      }),
    ])
  ).filter((doc): doc is DocHandle => Boolean(doc));

  const buildPromptRows = buildPromptsDoc
    ? parseMarkdownTable(findSectionBody(buildPromptsDoc.content, 2, /cards converted today/i) || "")
    : [];
  const buildPromptMap = new Map(
    buildPromptRows.map((row) => [normalizeHeading(row.Title || ""), row])
  );

  if (promptDocs.length > 0) {
    promptDocs.forEach((promptDoc) =>
      addSource(sources, `Build card — ${cleanInline(promptDoc.content.split(/\r?\n/)[0])}`, promptDoc.repoPath)
    );
    feed.buildQueue = promptDocs.map((promptDoc) =>
      parseBuildPromptCard(
        promptDoc,
        buildPromptMap.get(
          normalizeHeading(
            cleanInline(promptDoc.content.split(/\r?\n/)[0].replace(/^#\s*FEATURE:\s*/, ""))
          )
        ),
        repoRoot
      )
    );
  } else {
    sourceHealthNotes.push("Prompt specs missing; planned build queue could not be reconstructed.");
  }

  if (rotationDoc) {
    try {
      feed.rotation = parseRotationDoc(rotationDoc);
    } catch {
      feed.rotation = {
        nextStep: null,
        summary: excerpt(rotationDoc.content, 2) || null,
        selectedSegments: [],
      };
      sourceHealthNotes.push(`Could not fully parse ${rotationDoc.repoPath}; showing excerpt.`);
    }
  }

  feed.digest = parseDigestDoc(digestDoc, regimeDoc);

  const regimeLabels = parseNamedLines(regimeDoc?.content || "");
  const manifestRegime = manifestMarketLines["Regime"] || "";
  const regimeMatch = manifestRegime.match(/^([^()]+)(?:\(([^)]+)\))?/);
  const engineLine = manifestEnvironmentLines["Market Intelligence Engine"] || "";
  const engineStatus =
    cleanInline(engineLine.split("—")[0] || engineLine.split("-")[0] || "").replace(/:$/, "") ||
    cleanInline(manifestMarketLines["Pipeline status"]?.split("—")[0] || "") ||
    "Provisioned";

  feed.status.engineStatus = engineStatus;
  feed.status.regimeLabel =
    regimeLabels.Classification ||
    cleanInline(regimeMatch?.[1] || "") ||
    "Unknown";
  feed.status.confidenceText =
    regimeLabels.Confidence ||
    cleanInline(regimeMatch?.[2] || "") ||
    "Confidence pending first live sweep";
  feed.status.latestDigestDate =
    digestDoc?.date ||
    extractDate(manifestMarketLines["Latest digest"] || "") ||
    null;
  feed.status.pipelineState =
    manifestMarketLines["Pipeline status"] ||
    feed.digest.pipelineHealthSummary ||
    "Pipeline state not documented yet.";

  if (feed.rotation.selectedSegments.length === 0) {
    const manifestTargets = cleanInline(manifestMarketLines["First rotation targets"] || "");
    if (manifestTargets) {
      feed.rotation.selectedSegments = manifestTargets
        .split(",")
        .map((name) => ({ name: name.trim() }))
        .filter((target) => target.name);
      feed.rotation.summary =
        feed.rotation.summary ||
        "Targets reconstructed from the manifest because the scheduler output was missing.";
    }
  }

  if (!feed.digest.crossVerticalAlertSummary) {
    feed.digest.crossVerticalAlertSummary =
      cleanInline(manifestMarketLines["Cross-vertical alerts"] || "") || null;
  }

  if (feed.buildQueue.length === 0 && buildPromptsDoc) {
    feed.buildQueue = [
      {
        id: "market-build-summary",
        title: "Market build queue",
        priority: "—",
        status: "planned",
        summary: excerpt(buildPromptsDoc.content, 3),
        whyItMatters: "Build prompt summary was present, but individual prompt specs were missing.",
      },
    ];
  }

  if (
    !regimeDoc &&
    !rotationDoc &&
    !digestDoc &&
    !dailyIntelDoc &&
    !competitorDoc &&
    !salesDoc &&
    !featureRadarDoc &&
    !demoDoc &&
    !buildPromptsDoc
  ) {
    sourceHealthNotes.push("No market intelligence markdown artifacts were found. UI should fall back to live DB widgets.");
  }

  feed.status.sourceHealthNotes = Array.from(new Set(sourceHealthNotes.filter(Boolean)));
  feed.sources = sources;
  feed.generatedAt = new Date().toISOString();

  return feed;
}
