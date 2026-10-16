import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AttachedDocument } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

export default async function projectContextRoutes(base: FastifyInstance) {
  const app = base.withTypeProvider<ZodTypeProvider>();
  app.get('/repos/:id/project-context', { schema: { params: IdParams } }, async req => {
    const { workspaceId } = await getContext(app.container, req);
    return app.container.projectContext.list(workspaceId, req.params.id);
  });
  app.get('/repos/:id/project-context/document', { schema: { params: IdParams, querystring: z.object({ path: AttachedDocument.shape.path }) } }, async req => {
    const { workspaceId } = await getContext(app.container, req);
    return app.container.projectContext.preview(workspaceId, req.params.id, req.query.path);
  });
}
