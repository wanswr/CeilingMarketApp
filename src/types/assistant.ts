export enum AssistantNoteStatus {
  DRAFT = 'DRAFT',
  STRUCTURED = 'STRUCTURED',
  ARCHIVED = 'ARCHIVED',
}

export enum AssistantNoteRevisionSource {
  MANUAL = 'MANUAL',
  VOICE = 'VOICE',
  AUTO = 'AUTO',
  AI_PATCH = 'AI_PATCH',
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

export enum AssistantNoteAnalysisStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  STALE = 'STALE',
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

export interface AssistantNoteStructuredItem {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  sourceText?: string | null;
  confidence?: number | null;
}

export interface AssistantNoteStructuredSection {
  name: string;
  items: AssistantNoteStructuredItem[];
}

export interface AssistantNoteStructuredDate {
  text: string;
  resolvedDate?: string | null;
  confidence?: number | null;
}

export interface AssistantNoteStructuredTask {
  text: string;
  dateText?: string | null;
  confidence?: number | null;
}

export interface AssistantNoteStructuredUncertainty {
  question: string;
  sourceText?: string | null;
}

export interface AssistantNoteSuggestedAction {
  type: 'SAVE' | 'CREATE_TABLE' | 'CREATE_REMINDER' | 'CREATE_ORDER_DRAFT' | 'EDIT_NOTE' | 'ASK_CLARIFICATION';
  reason: string;
}

export interface AssistantNoteStructuredOutput {
  titleSuggestion?: string;
  summary?: string;
  sections?: AssistantNoteStructuredSection[];
  items?: AssistantNoteStructuredItem[];
  dates?: AssistantNoteStructuredDate[];
  tasks?: AssistantNoteStructuredTask[];
  people?: string[];
  locations?: string[];
  comments?: string[];
  uncertainties?: AssistantNoteStructuredUncertainty[];
  suggestedActions?: AssistantNoteSuggestedAction[];
}

export interface AssistantNote {
  id: string;
  userId: string;
  title: string;
  rawText?: string | null;
  structuredData?: AssistantNoteStructuredOutput | Record<string, any> | null;
  status: AssistantNoteStatus;
  analysisStatus: AssistantNoteAnalysisStatus;
  analysisInputHash?: string | null;
  analyzedAt?: string | null;
  analysisModel?: string | null;
  analysisError?: string | null;
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
