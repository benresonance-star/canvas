import React, { useMemo } from 'react';
import { highlightCode } from '../lib/codeHighlight.js';

export function CodePreviewFrame({
  content,
  filename,
  ext,
  language,
  compact = false,
}) {
  const highlighted = useMemo(
    () => highlightCode(content, { filename, ext, language }),
    [content, filename, ext, language],
  );

  return (
    <pre
      className={`code-highlight h-full w-full overflow-auto rounded bg-black/20 text-secondary font-mono whitespace-pre ${
        compact ? 'p-2 text-[10px]' : 'p-4 text-xs'
      }`}
    >
      <code
        className={highlighted.language ? `language-${highlighted.language}` : undefined}
        dangerouslySetInnerHTML={{ __html: highlighted.html }}
      />
    </pre>
  );
}
