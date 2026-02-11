"use client";

import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface Props {
  deptKey: string;
  capKey: string;
  capLabel: string;
}

const MOCK_FIELDS = [
  { label: "Title", type: "text", placeholder: "Enter title..." },
  { label: "Category", type: "select", placeholder: "Select category" },
  { label: "Priority", type: "select", placeholder: "Select priority" },
  { label: "Description", type: "textarea", placeholder: "Describe in detail..." },
  { label: "Attachments", type: "file", placeholder: "Drop files here or browse" },
];

export default function FormStub({ capLabel }: Props) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{capLabel}</h1>
        <Badge variant="accent">Form</Badge>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          {MOCK_FIELDS.map((field) => (
            <div key={field.label}>
              <label className="block text-sm text-bm-muted mb-1.5">{field.label}</label>
              {field.type === "textarea" ? (
                <div className="h-24 bg-bm-surface/40 border border-bm-border/60 rounded-lg px-3 py-2 flex items-start">
                  <span className="text-bm-muted2 text-sm">{field.placeholder}</span>
                </div>
              ) : field.type === "file" ? (
                <div className="h-20 bg-bm-surface/30 border-2 border-dashed border-bm-border/60 rounded-lg flex items-center justify-center">
                  <span className="text-bm-muted2 text-sm">{field.placeholder}</span>
                </div>
              ) : field.type === "select" ? (
                <div className="h-10 bg-bm-surface/40 border border-bm-border/60 rounded-lg px-3 flex items-center justify-between">
                  <span className="text-bm-muted2 text-sm">{field.placeholder}</span>
                  <span className="text-bm-muted2 text-xs">▼</span>
                </div>
              ) : (
                <div className="h-10 bg-bm-surface/40 border border-bm-border/60 rounded-lg px-3 flex items-center">
                  <span className="text-bm-muted2 text-sm">{field.placeholder}</span>
                </div>
              )}
            </div>
          ))}

          {/* Submit button placeholder */}
          <div className="pt-2">
            <div className="h-10 bg-bm-accent/20 border border-bm-accent/40 rounded-lg flex items-center justify-center">
              <span className="text-sm font-medium text-bm-accent">Submit</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
