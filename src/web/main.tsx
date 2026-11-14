import 'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css';
import './styles/index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 2000, refetchOnWindowFocus: true } },
});

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-right" offset={{ top: 16, right: 16 }} richColors closeButton toastOptions={{ className: 'toast' }} />
    </QueryClientProvider>
  </StrictMode>,
);
