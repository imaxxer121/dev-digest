import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { EvalCaseConversion, EvalCaseCollection, EvalBatchStarted, EvalBatchSummary, EvalBatchDetail, EvalDashboardResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalsService } from './service.js';

// Fastify passes null to validators when a body is absent. Normalize only the
// genuinely absent request body, leaving explicit JSON null/other invalid data.
const emptyActionBody = async (req: FastifyRequest) => { if (req.body === undefined) req.body = {}; };

export default async function evalRoutes(base: FastifyInstance) {
  const app = base.withTypeProvider<ZodTypeProvider>();
  const service = new EvalsService(app.container, error => app.log.error({ error }, 'Eval execution failed'));
  app.post('/findings/:id/eval-case', { preValidation: emptyActionBody, schema: { params: IdParams, body: z.object({ notes: z.string().max(2000).optional() }).strict().optional(), response: { 200: EvalCaseConversion, 201: EvalCaseConversion } } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.convert(workspaceId, req.params.id, req.body?.notes);
    return reply.status(result.created ? 201 : 200).send(result);
  });
  app.get('/agents/:id/eval-cases', { schema: { params: IdParams, response: { 200: EvalCaseCollection } } }, async req => service.cases((await getContext(app.container, req)).workspaceId, req.params.id));
  app.post('/agents/:id/eval-runs', { preValidation: emptyActionBody, schema: { params: IdParams, body: z.object({}).strict().optional(), response: { 202: EvalBatchStarted } } }, async (req, reply) =>
    reply.status(202).send(await service.start((await getContext(app.container, req)).workspaceId, req.params.id)));
  app.get('/agents/:id/eval-runs', { schema: { params: IdParams, response: { 200: z.array(EvalBatchSummary) } } }, async req => service.history((await getContext(app.container, req)).workspaceId, req.params.id));
  app.get('/eval-runs/:batchId', { schema: { params: z.object({ batchId: z.string().uuid() }), response: { 200: EvalBatchDetail } } }, async req => service.detail((await getContext(app.container, req)).workspaceId, req.params.batchId));
  app.get('/eval-dashboard', { schema: { response: { 200: EvalDashboardResponse } } }, async req => service.dashboard((await getContext(app.container, req)).workspaceId));
}
