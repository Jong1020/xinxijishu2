
import React from 'react';
import { X, Settings, Upload, CheckCircle, Info, Key, FileText, Download, Zap } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Info className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">系统使用指南</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Section 1: API Configuration */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-blue-600">
              <Settings className="w-5 h-5" />
              <h3 className="font-bold text-lg">第一步：配置模型与评分标准</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-7">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-2 mb-2 text-slate-700 font-semibold">
                  <Key className="w-4 h-4" />
                  <span>API Key 配置</span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  本系统默认使用 <strong>Gemini 3 Flash</strong> 模型。在托管环境下，API Key 已自动配置。若使用 DeepSeek 等模型，需手动填入 Key。
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-2 mb-2 text-slate-700 font-semibold">
                  <Zap className="w-4 h-4" />
                  <span>自动化规则提取</span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  推荐上传包含<strong>“批注”</strong>的 Word 素材文档，AI 会自动将批注内容转化为精准的评分点。
                </p>
              </div>
            </div>
          </section>

          {/* Section 2: Uploading Files */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-indigo-600">
              <Upload className="w-5 h-5" />
              <h3 className="font-bold text-lg">第二步：上传学生试卷</h3>
            </div>
            <div className="ml-7 space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-indigo-100 p-1 rounded">
                  <FileText className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">支持批量上传</p>
                  <p className="text-sm text-slate-600">
                    您可以直接上传多个 <strong>.docx</strong> 文件，或者上传一个包含所有文件的 <strong>.zip</strong> 压缩包，系统会自动解压。
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Grading & Export */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <h3 className="font-bold text-lg">第三步：自动评分与结果导出</h3>
            </div>
            <div className="ml-7 space-y-4">
              <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                <p className="text-sm text-green-800 leading-relaxed">
                  点击“开始评分”后，系统将并行调用 AI 对每一份文档进行 XML 结构层面的深度分析。评分完成后，您可以查看每项规则的具体扣分原因。
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Download className="w-4 h-4" />
                  <span>支持导出 Excel 汇总表</span>
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <FileText className="w-4 h-4" />
                  <span>支持导出每位学生的 HTML 报告</span>
                </div>
              </div>
            </div>
          </section>

          {/* Tips */}
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
            <h4 className="text-sm font-bold text-amber-800 mb-1">💡 专家建议</h4>
            <ul className="text-xs text-amber-700 list-disc list-inside space-y-1">
              <li>为了获得最精准的评分，请确保评分规则描述中包含具体的 Word 术语（如“段落间距”、“字号”等）。</li>
              <li>如果评分速度较慢，请在配置中调低“并行评分数”。</li>
              <li>系统仅分析 XML，不会上传文档中的图片内容，保护学生隐私。</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 text-center">
          <button 
            onClick={onClose}
            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-md active:scale-95"
          >
            我明白了，开始阅卷
          </button>
        </div>
      </div>
    </div>
  );
};
