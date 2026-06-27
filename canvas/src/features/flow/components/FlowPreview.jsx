import React, { useMemo } from 'react';
import { strings } from '../../../content/strings.js';
import { UNTITLED_FLOW_STEP_TITLE } from '../domain/flowDocument.js';
import {
  flowPreviewColors,
  flowPreviewNodePresentation,
  flowPreviewNodeTitle,
} from '../domain/flowPreviewNodes.js';
import { resolveFlowPreviewOverlaps } from '../domain/flowPreviewLayout.js';
import { buildFlowPreviewEdgePath } from '../domain/flowPreviewEdges.js';

export const FLOW_PREVIEW_DEFAULT_NODE_SIZE = {
  compact: { width: 150, height: 72 },
  full: { width: 180, height: 88 },
};

const FLOW_PREVIEW_MAX_NODE_WIDTH = {
  compact: 220,
  full: 280,
};

function flowPreviewMetrics(compact) {
  const titleFontSize = compact ? 22 : 24;
  const typeFontSize = compact ? 16 : 18;
  return {
    titleFontSize,
    typeFontSize,
    titleLineHeight: titleFontSize + 6,
    typeLineHeight: typeFontSize + 4,
    typeTitleGap: compact ? 4 : 6,
    paddingX: compact ? 14 : 16,
    paddingY: compact ? 10 : 12,
    titleCharWidth: titleFontSize * 0.58,
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
  const text = typeof label === 'string' && label.trim() ? label.trim() : UNTITLED_FLOW_STEP_TITLE;
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [UNTITLED_FLOW_STEP_TITLE];

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
  return lines.length ? lines : [UNTITLED_FLOW_STEP_TITLE];
}

function longestWordWidth(label, charWidth) {
  const words = (label || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return lineTextWidth(UNTITLED_FLOW_STEP_TITLE, charWidth);
  return Math.max(...words.map((word) => lineTextWidth(word, charWidth)));
}

export function flowPreviewNodeLabel(node, cardsById = null) {
  return flowPreviewNodeTitle(node, cardsById);
}

export function buildFlowPreviewLabelLines(node, compact = false, cardsById = null) {
  const label = flowPreviewNodeTitle(node, cardsById);
  const { titleCharWidth, paddingX, defaults, maxW } = flowPreviewMetrics(compact);
  const longestWordW = longestWordWidth(label, titleCharWidth);
  const minWidth = Math.max(defaults.width, longestWordW + paddingX * 2);
  const widthCap = Math.max(maxW, minWidth);

  let width = minWidth;
  let lines = wrapLabelWordsOnly(label, width - paddingX * 2, titleCharWidth);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const innerW = width - paddingX * 2;
    lines = wrapLabelWordsOnly(label, innerW, titleCharWidth);
    const contentW = Math.max(...lines.map((line) => lineTextWidth(line, titleCharWidth)), 0) + paddingX * 2;
    const nextWidth = Math.min(Math.max(contentW, minWidth), widthCap);
    if (nextWidth === width) break;
    width = nextWidth;
  }

  return lines;
}

export function measureFlowPreviewNodeSize(lines, compact = false, label = '', typeLabel = '') {
  const {
    titleCharWidth,
    titleLineHeight,
    typeLineHeight,
    typeTitleGap,
    paddingX,
    paddingY,
    defaults,
    maxW,
    typeFontSize,
  } = flowPreviewMetrics(compact);
  const longestWordW = longestWordWidth(label, titleCharWidth);
  const typeWidth = lineTextWidth(typeLabel, typeFontSize * 0.62);
  const minWidth = Math.max(defaults.width, longestWordW + paddingX * 2, typeWidth + paddingX * 2);
  const widthCap = Math.max(maxW, minWidth);
  const contentW = Math.max(...lines.map((line) => lineTextWidth(line, titleCharWidth)), 0) + paddingX * 2;
  const contentH = typeLineHeight + typeTitleGap + lines.length * titleLineHeight + paddingY * 2;
  return {
    width: Math.min(Math.max(contentW, minWidth), widthCap),
    height: Math.max(contentH, defaults.height),
  };
}

function layoutFlowPreviewNodes(nodes, compact, cardsById = null, colors) {
  const sized = nodes.map((node) => {
    const presentation = flowPreviewNodePresentation(node, colors);
    const label = flowPreviewNodeTitle(node, cardsById);
    const lines = buildFlowPreviewLabelLines(node, compact, cardsById);
    const size = measureFlowPreviewNodeSize(lines, compact, label, presentation.typeLabel);
    return {
      ...node,
      ...presentation,
      lines,
      ...size,
    };
  });
  return resolveFlowPreviewOverlaps(sized, { gap: compact ? 12 : 16 });
}

function FlowPreviewNodeContent({
  typeLabel,
  lines,
  width,
  height,
  compact,
  titleColor,
  typeColor,
}) {
  const {
    titleFontSize,
    typeFontSize,
    titleLineHeight,
    typeLineHeight,
    typeTitleGap,
    paddingY,
  } = flowPreviewMetrics(compact);
  const contentHeight = typeLineHeight + typeTitleGap + lines.length * titleLineHeight;
  const startY = (height - contentHeight) / 2 + typeLineHeight / 2;

  return (
    <>
      <text
        x={width / 2}
        y={startY}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={typeColor}
        fontSize={typeFontSize}
        fontFamily="var(--font-sans, sans-serif)"
        letterSpacing="0.08em"
        pointerEvents="none"
      >
        {typeLabel}
      </text>
      <text
        x={width / 2}
        y={startY + typeLineHeight / 2 + typeTitleGap + titleLineHeight / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={titleColor}
        fontSize={titleFontSize}
        fontFamily="var(--font-serif, serif)"
        pointerEvents="none"
      >
        {lines.map((line, index) => (
          <tspan key={`${line}-${index}`} x={width / 2} dy={index === 0 ? 0 : titleLineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </>
  );
}

export function FlowPreview({ preview, compact = false, cardsById = null }) {
  const nodes = preview?.nodes ?? [];
  const edges = preview?.edges ?? [];
  const colors = flowPreviewColors(preview);
  const nodeLayout = useMemo(
    () => layoutFlowPreviewNodes(nodes, compact, cardsById, colors),
    [nodes, compact, cardsById, colors],
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
            fill={node.headerColor}
            stroke="rgba(0,0,0,0.12)"
            strokeWidth="2"
          />
          <FlowPreviewNodeContent
            typeLabel={node.typeLabel}
            lines={node.lines}
            width={node.width}
            height={node.height}
            compact={compact}
            titleColor={node.titleColor}
            typeColor={node.typeColor}
          />
        </g>
      ))}
    </svg>
  );
}
