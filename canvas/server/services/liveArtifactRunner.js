import {
  buildLiveSourceContext,
  finishLiveRunFailed,
  finishLiveRunSkipped,
  finishLiveRunSuccess,
  getLiveArtifact,
  startLiveRun,
} from '../repositories/live-artifacts.js';
import { generateLiveAgentFeed } from './liveAgentFeed.js';
import { publishProjectSync } from '../lib/projectSyncHub.js';

export async function runLiveArtifact(id, {
  triggerType = 'manual',
  generate = generateLiveAgentFeed,
} = {}) {
  const live = await getLiveArtifact(id);
  if (!live) {
    const error = new Error('Live artifact not found');
    error.status = 404;
    throw error;
  }
  if (!['manual', 'scheduled', 'test'].includes(triggerType)) {
    throw new Error('Invalid live run trigger');
  }
  const runId = await startLiveRun(live, triggerType);
  try {
    const sourceContext = await buildLiveSourceContext(live);
    const output = await generate({ live, sourceContext });
    const shouldSkip = live.onlyUpdateIfMeaningful
      && (!output.meaningfulChangeDetected
        || output.changeScore < live.minimumChangeThreshold);
    if (shouldSkip) {
      await finishLiveRunSkipped(runId, output.changeScore, output, sourceContext.length);
      return {
        status: 'skipped_no_meaningful_change',
        runId,
        changeScore: output.changeScore,
        message: 'No meaningful change detected. No new live update was created.',
        live,
      };
    }
    const saved = await finishLiveRunSuccess({
      live,
      runId,
      output,
      contextLength: sourceContext.length,
    });
    const event = {
      projectId: live.projectId,
      artifactId: live.id,
      liveArtifactId: live.id,
      versionId: saved.versionId,
      versionNumber: saved.versionNumber,
      createdAt: new Date().toISOString(),
    };
    publishProjectSync(live.projectId, 'live_updated', event);
    publishProjectSync(live.projectId, 'project_update_created', event);
    return { status: 'succeeded', runId, output, live, ...saved };
  } catch (error) {
    await finishLiveRunFailed(runId, error.message).catch(() => {});
    throw error;
  }
}
