import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type {Plugin} from 'vite';
// Document preview uses the school's isolated native reader; no local Office engine.
const readerBuildGuard:Plugin={name:'platform-reader-boundary',apply:'build',generateBundle(_options,bundle){
  for(const row of Object.values(bundle)){
    if(row.type==='chunk'&&Object.keys(row.modules).some(id=>id.includes('/node_modules/@aiden0z/pptx-renderer/')||id.includes('/node_modules/docx-preview/')))this.error('Local Office renderer must not be shipped');
    if(/office-engine.*\.js$/.test(row.fileName))this.error('Local Office engine must not be shipped');
  }
}};
export default defineConfig({plugins:[readerBuildGuard,react()],build:{target:'chrome74',cssTarget:'chrome74'},test:{environment:'jsdom'}});
