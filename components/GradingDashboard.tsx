
import React, { useState, useRef, useEffect } from 'react';
import { StudentFile, GradingRule, AIConfig, DocxData } from '../types';
import { parseDocx } from '../services/docxService';
import { gradeDocument } from '../services/gradingService';
import { 
  Play, RefreshCw, CheckCircle, XCircle, Download, Trash2, 
  ChevronDown, ChevronUp, AlertCircle, FileText, Search,
  Trophy, Star, Award, Zap, LayoutList
} from 'lucide-react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

// Level Configuration Helper
const getLevelInfo = (score: number, max: number, fileId?: string) => {
  const percentage = max > 0 ? Math.round((score / max) * 100) : 0;
  const seed = fileId ? fileId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
  const getQuote = (quotes: string[]) => quotes[seed % quotes.length];

  const levels = [
    { min: 100, label: "👑 王者归来", color: "text-yellow-600 bg-yellow-50 border-yellow-200", badgeColor: "bg-yellow-100 text-yellow-700", icon: Trophy, desc: "满分通关，独孤求败！", quote: getQuote(["完美的表现！", "你就是传说中的大神。"]) },
    { min: 80, label: "🦁 雄狮觉醒", color: "text-indigo-600 bg-indigo-50 border-indigo-200", badgeColor: "bg-indigo-100 text-indigo-700", icon: Award, desc: "实力强劲，气场全开。", quote: getQuote(["非常出色！", "基础非常扎实。"]) },
    { min: 60, label: "🛡️ 坚韧青铜", color: "text-violet-600 bg-violet-50 border-violet-200", badgeColor: "bg-violet-100 text-violet-700", icon: Star, desc: "基础扎实，稳扎稳打。", quote: getQuote(["合格！再接再厉。", "稳步前进中。"]) },
    { min: 0, label: "🌱 初入江湖", color: "text-slate-500 bg-slate-50 border-slate-200", badgeColor: "bg-slate-100 text-slate-600", icon: Zap, desc: "万事开头难，加油鸭！", quote: getQuote(["加油，你可以的！", "多试几次就能掌握。"]) }
  ];
  return { ...levels.find(l => percentage >= l.min) || levels[levels.length - 1], percentage };
};

interface GradingDashboardProps {
  files: StudentFile[];
  rules: GradingRule[];
  aiConfig: AIConfig;
  templateData: DocxData | null;
  updateFileStatus: (id: string, updates: Partial<StudentFile>) => void;
  examTitle: string;
  onAddFiles: (newFiles: StudentFile[]) => void;
  onClearAll: () => void;
  onDeleteFile: (id: string) => void;
}

export const GradingDashboard: React.FC<GradingDashboardProps> = ({ 
  files, rules, aiConfig, templateData, updateFileStatus, examTitle, onClearAll, onDeleteFile 
}) => {
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportOpts, setExportOpts] = useState({ excel: true, reports: true });
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => { processingRef.current = processing; }, [processing]);

  const processQueue = async () => {
    if (processingRef.current) return;
    if (rules.length === 0) {
      setValidationMsg("⚠️ 无法开始：请先设置评分规则");
      return;
    }
    
    const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error');
    if (pendingFiles.length === 0) return;

    setProcessing(true);
    processingRef.current = true;
    setValidationMsg(null);

    let index = 0;
    const total = pendingFiles.length;
    let active = 0;
    const concurrency = aiConfig.concurrency || 5;

    const runNext = async () => {
      if (index >= total || !processingRef.current) return;
      
      const file = pendingFiles[index++];
      active++;
      updateFileStatus(file.id, { status: 'processing', progress: 10 });

      try {
        const studentDoc = await parseDocx(file.file);
        updateFileStatus(file.id, { progress: 30 });
        const result = await gradeDocument(studentDoc, templateData, rules, aiConfig);
        updateFileStatus(file.id, { status: 'completed', result, progress: 100 });
      } catch (e: any) {
        updateFileStatus(file.id, { status: 'error', errorMsg: e.message, progress: 0 });
      } finally {
        active--;
        runNext();
        if (active === 0 && index >= total) setProcessing(false);
      }
    };

    const initial = Math.min(concurrency, total);
    for (let i = 0; i < initial; i++) runNext();
  };

  const generateReportHtml = (file: StudentFile) => {
    if (!file.result) return "";
    const levelInfo = getLevelInfo(file.result.totalScore, file.result.maxScore, file.id);
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:system-ui;padding:40px;color:#1e293b;line-height:1.6}h1{color:#2563eb}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #e2e8f0;padding:12px;text-align:left}th{bg-color:#f8fafc}.pass{color:#16a34a;font-weight:bold}.fail{color:#dc2626}</style></head><body><h1>${examTitle} - 成绩报告</h1><h2>姓名: ${file.name}</h2><h3>总分: ${file.result.totalScore} / ${file.result.maxScore} (${levelInfo.label})</h3><p>${levelInfo.desc}</p><table><thead><tr><th>考核点</th><th>得分</th><th>分析建议</th></tr></thead><tbody>${file.result.details.map(d => `<tr><td>${rules.find(r => r.id === d.ruleId)?.description}</td><td class="${d.passed ? 'pass' : 'fail'}">${d.score}</td><td>${d.reasoning}</td></tr>`).join('')}</tbody></table></body></html>`;
  };

  const executeBatchExport = async () => {
    const zip = new JSZip();
    if (exportOpts.excel) {
      const data = files.map(f => ({
        "文件名": f.name,
        "总分": f.result?.totalScore || 0,
        "评价": f.result ? getLevelInfo(f.result.totalScore, f.result.maxScore).label : "未评分",
        "状态": f.status === 'completed' ? "已完成" : f.status === 'error' ? "错误" : "待处理"
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "成绩汇总");
      zip.file(`${examTitle}_成绩表.xlsx`, XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    }
    if (exportOpts.reports) {
      files.forEach(f => {
        if (f.result) zip.file(`${f.name}_报告.html`, generateReportHtml(f));
      });
    }
    const content = await zip.generateAsync({ type: "blob" });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `${examTitle}_阅卷包.zip`;
    a.click();
    setShowExportModal(false);
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const completedCount = files.filter(f => f.status === 'completed').length;
  const progressPercent = files.length > 0 ? Math.round((completedCount / files.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <LayoutList className="w-6 h-6 text-blue-600" />
              阅卷控制台
            </h2>
            <span className="text-sm font-medium text-slate-500">已完成: {completedCount} / {files.length}</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-2">
            <div 
              className="bg-blue-600 h-full transition-all duration-500 ease-out" 
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          {validationMsg && (
            <div className="flex items-center gap-2 text-red-500 text-xs mt-2 animate-pulse">
              <AlertCircle className="w-3.5 h-3.5" /> {validationMsg}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索学生..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none w-48 transition-all focus:w-64"
            />
          </div>
          <button 
            onClick={processQueue} 
            disabled={processing || files.length === 0}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-md active:scale-95"
          >
            {processing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {processing ? '评分中...' : '开始评分'}
          </button>
          <button 
            onClick={() => setShowExportModal(true)} 
            disabled={completedCount === 0}
            className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 rounded-xl transition-all shadow-sm disabled:opacity-50"
            title="批量导出"
          >
            <Download className="w-5 h-5" />
          </button>
          <button 
            onClick={onClearAll}
            className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 rounded-xl transition-all shadow-sm"
            title="清除全部"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* File Cards List */}
      <div className="space-y-4">
        {filteredFiles.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 bg-white rounded-2xl border-2 border-dashed border-slate-200">
            <Search className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-medium">未找到相关试卷文件</p>
          </div>
        ) : (
          filteredFiles.map((file) => {
            const isExpanded = expandedFileId === file.id;
            const levelInfo = file.result ? getLevelInfo(file.result.totalScore, file.result.maxScore, file.id) : null;
            const LevelIcon = levelInfo?.icon;

            return (
              <div 
                key={file.id} 
                className={`bg-white rounded-2xl shadow-sm border transition-all overflow-hidden ${isExpanded ? 'border-blue-400 ring-2 ring-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                {/* Card Header/Preview Area */}
                <div 
                  onClick={() => file.status === 'completed' && setExpandedFileId(isExpanded ? null : file.id)}
                  className={`p-5 flex items-center justify-between cursor-pointer ${file.status === 'completed' ? '' : 'cursor-default opacity-80'}`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                      file.status === 'completed' ? (levelInfo?.badgeColor || 'bg-blue-50') :
                      file.status === 'processing' ? 'bg-blue-100 animate-pulse' :
                      file.status === 'error' ? 'bg-red-50' : 'bg-slate-50'
                    }`}>
                      {file.status === 'completed' && LevelIcon ? <LevelIcon className="w-6 h-6" /> : <FileText className="w-6 h-6 text-slate-400" />}
                    </div>
                    
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-800 truncate text-lg">{file.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        {file.status === 'completed' ? (
                          <>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${levelInfo?.badgeColor}`}>
                              {levelInfo?.label}
                            </span>
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs text-slate-500">{levelInfo?.desc}</span>
                          </>
                        ) : file.status === 'processing' ? (
                          <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" /> AI 分析中 {file.progress}%
                          </span>
                        ) : file.status === 'error' ? (
                          <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> {file.errorMsg || '解析失败'}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">等待评分</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {file.status === 'completed' && (
                      <div className="text-right hidden sm:block">
                        <div className="text-2xl font-black text-blue-600">
                          {file.result?.totalScore}<span className="text-sm text-slate-300 font-medium"> / {file.result?.maxScore}</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2">
                      {file.status === 'completed' && (
                        <div className={`p-1.5 rounded-full transition-all ${isExpanded ? 'bg-blue-100 text-blue-600 rotate-180' : 'bg-slate-50 text-slate-400'}`}>
                          <ChevronDown className="w-5 h-5" />
                        </div>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteFile(file.id); }}
                        className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details Area */}
                {isExpanded && file.result && (
                  <div className="border-t border-slate-100 bg-slate-50/30 p-6 space-y-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
                      <div className="flex items-center gap-4">
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">能力评估</p>
                          <p className="text-sm font-bold text-slate-700">{levelInfo?.quote}</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">得分占比</p>
                          <p className="text-sm font-bold text-slate-700">{levelInfo?.percentage}%</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          const blob = new Blob([generateReportHtml(file)], { type: 'text/html' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${file.name}_报告.html`;
                          a.click();
                        }}
                        className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" /> 导出 HTML 报告
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {file.result.details.map((detail, idx) => {
                        const rule = rules.find(r => r.id === detail.ruleId);
                        return (
                          <div 
                            key={idx} 
                            className={`p-4 rounded-xl border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${detail.passed ? 'border-green-100 hover:border-green-300' : 'border-red-100 hover:border-red-300'}`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                {detail.passed ? (
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-400" />
                                )}
                                <span className="font-bold text-slate-700">{rule?.description || '未知评分项'}</span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">{rule?.category}</span>
                              </div>
                              <p className="text-xs text-slate-500 ml-6 italic">{detail.reasoning}</p>
                              {detail.extractedValue && (
                                <div className="ml-6 mt-1 flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-slate-400">提取特征:</span>
                                  <code className="text-[10px] bg-slate-100 px-1 py-0.5 rounded text-slate-600 font-mono">{detail.extractedValue}</code>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-3 self-end sm:self-center">
                              <span className={`text-lg font-black ${detail.passed ? 'text-green-600' : 'text-red-400'}`}>
                                {detail.passed ? `+${detail.score}` : '0'}
                              </span>
                              <span className="text-xs text-slate-300 font-bold">/ {rule?.points || 0}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200 p-4">
          <div className="bg-white p-8 rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2">
              <Download className="w-5 h-5 text-blue-600" /> 批量导出选项
            </h3>
            <div className="space-y-4 mb-8">
              <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors border border-slate-100">
                <input 
                  type="checkbox" 
                  checked={exportOpts.excel} 
                  onChange={e => setExportOpts({...exportOpts, excel: e.target.checked})} 
                  className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <div>
                  <p className="font-bold text-slate-700 text-sm">Excel 成绩汇总表</p>
                  <p className="text-[10px] text-slate-500">包含所有学生的姓名、最终得分和等级评估</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors border border-slate-100">
                <input 
                  type="checkbox" 
                  checked={exportOpts.reports} 
                  onChange={e => setExportOpts({...exportOpts, reports: e.target.checked})} 
                  className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <div>
                  <p className="font-bold text-slate-700 text-sm">HTML 个性化报告包</p>
                  <p className="text-[10px] text-slate-500">生成每位学生的详细得分情况和 AI 评价网页</p>
                </div>
              </label>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowExportModal(false)} 
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all text-sm"
              >
                取消
              </button>
              <button 
                onClick={executeBatchExport} 
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95 text-sm"
              >
                开始生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
