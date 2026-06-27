import React from 'react';
import { strings } from '../../../content/strings.js';

export function DiagnosticsStepPanel({ step, stepIndex, stepCount, actionLabel, isOverviewMode }) {
  return (
    <section className="shrink-0 border-b border-border p-3">
      <h2 className="sans text-[10px] uppercase tracking-wider text-muted">
        {isOverviewMode ? strings.diagnostics.overviewTitle : strings.diagnostics.stepTitle}
      </h2>
      {actionLabel && (
        <p className="sans text-[10px] text-accent mt-1">{actionLabel}</p>
      )}
      {isOverviewMode ? (
        <p className="sans text-xs text-muted mt-2 leading-snug">
          {strings.diagnostics.overviewIdle}
        </p>
      ) : (
        <>
          {stepCount > 0 && (
            <p className="sans text-[10px] text-muted mt-0.5">
              {strings.diagnostics.stepCounter(stepIndex + 1, stepCount)}
            </p>
          )}
          {step ? (
            <div className="mt-2">
              <p className="sans text-sm text-primary font-medium">{step.label}</p>
              <p className="sans text-xs text-secondary mt-1 leading-snug">{step.description}</p>
              {step.codeRef && (
                <p className="sans text-[10px] text-muted mt-2 font-mono truncate" title={step.codeRef}>
                  {step.codeRef}
                </p>
              )}
            </div>
          ) : (
            <p className="sans text-xs text-muted mt-2">{strings.diagnostics.stepIdle}</p>
          )}
        </>
      )}
    </section>
  );
}
