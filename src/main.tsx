import { createRoot } from 'react-dom/client';
import { loader } from '@monaco-editor/react';
import App from './App'
import "./assets/css/global"

// 配置 Monaco Editor 使用本地文件而不是 CDN
loader.config({ paths: { vs: '/vs' } });

createRoot(document.getElementById('root') as Element).render(<App />)
