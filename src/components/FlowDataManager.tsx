import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiService } from '../api/apiService';
import type { FlowDataType } from '../types/flow';

const MAX_DATA_POINTS = 120;

interface FlowDataContextType {
  flowDataHistory: FlowDataType[][];
  lastUpdated: Date | null;
}

const FlowDataContext = createContext<FlowDataContextType | null>(null);

export const FlowDataProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [flowDataHistory, setFlowDataHistory] = useState<FlowDataType[][]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await apiService.getFlowTableData();
        setLastUpdated(new Date());
        setFlowDataHistory(prev => {
          const updated = [...prev, data];
          return updated.length > MAX_DATA_POINTS
            ? updated.slice(-MAX_DATA_POINTS)
            : updated;
        });
      } catch (error) {
        console.error('Error fetching flow table data:', error);
      }
    };
    fetchData();
    const intervalId = setInterval(fetchData, 1000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <FlowDataContext.Provider value={{ flowDataHistory, lastUpdated }}>
      {children}
    </FlowDataContext.Provider>
  );
};

export const useFlowDataManager = () => {
  const context = useContext(FlowDataContext);
  if (!context) {
    throw new Error(
      'useFlowDataManager must be used within a FlowDataProvider'
    );
  }
  return context;
};
