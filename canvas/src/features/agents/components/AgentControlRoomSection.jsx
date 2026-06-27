import React from 'react';

export function AgentControlRoomField({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="sans block text-[10px] uppercase tracking-wider text-muted mb-1">
          {label}
        </span>
      )}
      {children}
    </label>
  );
}

export function AgentControlRoomSection({
  icon: Icon,
  title,
  children,
  footer,
  className = '',
}) {
  return (
    <section
      className={`min-h-0 border border-border rounded-lg bg-surface shadow-card p-3 ${className}`}
    >
      <div className="flex items-center gap-2 mb-3">
        {Icon && (
          <span className="shrink-0 w-7 h-7 rounded-md border border-agent-artifact-icon-border bg-agent-artifact-icon-bg flex items-center justify-center text-agent-artifact-muted">
            <Icon size={14} strokeWidth={1.75} aria-hidden />
          </span>
        )}
        <h3 className="sans text-xs font-medium text-primary">{title}</h3>
      </div>
      {children}
      {footer && (
        <p className="sans text-[10px] text-muted mt-3 leading-snug">{footer}</p>
      )}
    </section>
  );
}
