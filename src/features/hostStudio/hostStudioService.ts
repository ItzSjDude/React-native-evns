import {apiRequest} from '../../core/api/apiClient';
import {NOTES_MAX, QUESTION_MAX, TEMPLATE_NAME_MAX} from './types';
import type {PartyQuestion, PartyTemplate, QuestionStatus, RunOfShow, SubmittedQuestion, TemplateConfig} from './types';

const json = (method: string, body?: unknown) => ({auth: 'required' as const, method, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
const base = '/host-studio';

export const listTemplates = () => apiRequest<PartyTemplate[]>(`${base}/templates`, {auth: 'required'});
/** Same name overwrites that template (server upserts on owner + name). */
export const saveTemplate = (name: string, config: TemplateConfig) => apiRequest<PartyTemplate>(`${base}/templates`, json('POST', {name, config}));
export const deleteTemplate = (templateId: string) => apiRequest<void>(`${base}/templates/${templateId}`, json('DELETE'));

export const getRunOfShow = (partyId: string) => apiRequest<RunOfShow>(`${base}/parties/${partyId}/run-of-show`, {auth: 'required'});
export const saveRunOfShow = (partyId: string, notes: string) => apiRequest<RunOfShow>(`${base}/parties/${partyId}/run-of-show`, json('PUT', {notes}));

export const listQuestions = (partyId: string) => apiRequest<PartyQuestion[]>(`${base}/parties/${partyId}/questions`, {auth: 'required'});
export const submitQuestion = (partyId: string, body: string) => apiRequest<SubmittedQuestion>(`${base}/parties/${partyId}/questions`, json('POST', {body}));
export const updateQuestion = (partyId: string, questionId: string, patch: {status?: QuestionStatus; position?: number}) =>
  apiRequest<PartyQuestion>(`${base}/parties/${partyId}/questions/${questionId}`, json('PATCH', patch));

/**
 * Trims to the backend's limits and drops empty optionals so a save never trips the strict validator.
 * Returns null when the name is unusable (1-60 chars after trim).
 */
export function buildTemplate(name: string, config: TemplateConfig): {name: string; config: TemplateConfig} | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > TEMPLATE_NAME_MAX) return null;
  const out: TemplateConfig = {};
  const title = config.title?.trim().slice(0, 120);
  if (title) out.title = title;
  if (config.topic?.trim()) out.topic = config.topic.trim().slice(0, 120);
  if (config.category?.trim()) out.category = config.category.trim().slice(0, 40);
  if (config.language?.trim()) out.language = config.language.trim().slice(0, 20);
  if (config.kind) out.kind = config.kind;
  if (config.visibility) out.visibility = config.visibility;
  if (config.seatCount !== undefined) out.seatCount = Math.min(8, Math.max(2, Math.round(config.seatCount)));
  const tags = (config.interestTags || []).map(tag => tag.trim().slice(0, 40)).filter(Boolean).slice(0, 10);
  if (tags.length) out.interestTags = tags;
  return {name: trimmed, config: out};
}

export const isValidQuestion = (body: string) => !!body.trim() && body.trim().length <= QUESTION_MAX;
export const isValidNotes = (notes: string) => notes.length <= NOTES_MAX;

export const errorStatus = (error: unknown) => (error as {status?: number} | null)?.status ?? 0;
/**
 * `host_studio.enabled` off => every route 404s. Missing Organizer Pro `host_studio` entitlement => 403.
 * A non-roster caller also gets 404. All three mean "hide Host Studio", never "retry".
 */
export const isUnavailable = (error: unknown) => [403, 404].includes(errorStatus(error));
export const errorMessage = (error: unknown, fallback: string) => {
  const message = (error as {message?: string} | null)?.message;
  return typeof message === 'string' && message ? message : fallback;
};
