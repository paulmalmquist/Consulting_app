import Link from "next/link";

const REPORTS = [
  { key: "business-overview", title: "Business Overview Report", id: "R1" },
  { key: "department-health", title: "Department Health Report", id: "R2" },
  { key: "document-register", title: "Document Register Report", id: "R3" },
  { key: "document-compliance", title: "Document Compliance Report", id: "R4" },
  { key: "execution-ledger", title: "Execution Ledger Report", id: "R5" },
  { key: "template-adoption", title: "Template Adoption Report", id: "R6" },
  { key: "readiness", title: "Readiness / Coverage Report", id: "R7" },
];

export default function ReportsIndexPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">Reports</p>
        <h1 className="text-2xl font-bold">Operational Reporting</h1>
        <p className="text-sm text-bm-muted">Unified views across businesses, departments, documents, executions, and readiness.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {REPORTS.map((report) => (
          <Link
            key={report.key}
            href={`/app/reports/${report.key}`}
            data-testid={`report-nav-${report.key}`}
            className="bm-glass-interactive rounded-xl p-4 border border-bm-border/70 hover:border-bm-accent/35"
          >
            <p className="text-xs text-bm-muted2">{report.id}</p>
            <h2 className="text-lg font-semibold">{report.title}</h2>
          </Link>
        ))}
      </div>
    </div>
  );
}
