export class PluginRegistry {
  constructor() {
    this.plugins = new Map();
  }

  register(plugin) {
    if (!plugin?.id) throw new Error('music plugin id is required');
    this.plugins.set(plugin.id, plugin);
    return plugin;
  }

  get(id) {
    return this.plugins.get(id) ?? null;
  }

  list() {
    return [...this.plugins.values()];
  }
}
