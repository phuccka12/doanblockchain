import React from "react";
import { UploadCloud } from 'lucide-react';

export default function DropzoneArea({ getRootProps, getInputProps, isDragActive, preview, isProcessing, step, open }) {
  return (
    <div 
      {...getRootProps()} 
      className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-all cursor-pointer relative overflow-hidden min-h-[240px]
        ${isDragActive ? 'border-blue-500 bg-blue-500/6' : 'border-gray-700 bg-[#071124] hover:border-blue-400'}`}
    >
      <input {...getInputProps()} />
      
      {preview ? (
        <div className="absolute inset-0 w-full h-full p-3">
          <img src={preview} alt="Preview" className="w-full h-full object-contain rounded-lg" />
          {!isProcessing && step === 0 && (
            <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <p className="text-white font-medium flex items-center gap-2"><UploadCloud className="w-5 h-5"/> Chọn ảnh khác</p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center space-y-3 max-w-xs">
          <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-2 border border-gray-800">
            <UploadCloud className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Kéo và thả ảnh tại đây</h3>
          <p className="text-xs text-gray-400">Hỗ trợ JPG, PNG, TIFF (Tối đa 50MB)</p>
          <button onClick={(e) => { e.stopPropagation(); open(); }} className="mt-3 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md text-sm shadow">Chọn tệp từ thiết bị</button>
        </div>
      )}
    </div>
  );
}
