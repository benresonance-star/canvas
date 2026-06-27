export class AgentRegistry {
  constructor() {
    this.agents = new Map();
  }

  register(agent) {
    if (!agent?.type) throw new Error('music agent type is required');
    this.agents.set(agent.type, agent);
    return agent;
  }

  get(type) {
    return this.agents.get(type) ?? null;
  }

  list() {
    return [...this.agents.values()];
  }
}
