const defaultItems = {
  inputs: ['Source records', 'Human requests', 'System events'],
  states: ['Intake', 'Review', 'Approve', 'Exception'],
  rules: ['Policy rules', 'Escalation thresholds', 'Approval rights'],
  outputs: ['Audit-ready report', 'Action queue', 'Compliance evidence']
};

export function ControlLayerDiagram({
  title = 'Control Layer',
  inputs = defaultItems.inputs,
  states = defaultItems.states,
  rules = defaultItems.rules,
  outputs = defaultItems.outputs
}: {
  title?: string;
  inputs?: string[];
  states?: string[];
  rules?: string[];
  outputs?: string[];
}) {
  const columns = [
    { label: 'Inputs', items: inputs },
    { label: 'Workflow States', items: states },
    { label: 'Rules', items: rules },
    { label: 'Outputs', items: outputs }
  ];

  return (
    <section className="rounded-3xl border border-nv-text/10 bg-nv-surface/60 p-6">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {columns.map((column) => (
          <article key={column.label} className="rounded-2xl border border-nv-text/10 bg-nv-bg/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-nv-teal">{column.label}</p>
            <ul className="mt-3 space-y-2 text-sm text-nv-text">
              {column.items.map((item) => (
                <li key={item} className="rounded-lg border border-nv-text/10 bg-nv-surface/50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
