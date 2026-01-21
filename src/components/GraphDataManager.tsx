import React, { createContext, useContext, useEffect, useState } from 'react';
import { get_graph_data } from '../api/index';
import type { GraphDataType, GraphDataContextType } from '../types';

const MAX_DATA_POINTS = 120;

const GraphDataContext = createContext<GraphDataContextType | null>(null);

export const GraphDataProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [graphData, setGraphData] = useState<GraphDataType[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await get_graph_data.get_graph_data();
        setLastUpdated(new Date());
        data.timestamp = new Date().toISOString();
        setGraphData(prev => {
          const updatedData = [...prev, data];
          return updatedData.length > MAX_DATA_POINTS
            ? updatedData.slice(-MAX_DATA_POINTS)
            : updatedData;
        });
      } catch (error) {
        console.error('Error fetching graph data:', error);
      }
    };
    const intervalId = setInterval(fetchData, 1000);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <GraphDataContext.Provider value={{ graphData, lastUpdated }}>
      {children}
    </GraphDataContext.Provider>
  );
};

export const useGraphData = () => {
  const context = useContext(GraphDataContext);
  if (!context) {
    throw new Error('useGraphData must be used within a GraphDataProvider');
  }
  return context;
};
