export type VibeNoteCreator = {id: string; name: string; avatarUrl: string | null};

/** A row of `GET /vibe-notes/nearby`. Outside the note's own radius the server sends only a `preview`, never the `body`. */
export type VibeNote = {
  id: string;
  body?: string;
  preview?: string;
  /** Metres from the viewer's last posted location. */
  distanceMeters?: number;
  radiusMeters: number;
  expiresAt: string;
  createdAt: string;
  isUnlocked: boolean;
  creator: VibeNoteCreator;
};

/** `POST /vibe-notes` body. The server clamps `expiresInMinutes` to the plan's lifetime limit. */
export type NewVibeNote = {
  body: string;
  lat: number;
  lng: number;
  radiusMeters?: number;
  expiresInMinutes?: number;
};

/** `POST /vibe-notes` response (201). */
export type CreatedVibeNote = {id: string; body: string; radiusMeters: number; expiresAt: string; createdAt: string};

/** `GET /vibe-notes/mine`: own active notes, newest first; no device location needed. */
export type MyVibeNote = CreatedVibeNote;
