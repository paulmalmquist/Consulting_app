import ReactMarkdown from 'react-markdown';

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <article className="nv-prose">
      <ReactMarkdown>{content}</ReactMarkdown>
    </article>
  );
}
