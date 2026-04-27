/**
 * Consult Prompt Builder
 *
 * Produces the prompt sent to each model when CC consults the panel via
 * /multi-consult. One identical template for all three adapters — no per-model
 * role lean. The 5-section response structure is enforced by the prompt
 * (lightly validated post-hoc in tools/consult.ts).
 */
import { ConsultRequest } from './adapters/base.js';
export declare function buildConsultPrompt(request: ConsultRequest): string;
