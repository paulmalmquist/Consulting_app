import React, { useMemo, useState } from "react";

export interface LedgerRow {
  id: string;
  type: string;
  amount: number;
}

interface CapitalLedgerProps {
  rows: LedgerRow[];
}

export function CapitalLedger({ rows }: CapitalLedgerProps) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const filtered = useMemo(
    () => (typeFilter === "all" ? rows : rows.filter((row) => row.type === typeFilter)),
    [rows, typeFilter]
  );

  return (
    <section data-testid="capital-ledger">
      <select data-testid="ledger-filter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
        <option value="all">all</option>
        <option value="call">call</option>
        <option value="distribution">distribution</option>
      </select>
      <table>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.id} data-testid="ledger-row">
              <td>{row.type}</td>
              <td>{row.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
