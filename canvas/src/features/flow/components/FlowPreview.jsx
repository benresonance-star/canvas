import React, { useMemo } from 'react';
import { strings } from '../../../content/strings.js';
import { flowPreviewArtifactNodeLabel } from '../domain/flowDocument.js';
import { resolveFlowPreviewOverlaps } from '../domain/flowPreviewLayout.js';
import { buildFlowPreviewEdgePath } from '../domain/flowPreviewEdges.js';

export const FLOW_PREVIEW_DEFAULT_NODE_SIZE = {
  compact: { width: 150, height: 60 },
  full: { width: 180, height: 80 },
};

const FLOW_PREVIEW_MAX_NODE_WIDTH = {
  compact: 220,
  full: 280,
};

function flowPreviewMetrics(compact) {
  const fontSize = compact ? 24 : 28;
  return {
    fontSize,
    lineHeight: fontSize + 6,
    paddingX: compact ? 14 : 16,
    paddingY: compact ? 12 : 14,
    charWidth: fontSize * 0.58,
    defaults: FLOW_PREVIEW_DEFAULT_NODE_SIZE[compact ? 'compact' : 'full'],
    maxW: FLOW_PREVIEW_MAX_NODE_WIDTH[compact ? 'compact' : 'full'],
  };
}

function lineTextWidth(text, charWidth) {
  return text.length * charWidth;
}

/**
 * Wrap label at word boundaries only — never split inside a word.
 * @param {string} label
 * @param {number} innerWidth
 * @param {number} charWidth
 */
export function wrapLabelWordsOnly(label, innerWidth, charWidth) {
  const text = typeof label === 'string' && label.trim() ? label.trim() : 'Untitled node';
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return ['Untitled node'];

  const lines = [];
  let current = '';

  const pushCurrent = () => {
    if (current) {
      lines.push(current);
      current = '';
    }
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (lineTextWidth(candidate, charWidth) <= innerWidth) {
      current = candidate;
    } else {
      pushCurrent();
      current = word;
    }
  }
  pushCurrent();
  return lines.length ? lines : ['Untitled node'];
}

function longestWordWidth(label, charWidth) {
  const words = (label || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return lineTextWidth('Untitled node', charWidth);
  return Math.max(...words.map((word) => lineTextWidth(word, charWidth)));
}

export function flowPreviewNodeLabel(node, cardsById = null) {
  return flowPreviewArtifactNodeLabel(node, cardsById);
}

export function buildFlowPreviewLabelLines(node, compact = false, cardsById = null) {
  const label = flowPreviewNodeLabel(node, cardsById);
  const { charWidth, paddingX, defaults, maxW } = flowPreviewMetrics(compact);
  const longestWordW = longestWordWidth(label, charWidth);
  const minWidth = Math.max(defaults.width, longestWordW + paddingX * 2);
  const widthCap = Math.max(maxW, minWidth);

  let width = minWidth;
  let lines = wrapLabelWordsOnly(label, width - paddingX * 2, charWidth);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const innerW = width - paddingX * 2;
    lines = wrapLabelWordsOnly(label, innerW, charWidth);
    const contentW = Math.max(...lines.map((line) => lineTextWidth(line, charWidth)), 0) + paddingX * 2;
    const nextWidth = Math.min(Math.max(contentW, minWidth), widthCap);
    if (nextWidth === width) break;
    width = nextWidth;
  }

  return lines;
}

export function measureFlowPreviewNodeSize(lines, compact = false, label = '') {
  const { charWidth, lineHeight, paddingX, paddingY, defaults, maxW } = flowPreviewMetrics(compact);
  const longestWordW = longestWordWidth(label, charWidth);
  const minWidth = Math.max(defaults.width, longestWordW + paddingX * 2);
  const widthCap = Math.max(maxW, minWidth);
  const contentW = Math.max(...lines.map((line) => lineTextWidth(line, charWidth)), 0) + paddingX * 2;
  const contentH = lines.length * lineHeight + paddingY * 2;
  return {
    width: Math.min(Math.max(contentW, minWidth), widthCap),
    height: Math.max(contentH, defaults.height),
  };
}

function layoutFlowPreviewNodes(nodes, compact, cardsById = null) {
  const sized = nodes.map((node) => {
    const label = flowPreviewNodeLabel(node, cardsById);
    const lines = buildFlowPreviewLabelLines(node, compact, cardsById);
    const size = measureFlowPreviewNodeSize(lines, compact, label);
    return { ...node, lines, ...size };
  });
  return resolveFlowPreviewOverlaps(sized, { gap: compact ? 12 : 16 });
}

function FlowPreviewNodeLabel({ lines, width, height, compact }) {
  const { fontSize, lineHeight } = flowPreviewMetrics(compact);
  const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;

  return (
    <text
      x={width / 2}
      y={startY}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="var(--color-primary)"
      fontSize={fontSize}
      fontFamily="var(--font-sans, sans-serif)"
      pointerEvents="none"
    >
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={width / 2} dy={index === 0 ? 0 : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function FlowPreview({ preview, compact = false, cardsById = null }) {
  const nodes = preview?.nodes ?? [];
  const edges = preview?.edges ?? [];
  const nodeLayout = useMemo(
    () => layoutFlowPreviewNodes(nodes, compact, cardsById),
    [nodes, compact, cardsById],
  );

  if (!nodes.length) {
    return <div className="h-full flex items-center justify-center serif italic text-muted text-sm">{strings.flow.previewEmpty}</div>;
  }

  const layoutById = new Map(nodeLayout.map((node) => [node.id, node]));
  const minX = Math.min(...nodeLayout.map((node) => node.x));
  const minY = Math.min(...nodeLayout.map((node) => node.y));
  const maxX = Math.max(...nodeLayout.map((node) => node.x + node.width));
  const maxY = Math.max(...nodeLayout.map((node) => node.y + node.height));

  return (
    <svg
      viewBox={`${minX - 30} ${minY - 30} ${Math.max(260, maxX - minX + 60)} ${Math.max(160, maxY - minY + 60)}`}
      className="h-full w-full bg-canvas"
      role="img"
      aria-label={strings.flow.previewAriaLabel}
    >
      <defs>
        <marker
          id="flow-preview-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-muted)" />
        </marker>
      </defs>
      {edges.map((edge, index) => {
        const source = layoutById.get(edge.source);
        const target = layoutById.get(edge.target);
        if (!source || !target) return null;
        const path = buildFlowPreviewEdgePath(source, target);
        const reversed = edge.direction === 'reverse';
        const flowing = Boolean(edge.flowing);
        const className = [
          flowing ? 'flow-preview-edge--animated' : null,
          flowing && reversed ? 'flow-preview-edge--reverse' : null,
        ].filter(Boolean).join(' ') || undefined;
        return (
          <path
            key={`${edge.source}-${edge.target}-${index}`}
            d={path}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth="2"
            className={className}
            markerEnd={reversed ? undefined : 'url(#flow-preview-arrow)'}
            markerStart={reversed ? 'url(#flow-preview-arrow)': undefined}
          />
        );
      })}
      {nodeLayout.map((node) => (
        <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
          <rect
            width={node.width}
            height={node.height}
            rx="10"
            fill="var(--color-surface)"
            stroke={node.type === 'artifact' ? 'var(--color-accent)' : 'var(--color-border)'}
            strokeWidth="2"
          />
          <FlowPreviewNodeLabel
            lines={node.lines}
            width={node.width}
            height={node.height}
            compact={compact}
          />
        </g>
      ))}
    </svg>
  );
}
