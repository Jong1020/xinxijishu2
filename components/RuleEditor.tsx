import React, { useState } from 'react';
import { GradingRule, DocxData, AIConfig } from '../types';
import { generateRulesFromText, generateRulesFromTemplate } from '../services/gradingService';
import { parseDocx } from '../services/docxService';
import { Sparkles, Plus, Trash2, Save, Loader2, FileUp, Check, Settings as SettingsIcon, Wand2, MessageSquare } from 'lucide-react';

interface RuleEditorProps {
  rules: GradingRule[];
  setRules: (rules: GradingRule[]) => void;
  examTitle: string;
  setExamTitle: (t: string) => void;
  totalScore: number;
  setTotalScore: (s: number) => void;
  templateData: DocxData | null;
  setTemplateData: (data: DocxData | null) => void;
  aiConfig: AIConfig;
  onNext: () => void;
}

export const RuleEditor: React.FC<RuleEditorProps> = ({
  rules, setRules, examTitle, setExamTitle, totalScore, setTotalScore, templateData, setTemplateData, aiConfig, onNext
}) => {
  const [descriptionInput, setDescriptionInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isParsingTemplate, setIsParsingTemplate] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [templateFileName, setTemplateFileName] = useState('');

  const handleGenerate = async () => {
    if (!descriptionInput.trim()) return;
    setIsGenerating(true);
    setGenerationError('');
    try {
      const generatedRules = await generateRulesFromText(descriptionInput, totalScore, aiConfig);
      setRules(generatedRules);
    } catch (err: any) {
      setGenerationError(`规则生成失败: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateFromTemplate = async () => {
    if (!templateData) return;
    setIsParsingTemplate(true);
    setGenerationError('');
    try {
      const generatedRules = await generateRulesFromTemplate(templateData, totalScore, aiConfig);
      if (generatedRules.length > 0) {
        setRules(generatedRules);
      } else {
        setGenerationError("未在文档批注中发现有效的操作要求。");
      }
    } catch (err: any) {
      setGenerationError(`素材识别失败: ${err.message}`);
    } finally {
      setIsParsingTemplate(false);
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

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        setTemplateFileName(file.name);
        const data = await parseDocx(file);
        setTemplateData(data);
      } catch (err) {
        alert("模板解析失败");
      }
    }
  };

  const currentTotal = rules.reduce((sum, r) => sum + r.points, 0);

  // 计算批注数量（简单正则匹配）
  const commentCount = templateData?.comments.match(/<w:comment /g)?.length || 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-blue-600" /> 考试配置
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">考试标题</label>
              <input 
                type="text" value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">满分值</label>
              <input 
                type="number" value={totalScore}
                onChange={(e) => setTotalScore(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2 text-indigo-900">
            <FileUp className="w-5 h-5 text-indigo-600" /> 原始素材 (高精度模式)
          </h2>
          <p className="text-xs text-slate-500 mb-4">上传包含“批注”要求的 Word 文档，AI 将自动识别评分点。</p>
          <input type="file" accept=".docx" onChange={handleTemplateUpload} className="hidden" id="tpl-up" />
          <label htmlFor="tpl-up" className={`flex flex-col items-center justify-center w-full px-4 py-6 border-2 border-dashed rounded-lg cursor-pointer transition-all ${templateData ? 'border-green-300 bg-green-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}>
            {templateData ? (
              <div className="text-center">
                <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <span className="text-sm text-green-700 font-medium block truncate max-w-[200px]">{templateFileName}</span>
                <span className="text-[10px] text-green-600 mt-1 flex items-center justify-center gap-1">
                  <MessageSquare className="w-3 h-3" /> 已识别 {commentCount} 条批注要求
                </span>
              </div>
            ) : (
              <div className="text-center">
                <FileUp className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <span className="text-sm text-slate-500">点击上传文档 (.docx)</span>
              </div>
            )}
          </label>

          {templateData && (
            <button
              onClick={handleGenerateFromTemplate}
              disabled={isParsingTemplate}
              className="mt-4 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white py-2.5 px-4 rounded-lg font-semibold transition-all shadow-md disabled:opacity-50"
            >
              {isParsingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              识别批注并生成规则
            </button>
          )}
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 bg-gradient-to-b from-indigo-50/30 to-white">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-indigo-900">
            <Sparkles className="w-5 h-5 text-indigo-600" /> 文字导入
          </h2>
          <textarea
            value={descriptionInput}
            onChange={(e) => setDescriptionInput(e.target.value)}
            className="w-full h-40 px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
            placeholder="如果没有模板文档，请直接粘贴试题要求..."
          />
          {generationError && <p className="text-red-500 text-[11px] mt-2 font-medium">{generationError}</p>}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !descriptionInput.trim()}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-indigo-100 text-indigo-700 py-2 px-4 rounded-lg font-medium hover:bg-indigo-200 transition-colors disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            生成评分规则
          </button>
        </div>
      </div>

      <div className="lg:col-span-2 flex flex-col h-full space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-grow flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h2 className="font-semibold text-slate-800">评分规则明细</h2>
            <div className={`text-sm font-bold px-3 py-1 rounded-full ${currentTotal === totalScore ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              当前总分: {currentTotal} / {totalScore}
            </div>
          </div>
          
          <div className="flex-grow overflow-y-auto p-4 space-y-3">
            {rules.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                <SettingsIcon className="w-16 h-16 mb-4 text-slate-200" />
                <p>请上传素材自动生成，或手动添加评分规则</p>
              </div>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} className="group flex items-start gap-3 p-3 border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all bg-white">
                  <div className="flex-grow space-y-2">
                    <input
                      type="text"
                      value={rule.description}
                      onChange={(e) => updateRule(rule.id, 'description', e.target.value)}
                      className="w-full font-medium text-slate-800 border-none p-0 focus:ring-0 placeholder-slate-300"
                      placeholder="评分点描述"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">ID: {rule.id.slice(0,6)}</span>
                      <input
                        type="text"
                        value={rule.category}
                        onChange={(e) => updateRule(rule.id, 'category', e.target.value)}
                        className="text-xs text-slate-500 bg-transparent border-b border-dashed border-slate-300 w-24 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-slate-50 rounded-md px-2 py-1 border border-slate-200">
                      <span className="text-xs text-slate-500">分值</span>
                      <input
                        type="number"
                        value={rule.points}
                        onChange={(e) => updateRule(rule.id, 'points', Number(e.target.value))}
                        className="w-12 text-center text-sm font-bold text-blue-600 bg-transparent outline-none"
                      />
                    </div>
                    <button 
                      onClick={() => handleDeleteRule(rule.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
            <button
              onClick={handleAddRule}
              className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
            >
              <Plus className="w-4 h-4" /> 添加规则
            </button>
            <button
              onClick={onNext}
              disabled={rules.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> 保存并下一步
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};