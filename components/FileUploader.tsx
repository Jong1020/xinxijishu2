import React from 'react';
import { UploadCloud, FileType, FileArchive, FileText, Trash2 } from 'lucide-react';
import { extractFilesFromZip } from '../services/docxService';
import { StudentFile } from '../types';

interface FileUploaderProps {
  files: StudentFile[];
  onFilesAdded: (files: StudentFile[]) => void;
  onFileDelete: (id: string) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ files, onFilesAdded, onFileDelete }) => {
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      await processFiles(Array.from(event.target.files));
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files) {
      await processFiles(Array.from(event.dataTransfer.files));
    }
  };

  const processFiles = async (files: File[]) => {
    const studentFiles: StudentFile[] = [];

    for (const file of files) {
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
          console.error("Zip extraction error", e);
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
      onFilesAdded(studentFiles);
    }
  };

  return (
    <div className="max-w-4xl mx-auto relative space-y-6">
      {files.length === 0 ? (
        <div 
          className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer bg-white group"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">
            拖拽上传试卷文件
          </h3>
          <p className="text-slate-500 mb-8 max-w-md mx-auto">
            上传单个 <strong>.docx</strong> 文件或包含多个学生作业的 <strong>.zip</strong> 压缩包。
          </p>
          
          <label className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 cursor-pointer shadow-sm transition-transform active:scale-95">
            浏览文件
            <input 
              type="file" 
              className="hidden" 
              multiple 
              accept=".docx,.zip" 
              onChange={handleFileChange} 
            />
          </label>
          
          <div className="mt-8 flex justify-center gap-6 text-sm text-slate-400">
            <div className="flex items-center gap-1">
              <FileType className="w-4 h-4" /> 支持 .docx
            </div>
            <div className="flex items-center gap-1">
               <FileArchive className="w-4 h-4" /> 支持 .zip 自动解压
            </div>
          </div>
        </div>
      ) : (
        <>
          <div 
            className="border-2 border-dashed border-slate-300 rounded-xl p-4 hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer bg-white group"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <label className="flex items-center justify-center gap-4 w-full h-full cursor-pointer py-2">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div className="text-left flex-1 sm:flex-none">
                   <p className="font-semibold text-slate-700 group-hover:text-blue-700 text-sm sm:text-base">点击或拖拽上传更多试卷</p>
                   <p className="text-xs text-slate-400">支持 .docx 或 .zip 格式</p>
                </div>
                <input type="file" className="hidden" multiple accept=".docx,.zip" onChange={handleFileChange} />
            </label>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
             <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
               <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                 <FileText className="w-4 h-4 text-blue-600" />
                 已上传试卷 ({files.length})
               </h3>
             </div>
             <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
               {files.map((file) => (
                 <div key={file.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                   <div className="flex items-center gap-3 overflow-hidden">
                     <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                       <FileType className="w-4 h-4" />
                     </div>
                     <div className="min-w-0">
                       <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                       <p className="text-xs text-slate-500">
                          {file.file.size > 1024 * 1024 
                            ? `${(file.file.size / (1024 * 1024)).toFixed(2)} MB` 
                            : `${(file.file.size / 1024).toFixed(1)} KB`}
                       </p>
                     </div>
                   </div>
                   <button
                     onClick={() => onFileDelete(file.id)}
                     className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                     title="移除文件"
                   >
                     <Trash2 className="w-4 h-4" />
                   </button>
                 </div>
               ))}
             </div>
          </div>
        </>
      )}
    </div>
  );
};