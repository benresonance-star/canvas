import { MusicEventBus } from './eventBus/MusicEventBus.js';
import { AgentRegistry } from './registry/AgentRegistry.js';
import { PluginRegistry } from './registry/PluginRegistry.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { MusicAudioTransportService } from '../transport/MusicAudioTransportService.js';
import { ProjectClock } from './clock/ProjectClock.js';
import { ArrangementEngine } from './arrangement/ArrangementEngine.js';
import { GrooveEngine } from './groove/GrooveEngine.js';
import { HarmonyEngine } from './harmony/HarmonyEngine.js';
import { DescriptorGraphKernel } from './descriptors/DescriptorGraphKernel.js';
import { AcousticSpaceEngine } from './space/AcousticSpaceEngine.js';
import { TemporalEngine } from './temporal/TemporalEngine.js';
import { ReflectionEngine } from './reflection/ReflectionEngine.js';

export class MusicKernel {
  constructor({ audioEngine = new AudioEngine() } = {}) {
    this.eventBus = new MusicEventBus();
    this.agentRegistry = new AgentRegistry();
    this.pluginRegistry = new PluginRegistry();
    this.audioEngine = audioEngine;
    this.audioTransport = new MusicAudioTransportService({ audioEngine });
    this.projectClock = new ProjectClock();
    this.arrangement = new ArrangementEngine();
    this.groove = new GrooveEngine();
    this.harmony = new HarmonyEngine();
    this.descriptorGraph = new DescriptorGraphKernel();
    this.acousticSpaceEngine = new AcousticSpaceEngine();
    this.temporalEngine = new TemporalEngine();
    this.reflectionEngine = new ReflectionEngine();
    this.started = false;
  }

  applyDescriptorGraph(graph) {
    this.descriptorGraph = new DescriptorGraphKernel(graph);
    const snapshot = this.descriptorGraph.snapshot();
    this.groove.fromDescriptors(snapshot);
    this.harmony.fromDescriptors(snapshot);
    this.acousticSpaceEngine.applyDescriptors(snapshot);
    this.temporalEngine.applyDescriptors(snapshot);
    this.eventBus.publish('descriptor.applied', { descriptorGraph: snapshot });
    return snapshot;
  }

  analyzeReflection(extra = {}) {
    return this.reflectionEngine.analyze({
      descriptorGraph: this.descriptorGraph.snapshot(),
      spaceState: this.acousticSpaceEngine.state,
      temporalState: this.temporalEngine.state,
      ...extra,
    });
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.eventBus.publish('kernel.started');
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.eventBus.publish('kernel.stopped');
  }

  registerAgent(agent) {
    const registered = this.agentRegistry.register(agent);
    this.eventBus.publish('agent.registered', { type: agent.type });
    return registered;
  }

  registerPlugin(plugin) {
    const registered = this.pluginRegistry.register(plugin);
    this.eventBus.publish('plugin.registered', { id: plugin.id });
    return registered;
  }
}
