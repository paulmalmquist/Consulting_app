type ProofBullet = {
  icon: string;
  title: string;
};

type ProofBulletsProps = {
  items: ProofBullet[];
};

export function ProofBullets({ items }: ProofBulletsProps) {
  const getBadgeLetters = (title: string) => {
    const words = title
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(Boolean);

    if (words.length === 0) {
      return 'N';
    }

    // Keep badges compact and legible (AI, IO, FA, etc.).
    return words
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
  };

  return (
    <ul className="grid gap-6 md:grid-cols-3">
      {items.map((item) => (
        <li key={item.title} className="rounded-2xl border border-nv-text/8 bg-nv-bg/70 p-8 shadow-sm">
          <div className="mb-4 inline-flex">
            <span className="nv-mark-badge nv-mark-badge--word">{getBadgeLetters(item.title)}</span>
          </div>
          <div className="text-lg font-semibold uppercase tracking-[0.08em] text-nv-text">{item.title}</div>
        </li>
      ))}
    </ul>
  );
}
