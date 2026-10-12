import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';
const Update = z.object({ rule: z.string().min(1).optional(), category: z.string().min(1).optional(), status: z.enum(['pending', 'accepted', 'rejected']).optional() });
const Create = z.object({ name: z.string().min(1), description: z.string().default(''), body: z.string().min(1).optional() });
export default async function conventionsRoutes(base: FastifyInstance) {
  const app = base.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);
  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async req => service.list((await getContext(app.container, req)).workspaceId, req.params.id));
  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams }, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async req => service.extract((await getContext(app.container, req)).workspaceId, req.params.id));
  app.put('/conventions/:id', { schema: { params: IdParams, body: Update } }, async req => service.update((await getContext(app.container, req)).workspaceId, req.params.id, req.body));
  app.post('/repos/:id/conventions/skill', { schema: { params: IdParams, body: Create } }, async req => service.createSkill((await getContext(app.container, req)).workspaceId, req.params.id, req.body.name, req.body.description, req.body.body));
}
