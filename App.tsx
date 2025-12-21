import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { RuleEditor } from './components/RuleEditor';
import { FileUploader } from './components/FileUploader';
import { GradingDashboard } from './components/GradingDashboard';
import { GradingRule, StudentFile, AIConfig, ModelProvider, GeminiModel, DeepSeekModel, DocxData } from './types';

function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [examTitle, setExamTitle] = useState('新考试');
  const [totalScore, setTotalScore] = useState(100);
  const [rules, setRules] = useState<GradingRule[]>([]);
  const [files, setFiles] = useState<StudentFile[]>([]);
  // State for the "Template/Original" file for differential grading
  const [templateData, setTemplateData] = useState<DocxData | null>(null);
  
  // Configuration State
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: ModelProvider.GEMINI,
    geminiModel: GeminiModel.FLASH,
    deepSeekBaseUrl: 'https://api.deepseek.com', // Default
    deepSeekModel: DeepSeekModel.CHAT,
    concurrency: 5
  });

  const updateFileStatus = (id: string, updates: Partial<StudentFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  return (
    <Layout currentStep={currentStep}>
      {currentStep === 1 && (
        <div className="space-y-8">
           {/* Basic AI Settings Panel inside Setup */}
           <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-wrap gap-6 items-center text-sm">
              <div className="flex items-center gap-2">
                <label className="font-medium text-slate-700">模型服务商:</label>
                <select 
                  value={aiConfig.provider}
                  onChange={(e) => setAiConfig({...aiConfig, provider: e.target.value as ModelProvider})}
                  className="bg-slate-50 border border-slate-300 rounded px-2 py-1"
                >
                  <option value={ModelProvider.GEMINI}>Google Gemini</option>
                  <option value={ModelProvider.DEEPSEEK}>DeepSeek</option>
                </select>
              </div>

              {aiConfig.provider === ModelProvider.GEMINI ? (
                <div className="flex items-center gap-2">
                  <label className="font-medium text-slate-700">模型:</label>
                   <select 
                    value={aiConfig.geminiModel}
                    onChange={(e) => setAiConfig({...aiConfig, geminiModel: e.target.value})}
                    className="bg-slate-50 border border-slate-300 rounded px-2 py-1"
                  >
                    <option value={GeminiModel.FLASH}>Gemini 2.0 Flash</option>
                    <option value={GeminiModel.PRO}>Gemini 1.5 Pro</option>
                  </select>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <label className="font-medium text-slate-700">代理地址 (Base URL):</label>
                    <input 
                      type="text" 
                      value={aiConfig.deepSeekBaseUrl}
                      onChange={(e) => setAiConfig({...aiConfig, deepSeekBaseUrl: e.target.value})}
                      placeholder="https://api.deepseek.com"
                      className="bg-slate-50 border border-slate-300 rounded px-2 py-1 w-48"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="font-medium text-slate-700">模型名称:</label>
                     <select 
                      value={aiConfig.deepSeekModel}
                      onChange={(e) => setAiConfig({...aiConfig, deepSeekModel: e.target.value})}
                      className="bg-slate-50 border border-slate-300 rounded px-2 py-1"
                    >
                      <option value="deepseek-chat">deepseek-chat (V3)</option>
                      <option value="deepseek-reasoner">deepseek-reasoner (R1)</option>
                    </select>
                  </div>
                </>
              )}

              <div className="flex items-center gap-2">
                <label className="font-medium text-slate-700">并发数:</label>
                <select 
                   value={aiConfig.concurrency}
                   onChange={(e) => setAiConfig({...aiConfig, concurrency: Number(e.target.value)})}
                   className="bg-slate-50 border border-slate-300 rounded px-2 py-1"
                >
                  <option value={1}>1</option>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                </select>
              </div>
           </div>

           <RuleEditor 
              rules={rules} 
              setRules={setRules}
              examTitle={examTitle}
              setExamTitle={setExamTitle}
              totalScore={totalScore}
              setTotalScore={setTotalScore}
              templateData={templateData}
              setTemplateData={setTemplateData}
              onNext={() => setCurrentStep(2)}
           />
        </div>
      )}

      {currentStep === 2 && (
        <FileUploader 
          onFilesAdded={(newFiles) => setFiles([...files, ...newFiles])}
          onNext={() => setCurrentStep(3)}
          hasFiles={files.length > 0}
        />
      )}

      {currentStep === 3 && (
        <GradingDashboard 
          files={files}
          rules={rules}
          aiConfig={aiConfig}
          templateData={templateData}
          updateFileStatus={updateFileStatus}
        />
      )}
    </Layout>
  );
}

export default App;