import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  buildEditableDocumentHtml,
  editableDocumentToMarkdown,
  normalizeEditableDocumentDom,
  parseMarkdownMessage,
} from '../lib/markdownMessage.js';
import {
  applyHeadingToRange,
  clipboardPayloadToMarkdown,
  insertHorizontalRuleAtRange,
  insertMarkdownAtRange,
  plainTextLooksLikeMarkdown,
  resolveHeadingLevelInEditor,
} from '../lib/editableMarkdownDom.js';
import { MarkdownFormatToolbar } from './MarkdownFormatToolbar.jsx';

function normalizeBlocks(blocks) {
  return blocks.length > 0 ? blocks : [{ type: 'paragraph', text: '' }];
}

function splitParagraphAtLineBreaks(editor) {
  const selection = document.getSelection?.();
  if (!selection?.rangeCount) return;

  let anchor = selection.anchorNode;
  if (anchor?.nodeType === 3) anchor = anchor.parentElement;
  const paragraph = anchor?.closest?.('p');
  if (!paragraph || !editor.contains(paragraph)) return;
  if (!paragraph.querySelector('br')) return;

  const parent = paragraph.parentNode;
  if (!parent) return;

  const paragraphs = [];
  let current = document.createElement('p');
  current.className = paragraph.className;

  Array.from(paragraph.childNodes).forEach((child) => {
    if (child.nodeType === 1 && child.tagName?.toLowerCase() === 'br') {
      if (current.childNodes.length > 0 || paragraphs.length === 0) {
        paragraphs.push(current);
      }
      current = document.createElement('p');
      current.className = paragraph.className;
      return;
    }
    current.appendChild(child);
  });

  if (current.childNodes.length > 0) paragraphs.push(current);

  const insertBefore = paragraph.nextSibling;
  paragraphs.forEach((node) => parent.insertBefore(node, insertBefore));
  paragraph.remove();
}

/**
 * Unified contenteditable WYSIWYG editor for the app's markdown subset.
 */
export function EditableMarkdownMessage({
  value,
  onChange,
  compact = false,
  fillHeight = false,
  disabled = false,
  showToolbar = true,
  toolbarRight = null,
  className = '',
}) {
  const editorRef = useRef(null);
  const lastEmittedRef = useRef(undefined);
  const [formatState, setFormatState] = useState({
    boldActive: false,
    italicActive: false,
    bulletActive: false,
    numberedActive: false,
    heading1Active: false,
    heading2Active: false,
  });

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = value ?? '';
    if (lastEmittedRef.current === nextValue) return;
    lastEmittedRef.current = nextValue;
    editor.innerHTML = buildEditableDocumentHtml(
      normalizeBlocks(parseMarkdownMessage(nextValue)),
      { compact },
    );
  }, [value, compact]);

  const syncFromDom = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    normalizeEditableDocumentDom(editor);
    const markdown = editableDocumentToMarkdown(editor);
    lastEmittedRef.current = markdown;
    onChange?.(markdown);
  }, [onChange]);

  const refreshFormatState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = document.getSelection?.();
    const selectionInsideEditor = selection
      && selection.rangeCount > 0
      && editor.contains(selection.anchorNode);
    if (!selectionInsideEditor) return;

    let boldActive = false;
    let italicActive = false;
    let bulletActive = false;
    let numberedActive = false;
    try {
      boldActive = document.queryCommandState('bold');
      italicActive = document.queryCommandState('italic');
      bulletActive = document.queryCommandState('insertUnorderedList');
      numberedActive = document.queryCommandState('insertOrderedList');
    } catch {
      boldActive = false;
      italicActive = false;
      bulletActive = false;
      numberedActive = false;
    }
    const activeHeadingLevel = resolveHeadingLevelInEditor(editor, selection);
    setFormatState({
      boldActive,
      italicActive,
      bulletActive,
      numberedActive,
      heading1Active: activeHeadingLevel === 1,
      heading2Active: activeHeadingLevel === 2,
    });
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      refreshFormatState();
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [refreshFormatState]);

  const applyCommand = useCallback((command) => {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    editor.focus();
    document.execCommand(command, false, null);
    normalizeEditableDocumentDom(editor);
    syncFromDom();
    refreshFormatState();
  }, [disabled, refreshFormatState, syncFromDom]);

  const applyListCommand = useCallback((command) => {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    editor.focus();
    splitParagraphAtLineBreaks(editor);
    document.execCommand(command, false, null);
    normalizeEditableDocumentDom(editor);
    syncFromDom();
    refreshFormatState();
  }, [disabled, refreshFormatState, syncFromDom]);

  const applyDivider = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || disabled || typeof document === 'undefined') return;
    editor.focus();
    const selection = document.getSelection?.();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    insertHorizontalRuleAtRange(editor, range);
    normalizeEditableDocumentDom(editor);
    syncFromDom();
    refreshFormatState();
  }, [disabled, refreshFormatState, syncFromDom]);

  const applyHeading = useCallback((level) => {
    const editor = editorRef.current;
    if (!editor || disabled || typeof document === 'undefined') return;
    editor.focus();
    const selection = document.getSelection?.();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    applyHeadingToRange(editor, range, level, { compact });
    normalizeEditableDocumentDom(editor);
    syncFromDom();
    refreshFormatState();
  }, [compact, disabled, refreshFormatState, syncFromDom]);

  const handleInput = () => {
    syncFromDom();
    refreshFormatState();
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const editor = editorRef.current;
    if (!editor || disabled || typeof document === 'undefined') return;
    const html = event.clipboardData?.getData('text/html') ?? '';
    const plain = event.clipboardData?.getData('text/plain') ?? '';
    const markdown = clipboardPayloadToMarkdown({ html, plain }, { compact });
    const selection = document.getSelection?.();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const structured = Boolean(html.trim())
      || plainTextLooksLikeMarkdown(plain)
      || markdown.includes('\n\n')
      || markdown.includes('\n- ')
      || markdown.includes('\n* ')
      || markdown.includes('\n---');
    if (structured) {
      insertMarkdownAtRange(editor, range, markdown, { compact });
    } else {
      range.deleteContents();
      document.execCommand('insertText', false, markdown);
    }
    normalizeEditableDocumentDom(editor);
    syncFromDom();
    refreshFormatState();
  };

  const stopBubble = (event) => {
    event.stopPropagation();
  };

  const textClass = compact ? 'text-[10px]' : 'text-xs';
  const usesInternalScroll = compact || fillHeight;
  const toolbarSticky = !usesInternalScroll;

  return (
    <div
      className={`agent-markdown-message editable-markdown-message ${textClass} select-text ${
        usesInternalScroll ? 'flex flex-col flex-1 min-h-0 h-full' : ''
      } ${className}`}
      data-artifact-scroll
      onMouseDown={stopBubble}
      onClick={stopBubble}
    >
      {showToolbar && !disabled && (
        <div
          className={`shrink-0 flex items-center justify-between gap-1 ${
            compact ? 'pb-1' : 'pb-2'
          } ${
            toolbarSticky
              ? 'sticky top-0 z-10 bg-surface border-b border-border-subtle/60'
              : ''
          }`}
        >
          <MarkdownFormatToolbar
            compact={compact}
            disabled={disabled}
            boldActive={formatState.boldActive}
            italicActive={formatState.italicActive}
            heading1Active={formatState.heading1Active}
            heading2Active={formatState.heading2Active}
            bulletActive={formatState.bulletActive}
            numberedActive={formatState.numberedActive}
            listsDisabled={false}
            onBold={() => applyCommand('bold')}
            onItalic={() => applyCommand('italic')}
            onHeading1={() => applyHeading(1)}
            onHeading2={() => applyHeading(2)}
            onBulletList={() => applyListCommand('insertUnorderedList')}
            onNumberedList={() => applyListCommand('insertOrderedList')}
            onDivider={applyDivider}
            onMouseDown={stopBubble}
          />
          {toolbarRight}
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={`space-y-2 outline-none cursor-text ${
          usesInternalScroll ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain' : ''
        }`}
        onInput={handleInput}
        onBlur={handleInput}
        onFocus={refreshFormatState}
        onPaste={handlePaste}
        onPointerDown={stopBubble}
      />
    </div>
  );
}
