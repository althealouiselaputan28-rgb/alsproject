import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        main: resolve(__dirname, 'main.html'),
        eventCalendar: resolve(__dirname, 'event-calendar.html'),
        resources: resolve(__dirname, 'resources.html'),
        collegeAdmissionHub: resolve(__dirname, 'college-admission-hub.html'),
        userlogin: resolve(__dirname, 'userlogin.html')
      }
    }
  }
});
