import React, { useState } from 'react';
import { GradingRule } from '../types';
import { generateRulesFromText } from '../services/gradingService';
import { Sparkles, Plus, Trash2, Save, Loader2 } from 'lucide-react';

interface RuleEditorProps {
  rules: GradingRule[];
  setRules: (rules: GradingRule[]) => void;
  examTitle: string;
  setExamTitle: (t: string) => void;
  totalScore: number;
  setTotalScore: (s: number) => void;
  onNext: () => void;
}

export const RuleEditor: React.FC<RuleEditorProps> = ({
  rules, setRules, examTitle, setExamTitle, totalScore, setTotalScore, onNext
}) => {
  const [descriptionInput, setDescriptionInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');

  const handleGenerate = async () => {
    if (!descriptionInput.trim()) return;
    setIsGenerating(true);
    setGenerationError('');
    try {
      const generatedRules = await generateRulesFromText(descriptionInput, totalScore);
      setRules(generatedRules);
    } catch (err) {
      setGenerationError("生成规则失败。请确保 API Key 设置正确。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddRule = () => {
    const newRule: GradingRule = {
      id: Date.now().toString(),
      description: "新评分点",
      points: 5,
      category: "通用"
    };
    setRules([...rules, newRule]);
  };

  const handleDeleteRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
  };

  const updateRule = (id: string, field: keyof GradingRule, value: string | number) => {
    setRules(rules.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const currentTotal = rules.reduce((sum, r) => sum + r.points, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left: Input & AI Generation */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-blue-600" />
            考试配置
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">考试标题</label>
              <input 
                type="text" 
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="例如：期中 Word 排版测试"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">总分</label>
              <input 
                type="number" 
                value={totalScore}
                onChange={(e) => setTotalScore(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 bg-gradient-to-b from-indigo-50 to-white">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-indigo-900">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            AI 智能识别导入
          </h2>
          <p className="text-sm text-slate-600 mb-3">
            在此粘贴试题要求文字，AI 将自动拆解为具体的评分规则。
          </p>
          <textarea
            value={descriptionInput}
            onChange={(e) => setDescriptionInput(e.target.value)}
            className="w-full h-40 px-3 py-2 border border-indigo-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
            placeholder="例如：1. 将标题设置为 Arial、16号、加粗。 2. 插入一个3列的表格..."
          />
          {generationError && <p className="text-red-500 text-xs mt-2">{generationError}</p>}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !descriptionInput}
            className="mt-3 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-md transition-colors disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            生成规则
          </button>
        </div>
      </div>

      {/* Right: Rules List */}
      <div className="lg:col-span-2">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 min-h-[600px] flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold">评分规则列表</h2>
            <div className="flex items-center gap-4">
               <span className={`text-sm font-medium px-3 py-1 rounded-full ${currentTotal === totalScore ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                当前总分: {currentTotal} / {totalScore}
              </span>
              <button onClick={handleAddRule} className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm font-medium">
                <Plus className="w-4 h-4" /> 添加规则
              </button>
            </div>
          </div>

          <div className="flex-grow space-y-3 overflow-y-auto pr-2">
            {rules.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-slate-300" />
                </div>
                <p>暂无评分规则。</p>
                <p className="text-sm">请使用 AI 导入或手动添加。</p>
              </div>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} className="group flex gap-4 items-start p-4 border border-slate-100 rounded-lg hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                  <div className="flex-grow grid grid-cols-12 gap-4">
                    <div className="col-span-7">
                      <input
                        type="text"
                        value={rule.description}
                        onChange={(e) => updateRule(rule.id, 'description', e.target.value)}
                        className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-800 placeholder-slate-400"
                        placeholder="规则描述"
                      />
                    </div>
                    <div className="col-span-3">
                       <input
                        type="text"
                        value={rule.category}
                        onChange={(e) => updateRule(rule.id, 'category', e.target.value)}
                        className="w-full bg-slate-100 border-none rounded px-2 py-1 text-xs text-slate-600 focus:ring-0"
                        placeholder="分类"
                      />
                    </div>
                    <div className="col-span-2">
                       <input
                        type="number"
                        value={rule.points}
                        onChange={(e) => updateRule(rule.id, 'points', Number(e.target.value))}
                        className="w-full bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-800 text-right"
                      />
                    </div>
                  </div>
                  <button onClick={() => handleDeleteRule(rule.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
             <button
              onClick={onNext}
              disabled={rules.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              保存并继续
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper component for icon
const SettingsIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
);