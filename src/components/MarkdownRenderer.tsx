import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  onClick: () => void;
}

// Process highlight syntax ==text== before passing to markdown
function processHighlights(text: string): string {
  // Replace ==text== with <mark>text</mark>
  return text.replace(/==([^=]+)==/g, '<mark>$1</mark>');
}

export function MarkdownRenderer({ content, onClick }: MarkdownRendererProps) {
  // Process highlights in content
  const processedContent = processHighlights(content);

  return (
    <div className="markdown-preview" onClick={onClick}>
      {content ? (
        <ReactMarkdown
          components={{
            h1: ({ children, node: _node }) => <h1 className="md-h1">{children}</h1>,
            h2: ({ children, node: _node }) => <h2 className="md-h2">{children}</h2>,
            h3: ({ children, node: _node }) => <h3 className="md-h3">{children}</h3>,
            p: ({ children, node: _node }) => {
              // Check if children contains highlight markers
              return <p className="md-p">{children}</p>;
            },
            ul: ({ children, node: _node }) => <ul className="md-ul">{children}</ul>,
            ol: ({ children, node: _node }) => <ol className="md-ol">{children}</ol>,
            li: ({ children, node: _node }) => <li className="md-li">{children}</li>,
            code: ({ className, children, node: _node, ...props }) => {
              const isInline = !className;
              return isInline ? (
                <code className="md-code-inline" {...props}>{children}</code>
              ) : (
                <code className={`md-code-block ${className ?? ''}`} {...props}>{children}</code>
              );
            },
            pre: ({ children, node: _node }) => <pre className="md-pre">{children}</pre>,
            blockquote: ({ children, node: _node }) => <blockquote className="md-blockquote">{children}</blockquote>,
            a: ({ href, children, node: _node, ...props }) => (
              <a href={href} className="md-link" target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            ),
            strong: ({ children, node: _node }) => <strong className="md-strong">{children}</strong>,
            em: ({ children, node: _node }) => <em className="md-em">{children}</em>,
          }}
          // Allow raw HTML for our mark tags
          allowedElements={undefined}
          unwrapDisallowed={false}
        >
          {processedContent}
        </ReactMarkdown>
      ) : (
        <p className="placeholder">Click to start writing... ✏️</p>
      )}
    </div>
  );
}
