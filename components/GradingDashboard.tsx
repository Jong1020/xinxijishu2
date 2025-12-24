import React, { useState, useRef, useEffect } from 'react';
import { StudentFile, GradingRule, AIConfig, DocxData } from '../types';
import { parseDocx, extractFilesFromZip } from '../services/docxService';
import { gradeDocument } from '../services/gradingService';
import { Play, Pause, RefreshCw, CheckCircle, XCircle, FileText, Download, BarChart2, FileDown, FileOutput, ChevronDown, Archive, Sheet, AlertCircle, FastForward, Plus, Trash2, X, DownloadCloud, Trophy, Star, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

interface GradingDashboardProps {
  files: StudentFile[];
  rules: GradingRule[];
  aiConfig: AIConfig;
  templateData: DocxData | null;
  updateFileStatus: (id: string, updates: Partial<StudentFile>) => void;
  examTitle: string;
  onAddFiles: (files: StudentFile[]) => void;
  onClearAll: () => void;
}

// Helper to get random item from array
const sample = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

// Level Configuration Helper with Praise Master Quotes
const getLevelInfo = (score: number, max: number, fileId?: string) => {
  const percentage = max > 0 ? Math.round((score / max) * 100) : 0;
  
  // Create a pseudo-random index based on fileId to keep quotes consistent per file but different per level
  const seed = fileId ? fileId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
  const getQuote = (quotes: string[]) => quotes[seed % quotes.length];

  const levels = [
    { 
      min: 100, 
      label: "👑 王者归来", 
      color: "text-yellow-600 bg-yellow-50 border-yellow-200", 
      hex: "#ca8a04", 
      bgHex: "#fefce8", 
      desc: "满分通关，独孤求败！", 
      quote: getQuote([
          "你的代码充满了智慧的光芒，简直是比特界的艺术家！",
          "完美的表现！计算机看到你的操作都忍不住想给你点个赞。",
          "无懈可击！你就是传说中的信息技术大神转世吧？",
          "太强了！键盘在你手下仿佛变成了魔法棒。"
      ]),
      range: "100%" 
    },
    { 
      min: 95, 
      label: "🌟 绝世高手", 
      color: "text-amber-600 bg-amber-50 border-amber-200", 
      hex: "#d97706", 
      bgHex: "#fffbeb", 
      desc: "登峰造极，令人仰望。", 
      quote: getQuote([
          "差一点点就突破天际了！你的才华挡都挡不住。",
          "这种高水平的操作，真是让人赏心悦目。",
          "高手过招，招招精彩！你的细节处理非常棒。",
          "就像夜空中的星，你闪耀着独特的光芒！"
      ]),
      range: "95-99%" 
    },
    { 
      min: 90, 
      label: "💎 璀璨钻石", 
      color: "text-cyan-600 bg-cyan-50 border-cyan-200", 
      hex: "#0891b2", 
      bgHex: "#ecfeff", 
      desc: "光芒四射，细节大师。", 
      quote: getQuote([
          "非常优秀！你的逻辑就像钻石一样清晰透亮。",
          "稳扎稳打，实力非凡！继续保持这份专注。",
          "你的作品透露出一种专业的气质，很有范儿！",
          "太棒了！离完美只有一步之遥，你已经超越了绝大多数人。"
      ]),
      range: "90-94%" 
    },
    { 
      min: 85, 
      label: "🚀 闪耀新星", 
      color: "text-blue-600 bg-blue-50 border-blue-200", 
      hex: "#2563eb", 
      bgHex: "#eff6ff", 
      desc: "明日之星，未来可期。", 
      quote: getQuote([
          "你的进步像火箭一样快！潜力不可限量。",
          "很棒的尝试！你对技术的悟性很高，未来可期。",
          "即使有一点小瑕疵，也掩盖不了你优秀的光芒。",
          "做得好！信息技术的未来舞台上一定有你的位置。"
      ]),
      range: "85-89%" 
    },
    { 
      min: 80, 
      label: "🦁 雄狮觉醒", 
      color: "text-indigo-600 bg-indigo-50 border-indigo-200", 
      hex: "#4f46e5", 
      bgHex: "#eef2ff", 
      desc: "实力强劲，气场全开。", 
      quote: getQuote([
          "像雄狮一样霸气！你已经掌握了核心技能。",
          "虽然遇到了一些挑战，但你解决问题的样子很帅。",
          "基础很扎实！稍加打磨，你就是王者。",
          "这就是实力的体现！相信自己，你能做得更好。"
      ]),
      range: "80-84%" 
    },
    { 
      min: 70, 
      label: "⚡ 潜力无限", 
      color: "text-emerald-600 bg-emerald-50 border-emerald-200", 
      hex: "#059669", 
      bgHex: "#ecfdf5", 
      desc: "根骨极佳，稍加打磨。", 
      quote: getQuote([
          "你就像一块璞玉，精心雕琢后必成大器！",
          "每一次尝试都是进步，你已经走在成功的路上了。",
          "别灰心，你的潜力比你想象的要大得多！",
          "信息技术的海洋很广阔，你已经学会了扬帆起航。"
      ]),
      range: "70-79%" 
    },
    { 
      min: 60, 
      label: "🛡️ 坚韧青铜", 
      color: "text-violet-600 bg-violet-50 border-violet-200", 
      hex: "#7c3aed", 
      bgHex: "#f5f3ff", 
      desc: "基础扎实，稳扎稳打。", 
      quote: getQuote([
          "万丈高楼平地起，你的地基打得很稳！",
          "虽然过程有点曲折，但你坚持到了最后，这最珍贵。",
          "每一个高手都是从青铜练起来的，加油！",
          "只要不放弃，下一次就是白银，再下一次就是王者！"
      ]),
      range: "60-69%" 
    },
    { 
      min: 40, 
      label: "🛠️ 筑基修仙", 
      color: "text-orange-600 bg-orange-50 border-orange-200", 
      hex: "#ea580c", 
      bgHex: "#fff7ed", 
      desc: "道阻且长，行则将至。", 
      quote: getQuote([
          "修仙之路漫漫，但你已经迈出了勇敢的第一步！",
          "失败是成功之母，今天的学费是为了明天的财富。",
          "别气馁！每一个BUG都是通向真理的台阶。",
          "只要开始就不晚，相信积累的力量！"
      ]),
      range: "40-59%" 
    },
    { 
      min: 0,  
      label: "🌱 初入江湖", 
      color: "text-slate-500 bg-slate-50 border-slate-200", 
      hex: "#64748b", 
      bgHex: "#f8fafc", 
      desc: "万事开头难，加油鸭！", 
      quote: getQuote([
          "江湖路远，大侠请重新来过！我们在终点等你。",
          "虽然这次跌倒了，但你站起来的样子真的很酷。",
          "一张白纸最好画画，你的未来有无限可能！",
          "别怕，计算机不会咬人，多试几次你就能征服它！"
      ]),
      range: "0-39%" 
    }
  ];

  return {
    ...levels.find(l => percentage >= l.min) || levels[levels.length - 1],
    levels // return all levels for legend
  };
};

export const GradingDashboard: React.FC<GradingDashboardProps> = ({ files, rules, aiConfig, templateData, updateFileStatus, examTitle, onAddFiles, onClearAll }) => {
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  const [selectedFile, setSelectedFile] = useState<StudentFile | null>(null);
  const [showSingleMenu, setShowSingleMenu] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  // Control Panel State
  const [localConcurrency, setLocalConcurrency] = useState<number>(aiConfig.concurrency || 1);

  // Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportOpts, setExportOpts] = useState({ excel: true, reports: true, originals: false });
  
  // Clear Modal State
  const [showClearModal, setShowClearModal] = useState(false);

  // Sync ref with state for async loop
  useEffect(() => {
    processingRef.current = processing;
  }, [processing]);

  // Sync local concurrency with global config initially
  useEffect(() => {
    setLocalConcurrency(aiConfig.concurrency || 1);
  }, [aiConfig.concurrency]);

  const processQueue = async () => {
    if (processingRef.current) return;

    if (rules.length === 0) {
      setValidationMsg("⚠️ 无法开始：请先在「设置标准」步骤添加评分规则");
      setTimeout(() => setValidationMsg(null), 3000);
      return;
    }
    
    const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error');
    if (pendingFiles.length === 0) {
      setValidationMsg("🎉 所有文件已评分完毕");
      setTimeout(() => setValidationMsg(null), 3000);
      return;
    }

    setProcessing(true);
    processingRef.current = true;

    let targetFiles = pendingFiles;
    const concurrency = localConcurrency;
    let active = 0;
    let index = 0;
    const totalToProcess = targetFiles.length;
    let completedCount = 0;

    const next = async () => {
      if (!processingRef.current) return; 

      if (index >= totalToProcess) {
          if (active === 0) {
              setProcessing(false);
              processingRef.current = false;
          }
          return;
      }

      const fileData = targetFiles[index++];
      active++;

      let progress = 0;
      updateFileStatus(fileData.id, { status: 'processing', progress: 0 });

      // Improved Progress Interval
      const progressTimer = setInterval(() => {
        let increment = 0;
        
        if (progress < 40) {
            increment = Math.floor(Math.random() * 8) + 4; // Fast start
        } else if (progress < 70) {
            increment = Math.floor(Math.random() * 5) + 2; // Medium
        } else if (progress < 90) {
            increment = Math.floor(Math.random() * 3) + 1; // Slow down
        } else {
            // Very slow crawl to 99, never reset or jump back
            if (progress < 99) {
                increment = Math.random() > 0.7 ? 1 : 0; 
            }
        }

        progress = Math.min(progress + increment, 99);
        updateFileStatus(fileData.id, { progress });
      }, 500);

      try {
        // 1. Parse XML
        let docData = fileData.rawXml;
        if (!docData || !docData.document) {
          docData = await parseDocx(fileData.file);
          updateFileStatus(fileData.id, { rawXml: docData });
        }

        // 2. Grade
        const result = await gradeDocument(docData, templateData, rules, aiConfig);
        
        clearInterval(progressTimer);
        updateFileStatus(fileData.id, { 
          status: 'completed', 
          result: result,
          progress: 100 
        });

      } catch (error: any) {
        clearInterval(progressTimer);
        updateFileStatus(fileData.id, { 
          status: 'error', 
          errorMsg: error.message || "未知错误",
          progress: 0
        });
      } finally {
        active--;
        completedCount++;
        
        if (completedCount >= totalToProcess && active === 0) {
            setProcessing(false);
            processingRef.current = false;
        } else if (processingRef.current) {
            await next();
        }
      }
    };

    const initialTasks = Math.min(concurrency, totalToProcess);
    const promises = [];
    for (let i = 0; i < initialTasks; i++) {
        promises.push(next());
    }
  };

  const toggleProcessing = () => {
      if (processing) {
          setProcessing(false);
          processingRef.current = false;
      } else {
          processQueue();
      }
  };

  const handleAddFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    const rawFiles: File[] = Array.from(event.target.files);
    const studentFiles: StudentFile[] = [];

    for (const file of rawFiles) {
      if (file.name.endsWith('.zip')) {
        try {
          const extracted = await extractFilesFromZip(file);
          extracted.forEach(f => {
            studentFiles.push({
              id: Math.random().toString(36).substr(2, 9),
              name: f.name,
              file: f,
              status: 'pending'
            });
          });
        } catch (e) {
          console.error("Zip error", e);
        }
      } else if (file.name.endsWith('.docx')) {
        studentFiles.push({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          file: file,
          status: 'pending'
        });
      }
    }
    if (studentFiles.length > 0) {
      onAddFiles(studentFiles);
    }
    event.target.value = '';
  };

  const confirmClearAll = () => {
    setShowClearModal(false);
    setSelectedFile(null);
    onClearAll();
  };

  // Generate HTML Report String 
  const generateReportHtml = (file: StudentFile) => {
    if (!file.result) return "";

    const levelInfo = getLevelInfo(file.result.totalScore, file.result.maxScore, file.id);
    const percentage = Math.round((file.result.totalScore / file.result.maxScore) * 100);
    
    // Gradient Logic for HTML
    let headerGradient = "linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)"; 
    if (percentage >= 95) headerGradient = "linear-gradient(135deg, #fefce8 0%, #facc15 100%)";
    else if (percentage >= 85) headerGradient = "linear-gradient(135deg, #eff6ff 0%, #3b82f6 100%)";
    else if (percentage >= 70) headerGradient = "linear-gradient(135deg, #ecfdf5 0%, #10b981 100%)";
    else if (percentage >= 60) headerGradient = "linear-gradient(135deg, #f5f3ff 0%, #8b5cf6 100%)";
    else headerGradient = "linear-gradient(135deg, #f8fafc 0%, #94a3b8 100%)";

    const legendHtml = levelInfo.levels.map(l => {
      const isActive = l.min === levelInfo.min;
      // Also get the quote for the legend display to be consistent? No, legend just shows desc.
      return `
        <div class="legend-item ${isActive ? 'active' : ''}">
          <div class="legend-badge" style="background-color: ${l.hex}">${l.label.split(' ')[0]}</div>
          <div class="legend-info">
            <div class="legend-title" style="color: ${l.hex}">${l.label.split(' ')[1]} <span class="legend-range">${l.range}</span></div>
            <div class="legend-desc">${l.desc}</div>
          </div>
        </div>
      `;
    }).join('');

    const cards = file.result.details.map(d => {
        const rule = rules.find(r => r.id === d.ruleId);
        return `
          <div class="card ${d.passed ? 'pass' : 'fail'}">
            <div class="card-icon">${d.passed ? '✅' : '🧐'}</div>
            <div class="card-content">
              <div class="card-title">${rule?.description || "未知规则"}</div>
              <div class="card-reason">${d.reasoning || ''}</div>
              ${(d.extractedValue !== "N/A" && !d.passed && d.extractedValue) ? `<div class="card-debug">检测值: ${d.extractedValue}</div>` : ''}
            </div>
            <div class="card-points">
              ${d.passed ? `+${d.score}` : `<span class="missed-points">-${rule?.points}</span>`}
            </div>
          </div>
        `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${file.name} - 趣味成绩单</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Zcool+KuaiLe&family=Ma+Shan+Zheng&family=Noto+Sans+SC:wght@400;700&display=swap');
        body { font-family: 'Noto Sans SC', sans-serif; background: #fdfbf7; background-image: radial-gradient(#e5e7eb 1px, transparent 1px); background-size: 20px 20px; margin: 0; padding: 20px; color: #334155; min-height: 100vh; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow: hidden; border: 4px solid #fff; }
        .header { background: ${headerGradient}; padding: 40px 20px 80px 20px; text-align: center; color: white; position: relative; clip-path: ellipse(150% 100% at 50% 0%); }
        .header h1 { margin: 0; font-family: 'Zcool KuaiLe', cursive; font-size: 32px; text-shadow: 2px 2px 4px rgba(0,0,0,0.2); color: #fff; }
        .student-tag { display: inline-block; background: white; color: #334155; padding: 8px 24px; border-radius: 50px; font-weight: bold; font-size: 18px; margin-top: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform: rotate(-2deg); border: 3px solid rgba(255,255,255,0.5); font-family: 'Zcool KuaiLe', cursive; }
        .exam-info { margin-top: 10px; font-size: 14px; opacity: 0.9; color: rgba(255,255,255,0.9); text-shadow: 1px 1px 2px rgba(0,0,0,0.1); }
        .hero { text-align: center; margin-top: -60px; position: relative; z-index: 3; padding-bottom: 20px; }
        .score-circle { width: 150px; height: 150px; background: white; border-radius: 50%; margin: 0 auto; display: flex; flex-direction: column; justify-content: center; align-items: center; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 8px solid ${levelInfo.hex}; animation: popIn 0.6s cubic-bezier(0.68, -0.55, 0.27, 1.55); position: relative; }
        .score-val { font-size: 48px; font-weight: 900; color: ${levelInfo.hex}; line-height: 1; font-family: 'Verdana', sans-serif; }
        .score-max { font-size: 14px; color: #94a3b8; font-weight: bold; margin-top: -5px; }
        .badge { margin-top: 15px; display: inline-block; padding: 6px 20px; background: ${levelInfo.hex}; color: white; border-radius: 12px; font-weight: bold; font-size: 18px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); font-family: 'Zcool KuaiLe', cursive; letter-spacing: 1px; }
        .quote-bubble { margin: 15px auto 0; background: #fff; border: 1px dashed ${levelInfo.hex}; color: ${levelInfo.hex}; padding: 8px 16px; border-radius: 20px; font-size: 14px; display: inline-block; font-weight: bold; position: relative; }
        .ai-feedback { margin: 20px 30px; background: #fffbe7; border-radius: 16px; padding: 20px; border: 2px dashed #fcd34d; position: relative; }
        .ai-feedback::before { content: '🤖'; position: absolute; top: -15px; left: 20px; font-size: 24px; background: white; border-radius: 50%; padding: 5px; border: 2px dashed #fcd34d; }
        .feedback-text { margin-top: 5px; font-size: 15px; color: #78350f; line-height: 1.6; font-weight: 500; }
        .rules-grid { padding: 0 30px 20px 30px; display: grid; gap: 12px; }
        .card { display: flex; align-items: flex-start; padding: 16px; border-radius: 16px; background: white; border: 2px solid #f1f5f9; transition: transform 0.2s; }
        .card:hover { transform: translateY(-2px); border-color: ${levelInfo.hex}; }
        .card.pass { background: #f0fdf4; border-color: #bbf7d0; }
        .card.fail { background: #fef2f2; border-color: #fecaca; }
        .card-icon { font-size: 22px; margin-right: 12px; margin-top: 2px; }
        .card-content { flex: 1; }
        .card-title { font-weight: bold; font-size: 16px; color: #1e293b; margin-bottom: 4px; }
        .card-reason { font-size: 13px; color: #64748b; line-height: 1.4; }
        .card-debug { font-size: 12px; color: #ef4444; background: rgba(255,255,255,0.5); padding: 2px 6px; border-radius: 4px; margin-top: 4px; display: inline-block; }
        .card-points { font-weight: 900; font-size: 18px; color: #10b981; min-width: 50px; text-align: right; font-family: 'Verdana', sans-serif; }
        .missed-points { color: #ef4444; font-size: 14px; }
        .card.fail .card-points { color: #ef4444; }
        .legend-section { background: #f8fafc; margin: 20px 30px 40px 30px; padding: 20px; border-radius: 16px; border: 1px dashed #e2e8f0; }
        .legend-section h3 { margin: 0 0 15px 0; font-family: 'Zcool KuaiLe'; color: #475569; font-size: 18px; text-align: center; }
        .legend-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
        .legend-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; background: white; border: 1px solid #f1f5f9; opacity: 0.6; transform: scale(0.95); transition: all 0.2s; }
        .legend-item.active { opacity: 1; transform: scale(1.05); border-color: ${levelInfo.hex}; box-shadow: 0 4px 12px rgba(0,0,0,0.05); z-index: 2; position: relative; }
        .legend-badge { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; color: white; flex-shrink: 0; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .legend-info { display: flex; flex-direction: column; }
        .legend-title { font-weight: bold; font-size: 13px; margin-bottom: 2px; }
        .legend-range { font-size: 10px; opacity: 0.7; font-weight: normal; background: #eee; padding: 1px 4px; border-radius: 4px; margin-left: 4px; color: #333; }
        .legend-desc { font-size: 10px; color: #94a3b8; }
        .footer { text-align: center; padding: 20px; background: #f1f5f9; color: #94a3b8; font-size: 12px; border-top: 1px dashed #e2e8f0; }
        @keyframes popIn { 0% { transform: scale(0); } 100% { transform: scale(1); } }
      </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
              <h1>🏆 信息技术大闯关</h1>
              <div class="student-tag">📁 ${file.name}</div>
              <div class="exam-info">${examTitle} · ${new Date().toLocaleDateString()}</div>
          </div>
          <div class="hero">
            <div class="score-circle">
              <span class="score-val">${file.result.totalScore}</span>
              <span class="score-max">/ ${file.result.maxScore}</span>
            </div>
            <div class="badge">${levelInfo.label}</div>
            <div class="quote-bubble">“${levelInfo.quote}”</div>
          </div>
          <div class="ai-feedback">
            <div style="font-weight: bold; color: #b45309; margin-bottom: 5px; font-size: 14px;">🎓 老师点评:</div>
            <div class="feedback-text">${file.result.summary || "老师正在阅卷中..."}</div>
          </div>
          <div class="rules-grid">
            <h3 style="margin-bottom: 15px; color: #334155; font-family: 'Zcool KuaiLe'; font-size: 20px;">📌 闯关详情</h3>
            ${cards}
          </div>
          
          <div class="legend-section">
            <h3>📊 实力段位表</h3>
            <div class="legend-grid">
                ${legendHtml}
            </div>
          </div>

          <div class="footer">信息技术自动评分系统生成 🚀 <br> 加油，未来的技术专家！</div>
        </div>
      </body>
      </html>
    `;
  };

  const executeBatchExport = async () => {
    if (files.length === 0) return;
    setShowExportModal(false);

    const zip = new JSZip();
    const safeTitle = examTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\-_]/g, '_');
    let hasContent = false;

    if (exportOpts.excel) {
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
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      zip.file(`${safeTitle}_成绩单.xlsx`, excelBuffer);
      hasContent = true;
    }

    if (exportOpts.reports) {
      const folder = zip.folder("成绩报告");
      let count = 0;
      files.forEach(f => {
           if (f.result) {
               const html = generateReportHtml(f);
               folder?.file(`${f.name.replace(/\.[^/.]+$/, "")}_报告.html`, html);
               count++;
           }
      });
      if (count > 0) hasContent = true;
    }

    if (exportOpts.originals) {
      const folder = zip.folder("原始试卷");
      files.forEach(f => {
          folder?.file(f.name, f.file);
      });
      hasContent = true;
    }

    if (!hasContent) {
      setValidationMsg("⚠️ 未选中任何内容或没有可导出的数据");
      setTimeout(() => setValidationMsg(null), 3000);
      return;
    }

    const content = await zip.generateAsync({type: "blob"});
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}_打包下载.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadOriginal = (file: StudentFile) => {
    const url = URL.createObjectURL(file.file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const downloadReport = (file: StudentFile) => {
    if (!file.result) return;
    const htmlContent = generateReportHtml(file);
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${file.name.replace(/\.[^/.]+$/, "")}_趣味报告.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const completed = files.filter(f => f.status === 'completed').length;
  const pendingCount = files.filter(f => f.status === 'pending' || f.status === 'error').length;
  const progressPercent = files.length > 0 ? Math.round((completed / files.length) * 100) : 0;

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'pending': return '等待中';
      case 'processing': return '评分中';
      case 'completed': return '已完成';
      case 'error': return '错误';
      default: return status;
    }
  };

  // Helper for detail view rendering
  const renderDetailView = () => {
    if (!selectedFile || !selectedFile.result) return null;

    const { totalScore, maxScore, summary, details } = selectedFile.result;
    const levelInfo = getLevelInfo(totalScore, maxScore, selectedFile.id);

    return (
      <div className="flex flex-col h-full bg-slate-50">
        {/* Detail Header */}
        <div className={`p-6 bg-white border-b border-slate-200 shadow-sm relative overflow-hidden`}>
           <div className={`absolute top-0 right-0 p-4 opacity-10 pointer-events-none`}>
               <Trophy className={`w-32 h-32 ${levelInfo.color.split(' ')[0]}`} />
           </div>
           
           <div className="relative z-10 flex justify-between items-start">
             <div>
                <h2 className="text-2xl font-bold text-slate-800">{selectedFile.name}</h2>
                <div className="flex items-center gap-2 mt-2">
                   <span className="text-sm text-slate-500 flex items-center gap-2">
                      <FileText className="w-4 h-4" /> 试卷详情
                   </span>
                </div>
             </div>
             <div className="text-right">
                <div className="flex items-baseline justify-end gap-1">
                  <span className={`text-4xl font-black ${levelInfo.color.split(' ')[0]}`}>{totalScore}</span>
                  <span className="text-sm text-slate-400 font-medium">/ {maxScore}</span>
                </div>
                <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => downloadReport(selectedFile)} className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium transition-colors">
                       <FileOutput className="w-3 h-3" /> 下载报告
                    </button>
                    <div className="w-px h-4 bg-slate-200"></div>
                    <button onClick={() => downloadOriginal(selectedFile)} className="text-xs flex items-center gap-1 text-slate-500 hover:text-slate-700 font-medium transition-colors">
                       <FileDown className="w-3 h-3" /> 原件
                    </button>
                </div>
             </div>
           </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
           {/* Details Grid */}
           <div className="space-y-3">
              <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm uppercase tracking-wide">
                 <Search className="w-4 h-4" /> 评分明细
              </h3>
              {details.map((detail, idx) => {
                 const rule = rules.find(r => r.id === detail.ruleId);
                 return (
                   <div key={idx} className={`group bg-white rounded-xl border transition-all duration-200 hover:shadow-md ${detail.passed ? 'border-green-100 hover:border-green-300' : 'border-red-100 hover:border-red-300'}`}>
                      <div className="p-4 flex items-start gap-3">
                         <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${detail.passed ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                            {detail.passed ? <CheckCircle className="w-4 h-4" /> : <X className="w-4 h-4" />}
                         </div>
                         <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                               <h4 className={`font-semibold text-sm ${detail.passed ? 'text-slate-700' : 'text-slate-800'}`}>
                                 {rule?.description || "未知规则"}
                               </h4>
                               <span className={`text-sm font-bold ml-2 ${detail.passed ? 'text-green-600' : 'text-red-600'}`}>
                                  {detail.passed ? `+${detail.score}` : `-${rule?.points}`}
                               </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">{detail.reasoning}</p>
                            
                            {/* Evidence Box */}
                            {(!detail.passed && detail.extractedValue !== "N/A") && (
                               <div className="mt-2 text-xs bg-red-50 text-red-700 px-3 py-1.5 rounded border border-red-100 inline-block">
                                  实际检测值: <span className="font-mono font-bold">{detail.extractedValue}</span>
                                </div>
                            )}
                         </div>
                      </div>
                   </div>
                 );
              })}
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Modals */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[400px] transform scale-100 animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <DownloadCloud className="w-5 h-5 text-blue-600" /> 批量导出选项
                </h3>
                <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
             </div>
             
             <div className="space-y-3 mb-6">
                <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" checked={exportOpts.excel} onChange={(e) => setExportOpts({...exportOpts, excel: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                   <div className="flex items-center gap-2">
                      <Sheet className="w-4 h-4 text-green-600" />
                      <span className="font-medium text-slate-700">Excel 成绩单汇总</span>
                   </div>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" checked={exportOpts.reports} onChange={(e) => setExportOpts({...exportOpts, reports: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                   <div className="flex items-center gap-2">
                      <FileOutput className="w-4 h-4 text-amber-500" />
                      <span className="font-medium text-slate-700">趣味 HTML 成绩报告</span>
                   </div>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" checked={exportOpts.originals} onChange={(e) => setExportOpts({...exportOpts, originals: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                   <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-500" />
                      <span className="font-medium text-slate-700">学生原始试卷</span>
                   </div>
                </label>
             </div>

             <div className="flex gap-3">
               <button onClick={() => setShowExportModal(false)} className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium">取消</button>
               <button onClick={executeBatchExport} className="flex-1 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium shadow-sm">打包下载 (.zip)</button>
             </div>
          </div>
        </div>
      )}

      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[360px] transform scale-100 animate-in zoom-in-95 duration-200 border-t-4 border-red-500">
             <div className="flex flex-col items-center text-center mb-6">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">确认清空所有记录?</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  此操作将移除所有已上传的试卷和评分结果。<br/>
                  <span className="font-bold text-red-600">操作无法恢复，请谨慎！</span>
                </p>
             </div>

             <div className="flex gap-3">
               <button onClick={() => setShowClearModal(false)} className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium">再想想</button>
               <button onClick={confirmClearAll} className="flex-1 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium shadow-sm">确认清空</button>
             </div>
          </div>
        </div>
      )}

      {/* Left: Control & List */}
      <div className="lg:col-span-1 space-y-4">
        {/* Simplified Progress & Controls */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          {validationMsg && (
              <div className="mb-4 bg-slate-800 text-white text-xs px-3 py-2 rounded-lg text-center shadow-xl animate-bounce flex items-center justify-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span>{validationMsg}</span>
              </div>
          )}

          {/* Progress Bar Row */}
          <div className="mb-4">
             <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                   <BarChart2 className="w-4 h-4" /> 
                   <span>评分进度</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-blue-600">{progressPercent}%</span>
                    <span className="text-xs text-slate-400">({completed} / {files.length})</span>
                </div>
             </div>
             <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
             </div>
          </div>

          {/* Actions Row */}
          <div className="flex gap-2">
            <div className="flex items-center gap-2 bg-slate-50 px-2 py-2 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors" title="设置并发量">
                <FastForward className="w-4 h-4 text-slate-400" />
                <select 
                   value={localConcurrency}
                   onChange={(e) => setLocalConcurrency(Number(e.target.value))}
                   disabled={processing}
                   className="bg-transparent text-xs text-slate-700 font-medium outline-none cursor-pointer w-10"
                >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="5">5</option>
                    <option value="10">10</option>
                </select>
            </div>

            <button 
              onClick={toggleProcessing}
              disabled={pendingCount === 0 && !processing}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-white shadow-sm text-sm transition-all active:scale-95
                 ${processing ? 'bg-amber-500 hover:bg-amber-600' : 
                   pendingCount === 0 ? 'bg-slate-300 cursor-not-allowed' :
                   completed > 0 ? 'bg-indigo-600 hover:bg-indigo-700' : 
                   'bg-green-600 hover:bg-green-700'}`}
            >
              {processing ? (
                 <><Pause className="w-4 h-4 fill-current" /> 暂停</>
              ) : pendingCount === 0 ? (
                 <><CheckCircle className="w-4 h-4" /> 完成</>
              ) : completed > 0 ? (
                 <><Play className="w-4 h-4 fill-current" /> 继续</>
              ) : (
                 <><Play className="w-4 h-4 fill-current" /> 开始评分</>
              )}
            </button>
            
            <button 
              onClick={() => setShowExportModal(true)}
              className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center transition-colors border border-transparent hover:border-slate-300"
              title="批量导出"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col max-h-[600px]">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center sticky top-0 z-10">
             <span className="font-semibold text-sm text-slate-700 flex items-center gap-2">
               <FileText className="w-4 h-4 text-blue-500" />
               文件列表
             </span>
             <div className="flex gap-1">
                <label className="p-1.5 hover:bg-white rounded-md cursor-pointer transition-colors text-slate-500 hover:text-blue-600 border border-transparent hover:border-slate-200 hover:shadow-sm" title="添加文件">
                    <Plus className="w-4 h-4" />
                    <input type="file" multiple accept=".docx,.zip" className="hidden" onChange={handleAddFileChange} />
                </label>
                <button 
                  onClick={() => setShowClearModal(true)}
                  className="p-1.5 hover:bg-white rounded-md cursor-pointer transition-colors text-slate-500 hover:text-red-600 border border-transparent hover:border-slate-200 hover:shadow-sm"
                  title="清空所有"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
             </div>
          </div>
          <div className="overflow-y-auto">
            {files.map(file => (
              <div 
                key={file.id} 
                onClick={() => setSelectedFile(file)}
                className={`p-4 border-b border-slate-100 cursor-pointer transition-colors flex flex-col hover:bg-slate-50 relative overflow-hidden ${selectedFile?.id === file.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
              >
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate max-w-[150px]">{file.name}</div>
                        <div className="text-xs text-slate-500">{getStatusLabel(file.status)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {file.status === 'completed' && (
                        <span className="text-sm font-bold text-blue-600">{file.result?.totalScore} 分</span>
                      )}
                      {file.status === 'processing' && <span className="text-xs font-bold text-blue-500">{file.progress || 0}%</span>}
                      {file.status === 'processing' && <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />}
                      {file.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
                      {file.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-500" />}
                    </div>
                </div>
                {/* Individual Progress Bar */}
                {file.status === 'processing' && (
                  <div className="w-full bg-slate-100 rounded-full h-1 mt-2 overflow-hidden">
                    <div 
                      className="bg-blue-500 h-full rounded-full transition-all duration-300 ease-out" 
                      style={{ width: `${file.progress || 0}%` }}
                    ></div>
                  </div>
                )}
              </div>
            ))}
            {files.length === 0 && (
               <div className="p-8 text-center text-slate-400 text-sm">
                  暂无文件
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Detail View */}
      <div className="lg:col-span-2">
        {selectedFile ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px] h-[600px] flex flex-col overflow-hidden">
             {selectedFile.status === 'completed' ? (
                renderDetailView()
             ) : selectedFile.status === 'error' ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="inline-flex bg-red-100 p-4 rounded-full mb-4 animate-bounce"><XCircle className="w-10 h-10 text-red-600" /></div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">评分失败</h3>
                  <p className="text-slate-500 max-w-sm">{selectedFile.errorMsg}</p>
                </div>
             ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                   {selectedFile.status === 'processing' ? (
                      <div className="text-center">
                        <RefreshCw className="w-12 h-12 mb-4 text-blue-500 animate-spin mx-auto" />
                        <h3 className="text-lg font-medium text-slate-800">正在评分...</h3>
                        <p className="text-sm text-slate-500 mt-2">AI 正在仔细阅读 {selectedFile.name} 的试卷</p>
                        <div className="w-64 bg-slate-100 rounded-full h-2 mt-6 mx-auto overflow-hidden">
                           <div className="bg-blue-500 h-full rounded-full transition-all duration-300" style={{ width: `${selectedFile.progress || 0}%` }}></div>
                        </div>
                      </div>
                   ) : (
                      <div className="text-center">
                        <FileText className="w-16 h-16 mb-4 text-slate-200 mx-auto" />
                        <p>该文件尚未评分</p>
                      </div>
                   )}
                </div>
             )}
          </div>
        ) : (
           <div className="h-full bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400">
             <div className="text-center">
               <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Trophy className="w-8 h-8 text-slate-300" />
               </div>
               <p>从左侧列表中选择一名学生查看详情</p>
             </div>
           </div>
        )}
      </div>
    </div>
  );
};