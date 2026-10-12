/** Contracts for gathr-api `/host-studio/*`. Rows come back as raw DB rows (snake_case) except question avatars. */

/** Mirrors the backend's strict template config schema; anything else (chat, requests, slow mode) is rejected with 400. */
export type TemplateConfig = {
  kind?: 'AUDIO' | 'VIDEO';
  seatCount?: number;
  title?: string;
  topic?: string;
  category?: string;
  language?: string;
  visibility?: 'PUBLIC' | 'PRIVATE';
  interestTags?: string[];
};

export type PartyTemplate = {id: string; owner_user_id: string; name: string; config: TemplateConfig; created_at: string; updated_at: string};

export type RunOfShow = {party_id: string; notes: string; updated_at: string | null};

export const QUESTION_STATUSES = ['PENDING', 'APPROVED', 'ANSWERED', 'DISMISSED'] as const;
export type QuestionStatus = typeof QUESTION_STATUSES[number];

/** Manager queue row. DISMISSED rows are never listed by the server. */
export type PartyQuestion = {
  id: string; party_id: string; user_id: string; name: string | null; avatarUrl: string | null;
  body: string; status: QuestionStatus; position: number; created_at: string;
};
/** Submit response: the raw inserted row. Only the audience's own echo; there is no endpoint for audience to list. */
export type SubmittedQuestion = {id: string; party_id: string; user_id: string; body: string; status: QuestionStatus; position: number; created_at: string};

export const TEMPLATE_NAME_MAX = 60;
export const NOTES_MAX = 10000;
export const QUESTION_MAX = 500;
