import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SpecFile } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ContextInput } from './helpers.js';
import { ContextService } from './service.js';

export default async function contextRoutes(base: FastifyInstance) {
  const app = base.withTypeProvider<ZodTypeProvider>();
  const service = new ContextService(app.container);
  app.get('/repos/:id/context', { schema: { params: IdParams, response: { 200: z.array(SpecFile) } } }, async req => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });
  app.put('/repos/:id/context', { schema: { params: IdParams, body: ContextInput, response: { 200: SpecFile } } }, async req => {
    const { workspaceId } = await getContext(app.container, req);
    return service.save(workspaceId, req.params.id, req.body);
  });
}
