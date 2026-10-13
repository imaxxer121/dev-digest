import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CiExportInput, CiPreview, CiExport, CiInstallation, CiRun, CiRefreshInput, CiRefreshResult } from '@devdigest/shared';
import { IdParams } from '../_shared/schemas.js';
import { getContext } from '../_shared/context.js';
import { CiService } from './service.js';
export default async function ciRoutes(base: FastifyInstance) {
  const app = base.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container, app.container);
  app.post('/agents/:id/ci-preview', { schema: { params: IdParams, body: CiExportInput, response: { 200: CiPreview } } }, async req => service.preview((await getContext(app.container, req)).workspaceId, req.params.id, req.body));
  app.post('/agents/:id/export-ci', { schema: { params: IdParams, body: CiExportInput, response: { 200: CiExport } } }, async req => service.export((await getContext(app.container, req)).workspaceId, req.params.id, req.body));
  app.post('/agents/:id/ci-zip', { schema: { params: IdParams, body: CiExportInput } }, async (req, reply) => {
    const value = await service.zip((await getContext(app.container, req)).workspaceId, req.params.id, req.body);
    return reply.header('content-type', 'application/zip').header('content-disposition', 'attachment; filename="devdigest-ci.zip"').header('x-devdigest-installation', value.installation.id).send(Buffer.from(value.bytes));
  });
  app.get('/ci/installations', { schema: { querystring: z.object({ agent_id: z.string().uuid().optional() }), response: { 200: z.array(CiInstallation) } } }, async req => service.installations((await getContext(app.container, req)).workspaceId, req.query.agent_id));
  app.get('/ci/runs', { schema: { querystring: z.object({ agent_id: z.string().uuid().optional() }), response: { 200: z.array(CiRun) } } }, async req => service.runs((await getContext(app.container, req)).workspaceId, req.query.agent_id));
  app.post('/ci/refresh', { schema: { body: CiRefreshInput, response: { 200: CiRefreshResult } } }, async req => service.refresh((await getContext(app.container, req)).workspaceId, req.body.installation_id, req.body.run_id));
}
