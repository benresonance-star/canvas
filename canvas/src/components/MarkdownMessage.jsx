import React from 'react';
import {
  parseInlineMarkdown,
  parseLatexInlineSegments,
  parseMarkdownMessage,
  resolveMarkdownCopyText,
} from '../lib/markdownMessage.js';

function selectionTouchesNode(selection, node) {
  if (!selection || selection.rangeCount === 0 || !node) return false;
  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i);
    if (
      node.contains(range.commonAncestorContainer)
      || range.intersectsNode?.(node)
    ) {
      return true;
    }
  }
  return false;
}

function renderInlineSegment(segment, index, compact) {
  const key = `${segment.type}-${index}`;
  if (segment.type === 'strong') {
    return (
      <strong key={key} className="font-semibold text-primary">
        {parseLatexInlineSegments(segment.text).map((child, childIndex) => (
          renderInlineSegment(child, childIndex, compact)
        ))}
      </strong>
    );
  }
  if (segment.type === 'emphasis') {
    return (
      <em key={key}>
        {parseLatexInlineSegments(segment.text).map((child, childIndex) => (
          renderInlineSegment(child, childIndex, compact)
        ))}
      </em>
    );
  }
  if (segment.type === 'code') {
    return (
      <code
        key={key}
        className={`rounded bg-surface-muted px-1 py-0.5 font-mono ${
          compact ? 'text-[9px]' : 'text-[11px]'
        }`}
      >
        {parseLatexInlineSegments(segment.text).map((child, childIndex) => (
          renderInlineSegment(child, childIndex, compact)
        ))}
      </code>
    );
  }
  if (segment.type === 'symbol') {
    return (
      <span
        key={key}
        className={`inline-block px-0.5 text-primary ${compact ? 'text-[11px]' : 'text-sm'}`}
        title={segment.raw}
        aria-label={segment.raw}
      >
        {segment.text}
      </span>
    );
  }
  return <React.Fragment key={key}>{segment.text}</React.Fragment>;
}

function InlineText({ text, compact }) {
  return parseInlineMarkdown(text).map((segment, index) => renderInlineSegment(segment, index, compact));
}

export function MarkdownMessage({ content, compact = false }) {
  const blocks = parseMarkdownMessage(content);
  const textClass = compact ? 'text-[10px]' : 'text-xs';
  const handleCopy = (event) => {
    const selection = window.getSelection?.();
    if (!selection?.toString().trim()) return;
    if (!selectionTouchesNode(selection, event.currentTarget)) return;
    const copyText = resolveMarkdownCopyText(selection.toString(), content);
    if (!copyText) return;
    event.clipboardData.setData('text/plain', copyText);
    event.preventDefault();
  };

  return (
    <div className={`agent-markdown-message ${textClass} space-y-2`} onCopy={handleCopy}>
      {blocks.map((block, index) => {
        if (block.type === 'table') {
          return (
            <div key={`table-${index}`} className="max-w-full overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th
                        key={`${header}-${headerIndex}`}
                        className="border-b border-border-subtle px-2 py-1 font-semibold text-primary"
                      >
                        <InlineText text={header} compact={compact} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`} className="border-b border-border-subtle/60 last:border-0">
                      {row.map((cell, cellIndex) => (
                        <td key={`${rowIndex}-${cellIndex}`} className="px-2 py-1 align-top">
                          <InlineText text={cell} compact={compact} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={`list-${index}`}
              {...(block.ordered && block.start ? { start: block.start } : {})}
              className={`${block.ordered ? 'list-decimal' : 'list-disc'} space-y-0.5 pl-5`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`} className="whitespace-pre-wrap">
                  <InlineText text={item} compact={compact} />
                </li>
              ))}
            </ListTag>
          );
        }
        if (block.type === 'heading') {
          const HeadingTag = `h${Math.min(Math.max(block.level, 1), 6)}`;
          return (
            <HeadingTag
              key={`heading-${index}`}
              className={`font-semibold text-primary ${compact ? 'text-[11px]' : 'text-sm'}`}
            >
              <InlineText text={block.text} compact={compact} />
            </HeadingTag>
          );
        }
        return (
          <p key={`paragraph-${index}`} className="whitespace-pre-wrap">
            <InlineText text={block.text} compact={compact} />
          </p>
        );
      })}
    </div>
  );
}
