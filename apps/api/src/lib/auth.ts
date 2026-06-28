import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyApiKey } from './apikeys.js';

export const API_KEY_HEADER = 'x-api-key';

/**
 * preHandler que exige uma chave de API válida no header `X-API-Key`.
 * Use nas rotas de dados (items). Metadados (landing, collections) ficam públicos.
 */
export async function requireApiKey(req: FastifyRequest, reply: FastifyReply) {
  const headerVal = req.headers[API_KEY_HEADER];
  const key = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  const info = await verifyApiKey(key);
  if (!info) {
    return reply.code(401).send({
      code: 'unauthorized',
      description: 'Chave de API ausente ou inválida. Gere uma em /portal e envie no header X-API-Key.',
    });
  }
  // disponibiliza a identidade da chave para handlers/logs, se necessário
  (req as FastifyRequest & { apiKey?: unknown }).apiKey = info;
}
