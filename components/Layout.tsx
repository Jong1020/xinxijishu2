import React from 'react';
import { GraduationCap, FileCheck, Settings, Upload, CheckCircle } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentStep: number;
}

const steps = [
  { id: 1, name: '设置标准', icon: Settings },
  { id: 2, name: '上传试卷', icon: Upload },
  { id: 3, name: '评分结果', icon: CheckCircle },
];

export const Layout: React.FC<LayoutProps> = ({ children, currentStep }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
              信息技术考试自动评分系统
            </span>
          </div>
          
          <nav className="flex space-x-8">
            {steps.map((step) => {
              const Icon = step.icon;
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;
              return (
                <div key={step.name} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors
                  ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}
                  ${isCompleted ? 'text-green-600' : ''}
                `}>
                  <Icon className={`w-4 h-4 ${isCompleted ? 'text-green-500' : ''}`} />
                  {step.name}
                </div>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-400 text-sm">
          <p>© {new Date().getFullYear()} IT Exam Auto-Grader. Powered by Gemini & DeepSeek.</p>
        </div>
      </footer>
    </div>
  );
};