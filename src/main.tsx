import { createRoot } from 'react-dom/client';
import { loader } from '@monaco-editor/react';
import App from './App'
import "./assets/css/global"

// 配置 Monaco Editor 使用本地文件而不是 CDN
// 判断是否是 Electron 中运行（会使用 file:// 协议）
const isElectron = window.location.protocol === 'file:';
const vsPaths = isElectron 
  ? `${window.location.pathname.replace(/\/index.html$/, '')}/vs`
  : '/vs';

loader.config({ paths: { vs: vsPaths } });

createRoot(document.getElementById('root') as Element).render(<App />)
