export enum ModelProvider {
  GEMINI = 'GEMINI',
  DEEPSEEK = 'DEEPSEEK'
}

export enum GeminiModel {
  FLASH = 'gemini-2.0-flash-exp', // Updated to latest experimental flash often used
  PRO = 'gemini-1.5-pro'
}

export enum DeepSeekModel {
  CHAT = 'deepseek-chat',
  REASONER = 'deepseek-reasoner' // R1
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

export interface DocxData {
  document: string;
  styles: string;
  comments: string;
}

export interface StudentFile {
  id: string;
  name: string;
  file: File;
  status: 'pending' | 'processing' | 'completed' | 'error';
  rawXml?: DocxData;
  result?: GradingResult;
  errorMsg?: string;
}

export interface RuleResult {
  ruleId: string;
  passed: boolean;
  score: number; // Actual points awarded
  reasoning: string;
  extractedValue?: string; // What the student actually had
  originalValue?: string; // What was in the template (if applicable)
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