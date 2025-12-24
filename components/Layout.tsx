import React from 'react';
import { GraduationCap, Settings, Upload, CheckCircle } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentStep: number;
  onStepClick: (step: number) => void;
}

const steps = [
  { id: 1, name: '设置标准', icon: Settings },
  { id: 2, name: '上传试卷', icon: Upload },
  { id: 3, name: '评分结果', icon: CheckCircle },
];

export const Layout: React.FC<LayoutProps> = ({ children, currentStep, onStepClick }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between py-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => onStepClick(1)}>
            <div className="bg-blue-600 p-2 rounded-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 hidden md:block">
              信息技术考试自动评分系统
            </span>
            <span className="text-lg font-bold text-blue-600 md:hidden">
              IT Auto-Grader
            </span>
          </div>
          
          <nav className="flex items-center space-x-2 md:space-x-4">
            {steps.map((step) => {
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;
              
              return (
                <div 
                  key={step.name} 
                  onClick={() => onStepClick(step.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300 ease-out select-none cursor-pointer
                    ${isActive 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg scale-110 z-10' 
                      : isCompleted
                        ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                        : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }
                  `}
                >
                  <div className={`
                    flex items-center justify-center rounded-full font-bold leading-none
                    ${isActive 
                      ? 'w-6 h-6 bg-white text-blue-600 text-sm' 
                      : isCompleted
                        ? 'w-5 h-5 bg-blue-100 text-blue-600 text-xs'
                        : 'w-5 h-5 bg-slate-100 text-slate-400 text-xs'
                    }
                  `}>
                    {step.id}
                  </div>
                  <span className={`font-bold tracking-tight whitespace-nowrap ${isActive ? 'text-base' : 'text-sm'}`}>
                    {step.name}
                  </span>
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