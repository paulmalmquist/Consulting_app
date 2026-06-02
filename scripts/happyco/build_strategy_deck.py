from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path
from typing import Any

import win32com.client


ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services import operator_property_ops as property_ops  # noqa: E402


PURPLE = "35146B"
VIOLET = "5430C0"
MINT = "C6F4DF"
MINT_2 = "DDF8EF"
CREAM = "FBFAF7"
INK = "241437"
MUTED = "6F6590"
LINE = "DDD8EA"
RISK = "C83D5A"
AMBER = "C88928"
GREEN = "21805C"
WHITE = "FFFFFF"


def _rgb(hex_value: str) -> int:
    value = hex_value.strip("#")
    r = int(value[0:2], 16)
    g = int(value[2:4], 16)
    b = int(value[4:6], 16)
    return r + (g * 256) + (b * 65536)


def _json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _add_text(slide, text: str, x: float, y: float, w: float, h: float, *, size: int = 16, color: str = INK, bold: bool = False):
    box = slide.Shapes.AddTextbox(1, x, y, w, h)
    frame = box.TextFrame
    frame.MarginLeft = 0
    frame.MarginRight = 0
    frame.MarginTop = 0
    frame.MarginBottom = 0
    frame.TextRange.Text = text
    frame.TextRange.Font.Name = "Aptos"
    frame.TextRange.Font.Size = size
    frame.TextRange.Font.Bold = -1 if bold else 0
    frame.TextRange.Font.Color.RGB = _rgb(color)
    return box


def _add_rect(slide, text: str, x: float, y: float, w: float, h: float, *, fill: str = WHITE, line: str = LINE, color: str = INK, size: int = 13, bold: bool = False, radius: bool = True):
    shape_type = 5 if radius else 1
    shape = slide.Shapes.AddShape(shape_type, x, y, w, h)
    shape.Fill.ForeColor.RGB = _rgb(fill)
    shape.Line.ForeColor.RGB = _rgb(line)
    shape.Line.Weight = 1
    frame = shape.TextFrame
    frame.MarginLeft = 10
    frame.MarginRight = 10
    frame.MarginTop = 8
    frame.MarginBottom = 8
    frame.TextRange.Text = text
    frame.TextRange.Font.Name = "Aptos"
    frame.TextRange.Font.Size = size
    frame.TextRange.Font.Bold = -1 if bold else 0
    frame.TextRange.Font.Color.RGB = _rgb(color)
    return shape


def _add_line(slide, x1: float, y1: float, x2: float, y2: float, *, color: str = VIOLET, weight: float = 2.0):
    line = slide.Shapes.AddLine(x1, y1, x2, y2)
    line.Line.ForeColor.RGB = _rgb(color)
    line.Line.Weight = weight
    try:
        line.Line.EndArrowheadStyle = 3
    except Exception:
        pass
    return line


def _add_header(slide, section: str, title: str, *, subtitle: str | None = None):
    _add_text(slide, section.upper(), 36, 28, 300, 16, size=9, color=VIOLET, bold=True)
    _add_text(slide, title, 36, 48, 560, 52, size=27, color=PURPLE, bold=True)
    if subtitle:
        _add_text(slide, subtitle, 38, 104, 520, 34, size=11, color=MUTED)
    _add_text(slide, "Synthetic demo proof - not HappyCo production data", 688, 28, 240, 16, size=8, color=MUTED)


def _add_footer(slide, slide_no: int):
    _add_text(slide, f"HappyCo Property Ops Intelligence Kit | {slide_no:02d}", 36, 516, 260, 12, size=8, color=MUTED)


def _new_slide(prs, section: str, title: str, *, subtitle: str | None = None):
    slide = prs.Slides.Add(prs.Slides.Count + 1, 12)
    slide.FollowMasterBackground = False
    slide.Background.Fill.ForeColor.RGB = _rgb(CREAM)
    _add_header(slide, section, title, subtitle=subtitle)
    _add_footer(slide, prs.Slides.Count)
    return slide


def _title_slide(prs):
    slide = prs.Slides.Add(1, 12)
    slide.FollowMasterBackground = False
    slide.Background.Fill.ForeColor.RGB = _rgb(CREAM)
    _add_rect(slide, "HappyCo", 36, 34, 116, 34, fill=MINT, line=MINT, color=PURPLE, size=16, bold=True)
    _add_text(slide, "Property Ops\nIntelligence Kit", 36, 110, 430, 112, size=42, color=PURPLE, bold=True)
    _add_text(
        slide,
        "A Head of Data proof package: canonical property model, entity graph, benchmarking, ML risk model, AI recommendations, and artifact automation.",
        40,
        242,
        560,
        72,
        size=17,
        color=INK,
    )
    _add_rect(slide, "Live Winston demo\nFixture-backed, deterministic, gated", 636, 92, 252, 88, fill=WHITE, line=LINE, color=INK, size=15, bold=True)
    _add_rect(slide, "Artifacts\nExcel + PowerPoint + Outlook params", 636, 204, 252, 88, fill=WHITE, line=LINE, color=INK, size=15, bold=True)
    _add_rect(slide, "ML proof\nDatabricks-ready notebook + local fallback", 636, 316, 252, 88, fill=WHITE, line=LINE, color=INK, size=15, bold=True)
    _add_text(slide, "Synthetic demo data. No private recruiter or HappyCo production data.", 40, 454, 620, 24, size=11, color=MUTED)
    _add_footer(slide, 1)


def _problem_slide(prs, dataset: dict[str, Any]):
    slide = _new_slide(prs, "Why this role matters", "The data problem is operational fragmentation, not reporting polish")
    facts = [
        ("5", "Properties", "operators, sites, buildings, units"),
        ("150", "Work orders", "repeat, reopened, vendor-linked"),
        ("120", "Inspection findings", "severity-scored deficiencies"),
        ("24", "Messy source records", "entity resolution queue"),
    ]
    for idx, (value, label, note) in enumerate(facts):
        x = 46 + idx * 218
        _add_rect(slide, f"{value}\n{label}\n{note}", x, 152, 182, 116, fill=WHITE, line=LINE, color=PURPLE, size=15, bold=True)
    _add_rect(
        slide,
        "Head of Data thesis\n\nUnify the operational graph first. Benchmarking, AI recommendations, retrieval, APIs, and ML workflows become credible only when the canonical entity layer is trustworthy.",
        68,
        318,
        800,
        118,
        fill=MINT_2,
        line=MINT,
        color=INK,
        size=17,
        bold=True,
    )


def _canonical_slide(prs):
    slide = _new_slide(prs, "Canonical model", "Entity resolution turns messy property records into product-grade objects")
    sources = ["Property PMS", "Inspection app", "CMMS export", "Vendor roster", "Resident ops"]
    entities = ["Operator", "Property", "Building", "Unit", "Inspection", "Finding", "Work Order", "Vendor"]
    for idx, source in enumerate(sources):
        _add_rect(slide, source, 46, 142 + idx * 55, 150, 34, fill=WHITE, line=LINE, color=INK, size=12, bold=True)
        _add_line(slide, 198, 159 + idx * 55, 282, 250)
    _add_rect(slide, "Resolution policy\nexact_external_id\nnormalized_address\nfuzzy_name\ngeospatial placeholder\ntemporal proximity\nmanual review", 282, 166, 210, 174, fill=MINT_2, line=MINT, color=PURPLE, size=13, bold=True)
    for idx, entity in enumerate(entities):
        x = 560 + (idx % 2) * 164
        y = 132 + (idx // 2) * 58
        _add_rect(slide, entity, x, y, 138, 36, fill=WHITE, line=LINE, color=INK, size=12, bold=True)
        _add_line(slide, 492, 252, x, y + 18, color=VIOLET, weight=1.4)
    _add_text(slide, "Output: stable IDs, match confidence, match reasons, and human-review flags before downstream analytics.", 560, 384, 304, 52, size=13, color=MUTED)


def _architecture_slide(prs):
    slide = _new_slide(prs, "Architecture", "Source systems feed a canonical graph that powers analytics, APIs, AI, and artifacts")
    stages = [
        ("Operational sources", "PMS\nInspections\nCMMS\nVendors\nResident ops"),
        ("Canonical model", "Entity IDs\nResolution\nData contracts"),
        ("Property graph", "Property - Unit\nFinding - WO\nVendor - Risk"),
        ("Warehouse", "Gold metrics\nBenchmarks\nFeature tables"),
        ("Product APIs", "Entities\nGraph\nBenchmarks\nML risk"),
        ("AI workflows", "Evidence-backed\nrecommendations\nretrieval"),
        ("Artifacts", "Excel\nPowerPoint\nEmail\nMicrosite"),
    ]
    for idx, (title, body) in enumerate(stages):
        x = 34 + idx * 129
        fill = MINT if idx in {1, 2, 5} else WHITE
        _add_rect(slide, f"{title}\n\n{body}", x, 166, 112, 138, fill=fill, line=LINE, color=PURPLE, size=11, bold=True)
        if idx < len(stages) - 1:
            _add_line(slide, x + 112, 235, x + 129, 235, color=PURPLE, weight=2.4)
    _add_rect(slide, "Control plane: invite gate, synthetic-data caveats, dry-run automation, model card, registry record, receipts", 104, 360, 744, 58, fill=WHITE, line=LINE, color=INK, size=15, bold=True)


def _benchmark_ai_slide(prs):
    slide = _new_slide(prs, "Benchmarking + AI", "Recommendations are only credible when every claim points back to evidence")
    recs = property_ops.recommendations_with_ml()["recommendations"]
    rec = recs[0]
    _add_rect(slide, rec["title"], 52, 146, 406, 54, fill=MINT, line=MINT, color=PURPLE, size=17, bold=True)
    _add_text(slide, rec["recommendation"], 58, 216, 394, 96, size=13, color=INK)
    _add_rect(slide, f"Risk level: {rec['risk_level']}\nConfidence: {rec['confidence']}\nHuman review: {rec['human_review_required']}", 58, 332, 300, 72, fill=WHITE, line=LINE, color=INK, size=13, bold=True)
    evidence = rec.get("evidence", [])[:5]
    for idx, item in enumerate(evidence):
        _add_rect(slide, item["statement"], 510, 134 + idx * 61, 358, 42, fill=WHITE, line=LINE, color=INK, size=12)
    _add_text(slide, "Pattern: benchmark signal + graph context + ML score + evidence IDs -> product-safe recommendation.", 510, 454, 360, 28, size=12, color=MUTED)


def _ml_slide(prs, ml_metrics: dict[str, Any]):
    slide = _new_slide(prs, "Databricks + ML proof", "Predictive maintenance risk is framed as a feature pipeline, not a black box")
    flow = [
        "Bronze extracts",
        "Silver canonical ops",
        "Gold benchmark features",
        "Logistic model",
        "Batch predictions",
        "Product/API risk signal",
    ]
    for idx, step in enumerate(flow):
        x = 52 + idx * 143
        _add_rect(slide, step, x, 154, 120, 48, fill=MINT if idx in {2, 3} else WHITE, line=LINE, color=PURPLE, size=11, bold=True)
        if idx < len(flow) - 1:
            _add_line(slide, x + 120, 178, x + 143, 178, color=PURPLE)
    metrics = [
        ("Rows", ml_metrics.get("total_rows", "N/A")),
        ("Accuracy", ml_metrics.get("accuracy", "N/A")),
        ("ROC AUC", ml_metrics.get("roc_auc", "N/A")),
        ("Backend", ml_metrics.get("training_backend", "not_available")),
    ]
    for idx, (label, value) in enumerate(metrics):
        _add_rect(slide, f"{label}\n{value}", 62 + idx * 204, 262, 166, 72, fill=WHITE, line=LINE, color=PURPLE, size=15, bold=True)
    _add_rect(
        slide,
        "Model honesty rule\nSynthetic labels can be partially separable. Metrics are proof that the pipeline runs, not expected production performance. The model card and registry record carry this caveat.",
        72,
        376,
        790,
        74,
        fill=RISK,
        line=RISK,
        color=WHITE,
        size=15,
        bold=True,
    )


def _ninety_day_slide(prs):
    slide = _new_slide(prs, "Execution plan", "First 90 days: stabilize the data spine, then scale product intelligence")
    columns = [
        ("First 30", "Map source systems\nDefine canonical IDs\nResolution policy\nData quality scorecard"),
        ("Days 31-60", "Gold benchmark tables\nProperty graph APIs\nModel feature table\nHuman-review workflow"),
        ("Days 61-90", "ML lifecycle pattern\nAI recommendation pilots\nExecutive metric pack\nScale data contracts"),
    ]
    for idx, (title, body) in enumerate(columns):
        _add_rect(slide, f"{title}\n\n{body}", 62 + idx * 286, 150, 244, 240, fill=WHITE if idx != 1 else MINT_2, line=LINE, color=PURPLE, size=18, bold=True)
    _add_text(slide, "Operating posture: hands-on SQL/Python/data modeling, explicit product API contracts, and controlled automation receipts.", 76, 426, 760, 28, size=13, color=MUTED)


def _controls_slide(prs):
    slide = _new_slide(prs, "Risks + controls", "A data leader should show where the demo fails closed")
    controls = [
        ("Public exposure", "HappyCo package gated by invite code; generic public positioning only."),
        ("Model claims", "Synthetic metrics are caveated in model card, metrics JSON, deck, workbook, and UI."),
        ("Databricks", "Notebook is Databricks-ready; no live execution claim without CLI/job receipt."),
        ("Automation", "Outlook draft-only by default; Excel/PPT exports are parameter-driven local artifacts."),
        ("Entity resolution", "Human-review queue exists when match confidence is insufficient."),
    ]
    for idx, (risk, control) in enumerate(controls):
        y = 130 + idx * 67
        _add_rect(slide, risk, 56, y, 198, 42, fill=RISK if idx < 2 else WHITE, line=LINE, color=WHITE if idx < 2 else PURPLE, size=13, bold=True)
        _add_rect(slide, control, 276, y, 588, 42, fill=WHITE, line=LINE, color=INK, size=12)


def _demo_slide(prs):
    slide = _new_slide(prs, "Live proof", "The Winston operator page ties strategy to working product surfaces")
    items = [
        ("Executive Demo", "graph explorer, benchmarks, evidence-backed recommendation"),
        ("Data Flow", "bronze/silver/gold, graph, warehouse/API/product layer"),
        ("ML Risk Model", "risk band, top drivers, metrics, model caveat"),
        ("Automation Room", "Excel, PowerPoint, Outlook, microsite gates"),
        ("Build Log", "tickets, tests, generated artifacts, honest limitations"),
    ]
    for idx, (title, body) in enumerate(items):
        y = 126 + idx * 64
        _add_rect(slide, title, 64, y, 190, 40, fill=MINT if idx == 0 else WHITE, line=LINE, color=PURPLE, size=13, bold=True)
        _add_rect(slide, body, 282, y, 570, 40, fill=WHITE, line=LINE, color=INK, size=12)
    _add_text(slide, "Route: /lab/env/[envId]/operator/property-ops-intelligence", 66, 456, 650, 18, size=11, color=MUTED)


def _artifact_slide(prs):
    slide = _new_slide(prs, "Recruiter package", "The final package operates across product, architecture, Excel, PowerPoint, and email")
    artifacts = [
        ("Workbook", "HappyCo_Property_Ops_Model.xlsx\nGenerated local artifact; formulas/tables inspectable."),
        ("Deck", "HappyCo_90_Day_Data_Strategy.pptx\nThis strategy and architecture narrative."),
        ("Microsite", "Gated /happyco package\nTailored content only after invite code."),
        ("Outlook", "WinCOM params\nDraft-only by default; no private email in repo."),
    ]
    for idx, (title, body) in enumerate(artifacts):
        x = 70 + (idx % 2) * 404
        y = 150 + (idx // 2) * 138
        _add_rect(slide, f"{title}\n\n{body}", x, y, 330, 98, fill=MINT_2 if idx in {0, 1} else WHITE, line=LINE, color=PURPLE, size=15, bold=True)
    _add_rect(slide, "Close: this is demo-grade, not production-claimed. The value is showing the operating model and the hands-on path to production.", 104, 436, 744, 44, fill=MINT, line=MINT, color=PURPLE, size=14, bold=True)


def _architecture_svg(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    labels = [
        ("Operational Sources", "PMS / inspections / CMMS / vendors / resident ops"),
        ("Canonical Model", "entities, contracts, resolution policy"),
        ("Property Graph", "relationships + evidence links"),
        ("Warehouse", "benchmarks + gold metrics + features"),
        ("Product APIs", "entities / graph / benchmarks / ml-risk"),
        ("AI Workflows", "recommendations + retrieval"),
        ("Artifacts", "Excel / PowerPoint / Outlook / microsite"),
    ]
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="620" viewBox="0 0 1600 620">',
        f'<rect width="1600" height="620" fill="#{CREAM}"/>',
        f'<text x="60" y="70" font-family="Aptos, Arial" font-size="38" font-weight="700" fill="#{PURPLE}">HappyCo Property Ops Intelligence Architecture</text>',
        f'<text x="60" y="108" font-family="Aptos, Arial" font-size="18" fill="#{MUTED}">Synthetic proof pattern: source systems to canonical graph, warehouse, APIs, AI workflows, and recruiter artifacts.</text>',
    ]
    for idx, (title, body) in enumerate(labels):
        x = 60 + idx * 215
        fill = MINT if idx in {1, 2, 5} else WHITE
        parts.append(f'<rect x="{x}" y="210" width="170" height="150" rx="18" fill="#{fill}" stroke="#{LINE}" stroke-width="2"/>')
        parts.append(f'<text x="{x+16}" y="250" font-family="Aptos, Arial" font-size="20" font-weight="700" fill="#{PURPLE}">{title}</text>')
        parts.append(f'<foreignObject x="{x+16}" y="272" width="138" height="66"><div xmlns="http://www.w3.org/1999/xhtml" style="font:15px Aptos, Arial;color:#{INK};line-height:1.25">{body}</div></foreignObject>')
        if idx < len(labels) - 1:
            x1 = x + 170
            x2 = x + 207
            parts.append(f'<line x1="{x1}" y1="285" x2="{x2}" y2="285" stroke="#{PURPLE}" stroke-width="4" marker-end="url(#arrow)"/>')
    parts.append(
        f'<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L8,3 z" fill="#{PURPLE}"/></marker></defs>'
    )
    parts.append(f'<rect x="180" y="438" width="1240" height="76" rx="18" fill="#{WHITE}" stroke="#{LINE}" stroke-width="2"/>')
    parts.append(f'<text x="220" y="485" font-family="Aptos, Arial" font-size="22" font-weight="700" fill="#{INK}">Control plane: invite gate, synthetic-data caveats, dry-run automation, model card, model registry, and execution receipts.</text>')
    parts.append("</svg>")
    path.write_text("\n".join(parts), encoding="utf-8")


def build_deck(output_path: Path, architecture_path: Path, ml_root: Path) -> tuple[Path, Path]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    architecture_path.parent.mkdir(parents=True, exist_ok=True)
    dataset = property_ops.get_dataset()
    ml_metrics = _json(ml_root / "model_metrics.json")

    powerpoint = win32com.client.DispatchEx("PowerPoint.Application")
    powerpoint.Visible = True
    prs = powerpoint.Presentations.Add()
    prs.PageSetup.SlideWidth = 960
    prs.PageSetup.SlideHeight = 540

    try:
        _title_slide(prs)
        _problem_slide(prs, dataset)
        _canonical_slide(prs)
        _architecture_slide(prs)
        _benchmark_ai_slide(prs)
        _ml_slide(prs, ml_metrics)
        _ninety_day_slide(prs)
        _controls_slide(prs)
        _demo_slide(prs)
        _artifact_slide(prs)
        prs.SaveAs(str(output_path.resolve()))
    finally:
        prs.Close()
        powerpoint.Quit()

    _architecture_svg(architecture_path)
    validate_pptx(output_path)
    return output_path, architecture_path


def validate_pptx(path: Path) -> None:
    if not path.exists() or path.stat().st_size < 10_000:
        raise RuntimeError(f"Deck was not written or is unexpectedly small: {path}")
    with zipfile.ZipFile(path) as zf:
        slide_names = [name for name in zf.namelist() if name.startswith("ppt/slides/slide") and name.endswith(".xml")]
    if len(slide_names) != 10:
        raise RuntimeError(f"Expected 10 slides, found {len(slide_names)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the HappyCo 90-day data strategy deck.")
    parser.add_argument("--out", type=Path, default=ROOT / "artifacts" / "happyco" / "deck" / "HappyCo_90_Day_Data_Strategy.pptx")
    parser.add_argument("--architecture", type=Path, default=ROOT / "artifacts" / "happyco" / "architecture" / "happyco_property_ops_architecture.svg")
    parser.add_argument("--ml-root", type=Path, default=ROOT / "artifacts" / "happyco" / "ml")
    args = parser.parse_args()
    deck, architecture = build_deck(args.out, args.architecture, args.ml_root)
    print(f"Wrote {deck}")
    print(f"Wrote {architecture}")
    print("Validated PPTX package with 10 slides.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
