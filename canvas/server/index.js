import express from 'express';
import cors from 'cors';
import { runMigrations } from './migrate.js';
import { resolveMasterKey } from './lib/secretBox.js';
import { formatDbError } from './lib/dbError.js';
import { createRequireDb, sendClusterError } from './lib/http.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerCanvasProjectRoutes } from './routes/canvasProjects.js';
import { registerCanvasPreviewRoutes } from './routes/canvasPreviews.js';
import { registerCanvasAgentChatRoutes } from './routes/canvasAgentChat.js';
import { registerSpecRoutes } from './routes/spec.js';
import { registerClusterRoutes } from './routes/clusters.js';
import { registerArtifactRoutes } from './routes/artifacts.js';
import { registerPrimitiveRoutes } from './routes/primitives.js';
import { registerAgentRoutes } from './routes/agent.js';
import { registerAgentTemplateRoutes } from './routes/agentTemplates.js';
import { registerFlowRoutes } from './routes/flows.js';

const app = express();
const PORT = process.env.PORT || 3001;
const JSON_BODY_LIMIT = '52mb';

let dbReady = false;
const isDbReady = () => dbReady;
const requireDb = createRequireDb(isDbReady);
const routeDeps = { requireDb, sendClusterError, isDbReady };

app.use(cors());
app.use(express.json({ limit: JSON_BODY_LIMIT }));

registerHealthRoutes(app, routeDeps);
registerCanvasProjectRoutes(app, routeDeps);
registerCanvasPreviewRoutes(app);
registerCanvasAgentChatRoutes(app);
registerSpecRoutes(app, routeDeps);
registerClusterRoutes(app, routeDeps);
registerArtifactRoutes(app);
registerPrimitiveRoutes(app, routeDeps);
registerFlowRoutes(app, routeDeps);
registerAgentTemplateRoutes(app);
registerAgentRoutes(app);

async function start() {
  try {
    await runMigrations();
    resolveMasterKey();
    dbReady = true;
  } catch (e) {
    dbReady = false;
    console.warn(
      'Database unavailable — API started in limited mode (bookmark preview works; project sync and clusters need Postgres).',
      formatDbError(e),
    );
  }

  app.listen(PORT, () => {
    console.log(`Canvas primitives API http://localhost:${PORT}${dbReady ? '' : ' (limited — no database)'}`);
  });
}

start();
