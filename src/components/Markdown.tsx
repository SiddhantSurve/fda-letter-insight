import ReactMarkdown from "react-markdown";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-clinical">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
