/** Default multi-agent profiles (v1 static config). */
export const AGENT_PROFILES = [
  {
    id: 'planning',
    label: 'Planning Agent',
    description: 'Planning, zoning & compliance',
    dotClass: 'bg-emerald-500',
  },
  {
    id: 'feasibility',
    label: 'Feasibility Agent',
    description: 'Financial & development analysis',
    dotClass: 'bg-sky-500',
  },
  {
    id: 'design',
    label: 'Design Agent',
    description: 'Design quality & built form',
    dotClass: 'bg-amber-500',
  },
  {
    id: 'research',
    label: 'Research Agent',
    description: 'Research & market context',
    dotClass: 'bg-violet-500',
  },
];

export const DEFAULT_ENABLED_AGENT_IDS = AGENT_PROFILES.map((a) => a.id);
