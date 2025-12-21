import React, { useState } from 'react';
import { StudentFile, GradingRule, AIConfig, GradingResult, RuleResult } from '../types';
import { parseDocx } from '../services/docxService';
import { gradeDocument } from '../services/gradingService';
import { Play, Pause, RefreshCw, CheckCircle, XCircle, FileText, ChevronRight, BarChart2, Download } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import * as XLSX from 'xlsx';

interface GradingDashboardProps {
  files: StudentFile[];
  rules: GradingRule[];
  aiConfig: AIConfig;
  updateFileStatus: (id: string, updates: Partial<StudentFile>) => void;
}

export const GradingDashboard: React.FC<GradingDashboardProps> = ({ files, rules, aiConfig, updateFileStatus }) => {
  const [processing, setProcessing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<StudentFile | null>(null);

  const processQueue = async () => {
    setProcessing(true);
    const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error');
    
    // Simple concurrency limiter semaphore
    const concurrency = aiConfig.concurrency || 1;
    let active = 0;
    let index = 0;

    const next = async () => {
      if (!processing && index > 0) return; // Stop if paused
      if (index >= pendingFiles.length) return;

      const fileData = pendingFiles[index++];
      active++;

      try {
        updateFileStatus(fileData.id, { status: 'processing' });

        // 1. Parse XML (Client side)
        let { document, styles } = fileData.rawXml || { document: '', styles: '' };
        if (!document) {
          const parsed = await parseDocx(fileData.file);
          document = parsed.document;
          styles = parsed.styles;
          updateFileStatus(fileData.id, { rawXml: parsed });
        }

        // 2. Grade with AI
        const result = await gradeDocument(document, styles, rules, aiConfig);
        
        updateFileStatus(fileData.id, { 
          status: 'completed', 
          result: result 
        });

      } catch (error: any) {
        updateFileStatus(fileData.id, { 
          status: 'error', 
          errorMsg: error.message || "未知错误" 
        });
      } finally {
        active--;
        if (active < concurrency) {
           await next();
        }
      }
    };

    const promises = [];
    for (let i = 0; i < concurrency && i < pendingFiles.length; i++) {
        promises.push(next());
    }
    
    // We don't await the whole queue here to allow UI updates, 
    // but in a real app we might track the "all done" state better.
  };

  const toggleProcessing = () => {
    if (processing) {
      setProcessing(false);
    } else {
      processQueue();
    }
  };

  const exportExcel = () => {
    const data = files.map(f => {
      const row: any = { 姓名: f.name, 总分: f.result?.totalScore || 0, 状态: f.status };
      rules.forEach(r => {
        const detail = f.result?.details.find(d => d.ruleId === r.id);
        row[r.description.substring(0, 30)] = detail ? detail.score : 0;
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "成绩单");
    XLSX.writeFile(wb, "考试成绩.xlsx");
  };

  // Stats
  const completed = files.filter(f => f.status === 'completed').length;
  const progress = (completed / files.length) * 100;

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'pending': return '等待中';
      case 'processing': return '评分中';
      case 'completed': return '已完成';
      case 'error': return '错误';
      default: return status;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left: Control & List */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-lg">评分队列</h2>
            <div className="text-sm text-slate-500">{completed} / {files.length}</div>
          </div>
          
          <div className="w-full bg-slate-100 rounded-full h-2 mb-6">
            <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={toggleProcessing}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-medium text-white transition-colors ${processing ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {processing ? <><Pause className="w-4 h-4" /> 暂停</> : <><Play className="w-4 h-4" /> 开始评分</>}
            </button>
            <button onClick={exportExcel} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden max-h-[600px] overflow-y-auto">
          {files.map(file => (
            <div 
              key={file.id} 
              onClick={() => setSelectedFile(file)}
              className={`p-4 border-b border-slate-100 cursor-pointer transition-colors flex items-center justify-between hover:bg-slate-50 ${selectedFile?.id === file.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-slate-400" />
                <div>
                  <div className="text-sm font-medium text-slate-900 truncate max-w-[180px]">{file.name}</div>
                  <div className="text-xs text-slate-500">{getStatusLabel(file.status)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {file.status === 'completed' && (
                  <span className="text-sm font-bold text-blue-600">{file.result?.totalScore} 分</span>
                )}
                {file.status === 'processing' && <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />}
                {file.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
                {file.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-500" />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Detail View */}
      <div className="lg:col-span-2">
        {selectedFile ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-slate-800">{selectedFile.name}</h2>
                <p className="text-sm text-slate-500 mt-1">状态: <span className="uppercase">{getStatusLabel(selectedFile.status)}</span></p>
              </div>
              {selectedFile.result && (
                <div className="text-right">
                  <div className="text-3xl font-bold text-blue-600">{selectedFile.result.totalScore} <span className="text-lg text-slate-400 font-normal">/ {selectedFile.result.maxScore}</span></div>
                  <div className="text-xs text-slate-400">总分</div>
                </div>
              )}
            </div>

            {selectedFile.status === 'error' && (
               <div className="p-8 text-center">
                 <div className="inline-flex bg-red-100 p-3 rounded-full mb-4"><XCircle className="w-8 h-8 text-red-600" /></div>
                 <h3 className="text-lg font-medium text-slate-900">评分失败</h3>
                 <p className="text-slate-500 mt-2">{selectedFile.errorMsg}</p>
               </div>
            )}

            {selectedFile.result ? (
              <div className="p-6 overflow-y-auto">
                 {/* Summary Section */}
                 <div className="mb-8 p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2"><BarChart2 className="w-4 h-4" /> AI 总结</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{selectedFile.result.summary}</p>
                 </div>

                 {/* Detailed Rules */}
                 <div className="space-y-4">
                   {selectedFile.result.details.map((detail, idx) => {
                     const rule = rules.find(r => r.id === detail.ruleId);
                     return (
                       <div key={idx} className={`border rounded-lg p-4 ${detail.passed ? 'border-green-200 bg-green-50/20' : 'border-red-200 bg-red-50/20'}`}>
                         <div className="flex justify-between items-start mb-2">
                           <div className="flex items-center gap-2">
                             {detail.passed ? <CheckCircle className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                             <span className="font-medium text-slate-900">{rule?.description || "未知规则"}</span>
                           </div>
                           <span className={`text-sm font-bold ${detail.passed ? 'text-green-600' : 'text-red-600'}`}>
                             {detail.score} / {rule?.points}
                           </span>
                         </div>
                         <p className="text-sm text-slate-600 ml-7"><span className="font-medium">判分理由:</span> {detail.reasoning}</p>
                         {detail.extractedValue !== "N/A" && (
                            <p className="text-xs text-slate-400 ml-7 mt-1 font-mono">提取值: {detail.extractedValue}</p>
                         )}
                       </div>
                     );
                   })}
                 </div>
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center text-slate-400">
                <FileText className="w-16 h-16 mb-4 text-slate-200" />
                <p>选择一个已评分的文件查看详情。</p>
              </div>
            )}
          </div>
        ) : (
           <div className="h-full bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400">
             <p>从列表中选择一名学生查看详情</p>
           </div>
        )}
      </div>
    </div>
  );
};