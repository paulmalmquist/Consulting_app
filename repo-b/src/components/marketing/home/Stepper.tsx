type StepperProps = {
  steps: string[];
};

export function Stepper({ steps }: StepperProps) {
  return (
    <ol className="grid gap-4 md:grid-cols-2">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-4 rounded-2xl border border-nv-text/10 bg-nv-bg/40 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-[4px] border border-nv-teal/18 text-sm font-semibold text-nv-teal">
            {String(index + 1).padStart(2, '0')}
          </div>
          <p className="text-sm leading-relaxed text-nv-text">{step}</p>
        </li>
      ))}
    </ol>
  );
}
