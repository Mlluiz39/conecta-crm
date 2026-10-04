/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CrmProvider, useCrm } from './context/CrmContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ToastContainer } from './components/common/ToastContainer';
import { NewLeadModal } from './components/common/NewLeadModal';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { ConversasPage } from './pages/ConversasPage';
import { ContatosPage } from './pages/ContatosPage';
import { PipelinePage } from './pages/PipelinePage';
import { CalendarioPage } from './pages/CalendarioPage';
import { RelatoriosPage } from './pages/RelatoriosPage';
import { AgentesPage } from './pages/AgentesPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { SettingsPage } from './pages/SettingsPage';

const AppContent: React.FC = () => {
  const { activePage, isSidebarCollapsed } = useCrm();

  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'conversas':
        return <ConversasPage />;
      case 'contatos':
        return <ContatosPage />;
      case 'pipeline':
        return <PipelinePage />;
      case 'calendario':
        return <CalendarioPage />;
      case 'relatorios':
        return <RelatoriosPage />;
      case 'agentes':
      case 'agentes-de-ia':
        return <AgentesPage />;
      case 'templates':
        return <TemplatesPage />;
      case 'configuracoes':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Collapsible Left Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[margin-left] duration-300 ${
          isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
        }`}
      >
        <Header />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto min-w-0">
          {renderActivePage()}
        </main>
      </div>

      {/* Global Modals & Notifications */}
      <NewLeadModal />
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <CrmProvider>
      <AppContent />
    </CrmProvider>
  );
}
