"use client";

import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface Props {
  deptKey: string;
  capKey: string;
  capLabel: string;
}

interface TreeNode {
  label: string;
  code?: string;
  children?: TreeNode[];
  expanded?: boolean;
}

const MOCK_TREE: TreeNode[] = [
  {
    label: "Assets",
    code: "1000",
    expanded: true,
    children: [
      {
        label: "Current Assets",
        code: "1100",
        expanded: true,
        children: [
          { label: "Cash & Equivalents", code: "1110" },
          { label: "Accounts Receivable", code: "1120" },
          { label: "Inventory", code: "1130" },
        ],
      },
      {
        label: "Fixed Assets",
        code: "1200",
        children: [
          { label: "Property & Equipment", code: "1210" },
          { label: "Accumulated Depreciation", code: "1220" },
        ],
      },
    ],
  },
  {
    label: "Liabilities",
    code: "2000",
    children: [
      {
        label: "Current Liabilities",
        code: "2100",
        children: [
          { label: "Accounts Payable", code: "2110" },
          { label: "Accrued Expenses", code: "2120" },
        ],
      },
    ],
  },
  {
    label: "Equity",
    code: "3000",
    children: [
      { label: "Common Stock", code: "3100" },
      { label: "Retained Earnings", code: "3200" },
    ],
  },
];

function TreeRow({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = node.expanded !== false;

  return (
    <>
      <div
        className="flex items-center gap-2 py-1.5 px-3 hover:bg-bm-surface/30 rounded transition-colors"
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
      >
        {hasChildren ? (
          <span className="text-xs text-bm-muted2 w-4 text-center">
            {isExpanded ? "▼" : "▶"}
          </span>
        ) : (
          <span className="w-4" />
        )}
        {node.code && (
          <span className="text-xs text-bm-muted2 font-mono w-12">{node.code}</span>
        )}
        <span className="text-sm">{node.label}</span>
      </div>
      {hasChildren &&
        isExpanded &&
        node.children!.map((child) => (
          <TreeRow key={child.label} node={child} depth={depth + 1} />
        ))}
    </>
  );
}

export default function TreeStub({ capLabel }: Props) {
  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{capLabel}</h1>
        <Badge variant="accent">Hierarchy View</Badge>
      </div>

      {/* Search bar */}
      <div className="h-9 bg-bm-surface/60 border border-bm-border/60 rounded-lg px-3 flex items-center">
        <span className="text-bm-muted2 text-sm">Search hierarchy...</span>
      </div>

      <Card>
        <CardContent className="p-3">
          {MOCK_TREE.map((node) => (
            <TreeRow key={node.label} node={node} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
