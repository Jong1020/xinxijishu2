export enum ModelProvider {
  GEMINI = 'GEMINI',
  DEEPSEEK = 'DEEPSEEK'
}

export enum GeminiModel {
  FLASH = 'gemini-2.5-flash-latest',
  PRO = 'gemini-3-pro-preview'
}

export interface GradingRule {
  id: string;
  description: string;
  points: number;
  category: string;
}

export interface ExamConfig {
  title: string;
  totalScore: number;
  rules: GradingRule[];
}

export interface StudentFile {
  id: string;
  name: string;
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'error';
  rawXml?: {
    document: string;
    styles: string;
  };
  result?: GradingResult;
  errorMsg?: string;
}

export interface RuleResult {
  ruleId: string;
  passed: boolean;
  score: number; // Actual points awarded
  reasoning: string;
  extractedValue?: string;
}

export interface GradingResult {
  totalScore: number;
  maxScore: number;
  details: RuleResult[];
  summary: string;
}

export interface AIConfig {
  provider: ModelProvider;
  geminiModel: string;
  deepSeekBaseUrl: string;
  deepSeekModel: string;
  concurrency: number;
}