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

export enum AssistantNoteEditProposalStatus {
  PENDING = 'PENDING',
  APPLIED = 'APPLIED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  STALE = 'STALE',
}

export enum AssistantReminderStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
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

export interface AssistantReminder {
  id: string;
  userId: string;
  noteId?: string | null;
  title: string;
  description?: string | null;
  scheduledAt: string;
  status: AssistantReminderStatus;
  sourceTaskId?: string | null;
  sourceDateId?: string | null;
  notificationId?: string | null;
  idempotencyKey?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
}

export interface CreateReminderDto {
  title: string;
  description?: string;
  scheduledAt: string;
  noteId?: string;
  sourceTaskId?: string;
  sourceDateId?: string;
  notificationId?: string;
  idempotencyKey?: string;
}

export interface UpdateReminderDto {
  title?: string;
  description?: string;
  scheduledAt?: string;
  notificationId?: string;
}

export interface AssistantNoteStructuredItem {
  id?: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  sourceText?: string | null;
  confidence?: number | null;
}

export interface AssistantNoteStructuredSection {
  id?: string;
  name: string;
  items: AssistantNoteStructuredItem[];
}

export interface AssistantNoteStructuredDate {
  id?: string;
  text: string;
  resolvedDate?: string | null;
  confidence?: number | null;
}

export interface AssistantNoteStructuredTask {
  id?: string;
  text: string;
  dateText?: string | null;
  confidence?: number | null;
}

export interface AssistantNoteStructuredUncertainty {
  id?: string;
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

export interface AssistantNoteEditOperation {
  operation:
    | 'UPDATE_ITEM'
    | 'ADD_ITEM'
    | 'REMOVE_ITEM'
    | 'ADD_TASK'
    | 'UPDATE_TASK'
    | 'REMOVE_TASK'
    | 'ADD_DATE'
    | 'UPDATE_DATE'
    | 'UPDATE_TITLE';
  targetId?: string | null;
  section?: string | null;
  field?: string | null;
  oldValue?: any;
  newValue?: any;
  item?: AssistantNoteStructuredItem | null;
  task?: AssistantNoteStructuredTask | null;
  date?: AssistantNoteStructuredDate | null;
  title?: string | null;
  reason: string;
}

export interface AssistantNoteEditProposal {
  id: string;
  noteId: string;
  userId: string;
  baseVersion: number;
  inputType: 'TEXT' | 'VOICE';
  rawInput: string;
  operations: AssistantNoteEditOperation[];
  uncertainties?: AssistantNoteStructuredUncertainty[];
  summary?: string;
  status: AssistantNoteEditProposalStatus;
  createdAt: string;
}

export interface AssistantNote {
  id: string;
  userId: string;
  title: string;
  rawText?: string | null;
  structuredData?: AssistantNoteStructuredOutput | Record<string, any> | null;
  status: AssistantNoteStatus;
  version: number;
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
  reminders?: AssistantReminder[];
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
