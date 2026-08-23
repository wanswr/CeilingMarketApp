export enum AssistantNoteStatus {
  DRAFT = 'DRAFT',
  STRUCTURED = 'STRUCTURED',
  ARCHIVED = 'ARCHIVED',
}

export enum AssistantNoteRevisionSource {
  MANUAL = 'MANUAL',
  VOICE = 'VOICE',
  AUTO = 'AUTO',
}

export enum AssistantNoteAttachmentType {
  AUDIO = 'AUDIO',
  IMAGE = 'IMAGE',
  FILE = 'FILE',
}

export enum AssistantNoteTranscriptionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface AssistantNoteAttachment {
  id: string;
  noteId: string;
  type: AssistantNoteAttachmentType;
  fileUrl: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  durationMs?: number | null;
  transcriptionStatus: AssistantNoteTranscriptionStatus;
  transcriptionText?: string | null;
  transcriptionError?: string | null;
  createdAt: string;
}

export interface AssistantNoteRevision {
  id: string;
  noteId: string;
  source: AssistantNoteRevisionSource;
  rawInput?: string | null;
  previousData?: any | null;
  newData?: any | null;
  createdAt: string;
}

export interface AssistantNote {
  id: string;
  userId: string;
  title: string;
  rawText?: string | null;
  structuredData?: Record<string, any> | null;
  status: AssistantNoteStatus;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  attachments?: AssistantNoteAttachment[];
  revisions?: AssistantNoteRevision[];
}

export interface CreateAssistantNoteDto {
  title: string;
  rawText?: string;
  structuredData?: Record<string, any>;
}

export interface UpdateAssistantNoteDto {
  title?: string;
  rawText?: string;
  structuredData?: Record<string, any>;
  status?: AssistantNoteStatus;
}
