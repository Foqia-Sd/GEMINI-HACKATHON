
export enum Role {
  USER = 'user',
  ASSISTANT = 'assistant'
}

export interface Message {
  role: Role;
  content: string;
  timestamp: number;
}

export interface GrammarCorrection {
  original: string;
  corrected: string;
}

export interface EvaluationResult {
  band_score: number;
  feedback: string;
  grammar_corrections: GrammarCorrection[];
  tips: string[];
}

export interface SpeechState {
  isListening: boolean;
  transcript: string;
  isProcessing: boolean;
  error: string | null;
}
