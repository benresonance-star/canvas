import React from 'react';
import { Bold, Heading1, Heading2, Italic, List, ListOrdered, SeparatorHorizontal } from 'lucide-react';
import { strings } from '../content/strings.js';

function FormatButton({
  label,
  pressed,
  disabled,
  onAction,
  onMouseDown,
  children,
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-full border border-border-subtle bg-surface-muted/90 p-1 text-muted shadow-sm hover:text-primary pointer-events-auto disabled:opacity-40 disabled:pointer-events-none ${
        pressed ? 'border-accent/50 text-primary bg-surface' : ''
      }`}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={onMouseDown}
      onClick={(event) => {
        event.stopPropagation();
        onAction?.();
      }}
    >
      {children}
    </button>
  );
}

export function MarkdownFormatToolbar({
  compact = false,
  disabled = false,
  boldActive = false,
  italicActive = false,
  bulletActive = false,
  numberedActive = false,
  heading1Active = false,
  heading2Active = false,
  listsDisabled = false,
  onBold,
  onItalic,
  onHeading1,
  onHeading2,
  onBulletList,
  onNumberedList,
  onDivider,
  onMouseDown,
  className = '',
}) {
  const iconSize = compact ? 11 : 13;
  const stopToolbarMouseDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onMouseDown?.(event);
  };

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className}`}
      role="toolbar"
      aria-label={strings.markdownFormat.toolbarLabel}
      onMouseDown={stopToolbarMouseDown}
    >
      <FormatButton
        label={strings.markdownFormat.bold}
        pressed={boldActive}
        disabled={disabled}
        onAction={onBold}
        onMouseDown={stopToolbarMouseDown}
      >
        <Bold size={iconSize} strokeWidth={2.25} aria-hidden />
      </FormatButton>
      <FormatButton
        label={strings.markdownFormat.italic}
        pressed={italicActive}
        disabled={disabled}
        onAction={onItalic}
        onMouseDown={stopToolbarMouseDown}
      >
        <Italic size={iconSize} strokeWidth={2.25} aria-hidden />
      </FormatButton>
      <FormatButton
        label={strings.markdownFormat.heading1}
        pressed={heading1Active}
        disabled={disabled}
        onAction={onHeading1}
        onMouseDown={stopToolbarMouseDown}
      >
        <Heading1 size={iconSize} strokeWidth={2.25} aria-hidden />
      </FormatButton>
      <FormatButton
        label={strings.markdownFormat.heading2}
        pressed={heading2Active}
        disabled={disabled}
        onAction={onHeading2}
        onMouseDown={stopToolbarMouseDown}
      >
        <Heading2 size={iconSize} strokeWidth={2.25} aria-hidden />
      </FormatButton>
      <FormatButton
        label={strings.markdownFormat.bulletList}
        pressed={bulletActive}
        disabled={disabled || listsDisabled}
        onAction={onBulletList}
        onMouseDown={stopToolbarMouseDown}
      >
        <List size={iconSize} strokeWidth={2.25} aria-hidden />
      </FormatButton>
      <FormatButton
        label={strings.markdownFormat.numberedList}
        pressed={numberedActive}
        disabled={disabled || listsDisabled}
        onAction={onNumberedList}
        onMouseDown={stopToolbarMouseDown}
      >
        <ListOrdered size={iconSize} strokeWidth={2.25} aria-hidden />
      </FormatButton>
      <FormatButton
        label={strings.markdownFormat.divider}
        disabled={disabled}
        onAction={onDivider}
        onMouseDown={stopToolbarMouseDown}
      >
        <SeparatorHorizontal size={iconSize} strokeWidth={2.25} aria-hidden />
      </FormatButton>
    </div>
  );
}
