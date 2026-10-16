import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { IntentResponse } from '../../vendor/shared/contracts/review-api.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IntentService } from './service.js';

export default async function intentRoutes(base: FastifyInstance) {
  const app = base.withTypeProvider<ZodTypeProvider>();
  const service = new IntentService(app.container, event => app.log.info(event, 'PR Intent'));
  app.get('/pulls/:id/intent', { schema: { params: IdParams, response: { 200: IntentResponse } } }, async req => {
    const { workspaceId } = await getContext(app.container, req);
    return service.read(workspaceId, req.params.id);
  });
  app.post('/pulls/:id/intent/recalculate', { schema: { params: IdParams, response: { 200: IntentResponse } } }, async req => {
    const { workspaceId } = await getContext(app.container, req);
    return service.recalculate(workspaceId, req.params.id);
  });
}
