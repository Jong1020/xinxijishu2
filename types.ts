export enum ModelProvider {
  GEMINI = 'GEMINI',
  DEEPSEEK = 'DEEPSEEK',
  QWEN = 'QWEN',
  DOUBAO = 'DOUBAO'
}

export enum GeminiModel {
  FLASH = 'gemini-3-flash-preview',
  PRO = 'gemini-3-pro-preview'
}

export interface GradingRule {
  id: string;
  description: string;
  points: number;
  category: string;
}

export interface DocxData {
  document: string;
  styles: string;
  comments: string;
  rels: string;
  numbering: string;
}

export interface StudentFile {
  id: string;
  name: string;
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress?: number;
  rawXml?: DocxData;
  result?: GradingResult;
  errorMsg?: string;
}

export interface RuleResult {
  ruleId: string;
  passed: boolean;
  score: number;
  reasoning: string;
  extractedValue?: string;
  originalValue?: string;
}

export interface GradingResult {
  totalScore: number;
  maxScore: number;
  details: RuleResult[];
  summary: string;
}

export interface AIConfig {
  provider: ModelProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  concurrency: number;
}