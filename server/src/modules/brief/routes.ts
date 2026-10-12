import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefService } from './service.js';

export default async function briefRoutes(base: FastifyInstance) {
  const app = base.withTypeProvider<ZodTypeProvider>();
  const service = new BriefService(app.container, event => app.log.info(event, 'PR brief'));
  app.get('/pulls/:id/brief', { schema: { params: IdParams, response: { 200: BriefResponse } } }, async req => {
    const { workspaceId } = await getContext(app.container, req);
    return service.read(workspaceId, req.params.id);
  });
  app.post('/pulls/:id/brief', { schema: { params: IdParams, response: { 200: BriefResponse } } }, async req => {
    const { workspaceId } = await getContext(app.container, req);
    return service.generate(workspaceId, req.params.id);
  });
}
