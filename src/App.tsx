import React, { useState, useRef } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/common/ErrorBoundary';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import SwitchFlowTable from './pages/SwitchFlowTable';
import AvailabilityStatus from './pages/AvailabilityStatus';
import { GraphDataProvider } from './components/GraphDataManager';
import { FlowDataProvider } from './components/FlowDataManager';
import { UI_CONSTANTS } from './utils/constants';

interface DashboardRef {
  addFlowPanel: () => void;
  closeAllPanels: () => void;
}

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const dashboardRef = useRef<DashboardRef>(null);

  const handleToggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleShowFlowPanel = () => {
    if (dashboardRef.current?.addFlowPanel) {
      dashboardRef.current.addFlowPanel();
    }
  };

  const sidebarWidth = sidebarCollapsed
    ? UI_CONSTANTS.SIDEBAR_WIDTH.COLLAPSED
    : UI_CONSTANTS.SIDEBAR_WIDTH.EXPANDED;

  return (
    <div className="flex h-screen bg-gray-100">
      <GraphDataProvider>
        <FlowDataProvider>
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={handleToggleSidebar}
            onShowFlowPanel={handleShowFlowPanel}
          />
          <main
            className="flex-1 overflow-y-auto transition-all duration-300 ease-out"
            style={{
              marginLeft: `${sidebarWidth}px`,
            }}
          >
            <Routes>
              <Route path="/" element={<Dashboard ref={dashboardRef} />} />
              <Route
                path="/NetworkTopology"
                element={<Dashboard ref={dashboardRef} />}
              />
              <Route path="/SwitchFlowTable" element={<SwitchFlowTable />} />
              <Route path="/AvailabilityStatus" element={<AvailabilityStatus />} />
              <Route
                path="*"
                element={<Navigate to="/NetworkTopology" replace />}
              />
            </Routes>
          </main>
        </FlowDataProvider>
      </GraphDataProvider>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
