import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

export default async function blastRoutes(base: FastifyInstance) {
  const app = base.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);
  app.get('/pulls/:id/blast', { schema: { params: IdParams, response: { 200: BlastRadius } } }, async req => {
    const { workspaceId } = await getContext(app.container, req);
    const { repoId, document: result } = await service.forPull(workspaceId, req.params.id);
    app.log.info({ prId: req.params.id, repoId, counts: result.counts, source: 'persisted-repo-intel',
      indexedSha: result.indexed_sha, degraded: result.degraded, reason: result.reason }, 'blast radius read');
    return result;
  });
}
