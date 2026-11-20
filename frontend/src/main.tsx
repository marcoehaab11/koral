import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { LocaleProvider } from './data';
import { PublicSite, Feedback } from './public';
import './style.css';

const Studio = lazy(() => import('./studio'));
const queries = new QueryClient({defaultOptions:{queries:{staleTime:15000}}});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queries}><BrowserRouter><LocaleProvider><Suspense fallback={<Feedback pending />}>
    <Routes><Route path="/ADMIN/*" element={<Studio/>}/><Route path="/*" element={<PublicSite/>}/></Routes>
  </Suspense></LocaleProvider></BrowserRouter></QueryClientProvider>,
);
