import React, { useCallback } from 'react';
import { UploadCloud, FileType, FileArchive } from 'lucide-react';
import { extractFilesFromZip } from '../services/docxService';
import { StudentFile } from '../types';

interface FileUploaderProps {
  onFilesAdded: (files: StudentFile[]) => void;
  onNext: () => void;
  hasFiles: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFilesAdded, onNext, hasFiles }) => {
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
    <div className="max-w-3xl mx-auto">
      <div 
        className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer bg-white"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
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

      {hasFiles && (
        <div className="mt-8 flex justify-end">
           <button
            onClick={onNext}
            className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-8 rounded-md font-medium transition-colors shadow-sm"
          >
            开始评分
          </button>
        </div>
      )}
    </div>
  );
};