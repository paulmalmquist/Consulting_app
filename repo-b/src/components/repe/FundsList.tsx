import React, { useMemo, useState } from "react";

export interface FundsListRow {
  id: string;
  name: string;
  strategy: string;
}

interface FundsListProps {
  rows: FundsListRow[];
}

export function FundsList({ rows }: FundsListProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.toLowerCase();
    return rows.filter((row) => row.name.toLowerCase().includes(term) || row.strategy.toLowerCase().includes(term));
  }, [rows, query]);

  return (
    <section data-testid="funds-list">
      <input
        data-testid="funds-filter"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search funds"
      />
      <p data-testid="funds-count">{filtered.length} funds</p>
      <ul>
        {filtered.map((row) => (
          <li key={row.id} data-testid="fund-row">{row.name} · {row.strategy}</li>
        ))}
      </ul>
    </section>
  );
}
