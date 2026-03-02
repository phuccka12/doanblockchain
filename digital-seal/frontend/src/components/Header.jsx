import React from "react";
import { UserCircle } from 'lucide-react';

export default function Header({ title, subtitle }) {
  return (
    <header className="mb-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3">
          <button className="hidden sm:inline-block bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-lg text-sm shadow-md">Đăng ký tác phẩm mới</button>
          <div className="flex items-center gap-2 bg-gray-800 px-3 py-2 rounded-full border border-gray-700">
            <UserCircle className="w-6 h-6 text-green-400" />
            <div className="text-sm text-gray-200">Minh Phan</div>
          </div>
        </div>
      </div>
    </header>
  );
}
