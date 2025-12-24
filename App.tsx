import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { RuleEditor } from './components/RuleEditor';
import { FileUploader } from './components/FileUploader';
import { GradingDashboard } from './components/GradingDashboard';
import { GradingRule, StudentFile, AIConfig, ModelProvider, DocxData, GeminiModel } from './types';
import { Eye, EyeOff, Settings, Info, Wifi, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Save, Upload } from 'lucide-react';
import { testConnection } from './services/gradingService';

const PROVIDER_DEFAULTS: Record<ModelProvider, { baseUrl: string; model: string; hint: string }> = {
  [ModelProvider.GEMINI]: { 
    baseUrl: '', 
    model: GeminiModel.FLASH, 
    hint: '已集成 Google AI Studio 环境。API Key 将自动从系统获取。' 
  },
  [ModelProvider.DEEPSEEK]: { 
    baseUrl: 'https://corsproxy.io/?https://api.deepseek.com', 
    model: 'deepseek-chat', 
    hint: '默认使用 CORS Proxy (corsproxy.io) 解决浏览器跨域限制。' 
  },
  [ModelProvider.QWEN]: { 
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', 
    model: 'qwen-max', 
    hint: '阿里云百炼/通义千问兼容模式。' 
  },
  [ModelProvider.DOUBAO]: { 
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', 
    model: 'ep-xxxxxxxx-xxxx', 
    hint: '火山引擎 Ark。需填写推理接入点 ID。' 
  },
};

const PROVIDER_URL_OPTIONS: Partial<Record<ModelProvider, { label: string; url: string }[]>> = {
  [ModelProvider.DEEPSEEK]: [
    { label: 'CORS Proxy (推荐)', url: 'https://corsproxy.io/?https://api.deepseek.com' },
    { label: 'DeepSeek 官方', url: 'https://api.deepseek.com' },
    { label: 'SiliconFlow (硅基流动)', url: 'https://api.siliconflow.cn/v1' }
  ],
  [ModelProvider.QWEN]: [
    { label: '阿里云百炼 (官方)', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }
  ],
  [ModelProvider.DOUBAO]: [
    { label: '火山引擎 Ark (官方)', url: 'https://ark.cn-beijing.volces.com/api/v3' }
  ]
};

// Helper to get today's formatted date
const getDefaultExamTitle = () => {
  const date = new Date();
  const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  return `信息技术考试 - ${dateStr}`;
};

function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [examTitle, setExamTitle] = useState(getDefaultExamTitle());
  const [totalScore, setTotalScore] = useState(100);
  const [rules, setRules] = useState<GradingRule[]>([]);
  const [files, setFiles] = useState<StudentFile[]>([]);
  const [templateData, setTemplateData] = useState<DocxData | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');
  const [isConfigCollapsed, setIsConfigCollapsed] = useState(false);
  
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
    const saved = localStorage.getItem('it-grader-config');
    if (saved) return JSON.parse(saved);
    return {
      provider: ModelProvider.GEMINI,
      apiKey: '',
      model: GeminiModel.FLASH,
      baseUrl: '',
      concurrency: 5
    };
  });

  useEffect(() => {
    localStorage.setItem('it-grader-config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  const handleProviderChange = (p: ModelProvider) => {
    setAiConfig({
      ...aiConfig,
      provider: p,
      model: PROVIDER_DEFAULTS[p].model,
      baseUrl: PROVIDER_DEFAULTS[p].baseUrl
    });
    setTestStatus('idle');
  };

  const handleTestConnection = async () => {
    if (testStatus === 'testing') return;
    
    setTestStatus('testing');
    setTestError('');
    
    try {
      await testConnection(aiConfig);
      setTestStatus('success');
    } catch (e: any) {
      setTestStatus('error');
      setTestError(e.message);
    }
  };

  const updateFileStatus = (id: string, updates: Partial<StudentFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleDeleteFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    // If the selected file is deleted, we might want to clear the selection in GradingDashboard,
    // but the component handles selection state internally (which will just show "select a file").
  };

  const handleAddFiles = (newFiles: StudentFile[]) => {
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleClearAll = () => {
    setFiles([]);
  };

  return (
    <Layout currentStep={currentStep} onStepClick={setCurrentStep}>
      {currentStep === 1 && (
        <div className="space-y-8">
           {/* Enhanced AI Settings Panel */}
           <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div 
                className="flex items-center justify-between p-6 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setIsConfigCollapsed(!isConfigCollapsed)}
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-slate-500" />
                  <h3 className="font-bold text-slate-800">模型与认证配置</h3>
                  {isConfigCollapsed && (
                    <span className="ml-4 px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs font-normal">
                      {aiConfig.provider} - {aiConfig.model}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); setCurrentStep(2); }}
                    disabled={rules.length === 0}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm mr-2"
                  >
                    <Save className="w-4 h-4" />
                    <span className="hidden sm:inline">保存并下一步</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {testStatus === 'success' && (
                      <span className="flex items-center gap-1 text-xs text-green-600 font-medium animate-in fade-in slide-in-from-right-2">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 连接成功
                      </span>
                    )}
                    {testStatus === 'error' && (
                      <span className="flex items-center gap-1 text-xs text-red-600 font-medium animate-in fade-in slide-in-from-right-2">
                        <XCircle className="w-3.5 h-3.5" /> 连接失败
                      </span>
                    )}
                  </div>
                  {isConfigCollapsed ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronUp className="w-5 h-5 text-slate-400" />}
                </div>
              </div>
              
              {!isConfigCollapsed && (
                <div className="p-6 space-y-6 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">模型供应商</label>
                      <select 
                        value={aiConfig.provider}
                        onChange={(e) => handleProviderChange(e.target.value as ModelProvider)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value={ModelProvider.GEMINI}>Google Gemini (直接调用)</option>
                        <option value={ModelProvider.DEEPSEEK}>DeepSeek</option>
                        <option value={ModelProvider.QWEN}>通义千问 (Alibaba)</option>
                        <option value={ModelProvider.DOUBAO}>豆包 (火山引擎 Ark)</option>
                      </select>
                    </div>

                    <div className={`lg:col-span-2 relative ${aiConfig.provider === ModelProvider.GEMINI ? 'opacity-50' : ''}`}>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                        {aiConfig.provider === ModelProvider.GEMINI ? 'API Key (托管模式)' : 'API Key'}
                      </label>
                      <div className="relative">
                        <input 
                          type={showKey ? "text" : "password"}
                          value={aiConfig.provider === ModelProvider.GEMINI ? '••••••••••••••••' : aiConfig.apiKey}
                          disabled={aiConfig.provider === ModelProvider.GEMINI}
                          onChange={(e) => {
                            setAiConfig({...aiConfig, apiKey: e.target.value});
                            setTestStatus('idle');
                          }}
                          placeholder={aiConfig.provider === ModelProvider.GEMINI ? "由 Google AI Studio 环境提供" : "从服务商后台获取的 API Key"}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-10 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                        />
                        {aiConfig.provider !== ModelProvider.GEMINI && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setShowKey(!showKey); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">并行评分数</label>
                      <select 
                        value={aiConfig.concurrency}
                        onChange={(e) => setAiConfig({...aiConfig, concurrency: Number(e.target.value)})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value={1}>1 (串行，最稳定)</option>
                        <option value={5}>5 (均衡)</option>
                        <option value={10}>10 (快速)</option>
                        <option value={20}>20 (极速)</option>
                      </select>
                    </div>

                    {aiConfig.provider !== ModelProvider.GEMINI && (
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">API 基础地址 (Base URL)</label>
                        <div className="space-y-2">
                          <input 
                            type="text"
                            value={aiConfig.baseUrl}
                            onChange={(e) => {
                              setAiConfig({...aiConfig, baseUrl: e.target.value});
                              setTestStatus('idle');
                            }}
                            placeholder={PROVIDER_DEFAULTS[aiConfig.provider].baseUrl}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                          />
                          {PROVIDER_URL_OPTIONS[aiConfig.provider] && (
                            <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1">
                              {PROVIDER_URL_OPTIONS[aiConfig.provider]?.map((opt, idx) => (
                                <button
                                  key={idx}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setAiConfig({...aiConfig, baseUrl: opt.url});
                                    setTestStatus('idle');
                                  }}
                                  className="text-[10px] px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-200 rounded-md transition-all cursor-pointer select-none"
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className={aiConfig.provider === ModelProvider.GEMINI ? "md:col-span-1" : "md:col-span-2"}>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                        {aiConfig.provider === ModelProvider.DOUBAO ? "推理接入点 ID (Endpoint ID)" : "模型名称 (Model Name)"}
                      </label>
                      {aiConfig.provider === ModelProvider.GEMINI ? (
                        <select 
                          value={aiConfig.model}
                          onChange={(e) => {
                            setAiConfig({...aiConfig, model: e.target.value});
                            setTestStatus('idle');
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                        >
                          <option value={GeminiModel.FLASH}>Gemini 3 Flash</option>
                          <option value={GeminiModel.PRO}>Gemini 3 Pro</option>
                        </select>
                      ) : aiConfig.provider === ModelProvider.DEEPSEEK ? (
                        <select 
                          value={aiConfig.model}
                          onChange={(e) => {
                            setAiConfig({...aiConfig, model: e.target.value});
                            setTestStatus('idle');
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none"
                        >
                          <option value="deepseek-chat">deepseek-chat (V3.2)</option>
                          <option value="deepseek-reasoner">deepseek-reasoner (R1)</option>
                        </select>
                      ) : (
                        <input 
                          type="text"
                          value={aiConfig.model}
                          onChange={(e) => {
                            setAiConfig({...aiConfig, model: e.target.value});
                            setTestStatus('idle');
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none font-mono"
                        />
                      )}
                    </div>
                  </div>
                  
                  {testStatus === 'error' && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 animate-in fade-in zoom-in-95">
                      <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700 leading-relaxed font-mono">
                        测试错误: {testError}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-blue-800 font-semibold mb-1">
                          {aiConfig.provider === ModelProvider.GEMINI ? "AI Studio 托管模式" : "手动配置模式"}
                        </p>
                        <p className="text-xs text-blue-700 leading-relaxed">
                          {PROVIDER_DEFAULTS[aiConfig.provider].hint} 
                          {aiConfig.provider === ModelProvider.DOUBAO && " 火山引擎 API 调用需使用推理接入点 ID。"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleTestConnection(); }}
                      disabled={testStatus === 'testing'}
                      className={`flex items-center gap-1.5 px-6 py-2 rounded-lg text-xs font-semibold transition-all border shrink-0
                        ${testStatus === 'testing' ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' : 
                          testStatus === 'success' ? 'bg-green-600 text-white border-green-600 hover:bg-green-700' :
                          testStatus === 'error' ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' :
                          'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'}`}
                    >
                      {testStatus === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                      {testStatus === 'testing' ? '测试中...' : '测试模型连接'}
                    </button>
                  </div>
                </div>
              )}
           </div>

           <RuleEditor 
              rules={rules} setRules={setRules}
              examTitle={examTitle} setExamTitle={setExamTitle}
              totalScore={totalScore} setTotalScore={setTotalScore}
              templateData={templateData} setTemplateData={setTemplateData}
              aiConfig={aiConfig}
           />
        </div>
      )}

      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-slate-500" />
                  <h3 className="font-bold text-slate-800">试卷管理</h3>
              </div>
              <button
                  onClick={() => setCurrentStep(3)}
                  disabled={files.length === 0}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                  <Save className="w-4 h-4" />
                  <span className="hidden sm:inline">保存并下一步</span>
              </button>
          </div>

          <FileUploader 
            files={files}
            onFilesAdded={(newFiles) => setFiles([...files, ...newFiles])}
            onFileDelete={handleDeleteFile}
          />
        </div>
      )}

      {currentStep === 3 && (
        <GradingDashboard 
          files={files} rules={rules}
          aiConfig={aiConfig} templateData={templateData}
          updateFileStatus={updateFileStatus}
          examTitle={examTitle}
          onAddFiles={handleAddFiles}
          onClearAll={handleClearAll}
          onDeleteFile={handleDeleteFile}
        />
      )}
    </Layout>
  );
}

export default App;