import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cx } from '@/lib/utils'

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: props => <h3 className="mt-2 mb-1 text-sm font-semibold" {...props} />,
        h2: props => <h4 className="mt-2 mb-1 text-sm font-semibold" {...props} />,
        h3: props => <h5 className="mt-2 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground" {...props} />,
        p: props => <p className="my-1 leading-relaxed" {...props} />,
        strong: props => <strong className="font-semibold text-foreground" {...props} />,
        em: props => <em className="italic" {...props} />,
        ul: props => <ul className="my-1 list-disc space-y-0.5 pl-4" {...props} />,
        ol: props => <ol className="my-1 list-decimal space-y-0.5 pl-4" {...props} />,
        li: props => <li className="leading-relaxed" {...props} />,
        a: props => <a className="text-primary underline" target="_blank" rel="noreferrer" {...props} />,
        blockquote: props => <blockquote className="my-1 border-l-2 border-border pl-2 text-muted-foreground" {...props} />,
        code: ({ className, children, ...props }) =>
          String(children).includes('\n') ? (
            <code className={cx('block overflow-x-auto rounded border border-border bg-background px-2 py-1 font-mono text-[10px]', className ?? '')} {...props}>
              {children}
            </code>
          ) : (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]" {...props}>
              {children}
            </code>
          ),
        pre: props => <pre className="my-1 overflow-x-auto rounded border border-border bg-background p-2 text-[10px]" {...props} />,
        table: props => (
          <div className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-[11px] tabular-nums" {...props} />
          </div>
        ),
        thead: props => <thead className="bg-muted/50" {...props} />,
        th: props => <th className="border-b border-border px-2 py-1 text-left font-medium uppercase tracking-wide text-muted-foreground" {...props} />,
        td: props => <td className="border-b border-border px-2 py-1 align-top" {...props} />,
        tr: props => <tr className="hover:bg-card-hover" {...props} />
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
