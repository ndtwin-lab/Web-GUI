import { useState, useCallback, useRef } from 'react';
import type { Panel } from '../components/PanelManager';

const BASE_Z_INDEX = 70;
const Z_INDEX_INCREMENT = 10;

export const usePanelManager = () => {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [topZIndex, setTopZIndex] = useState(BASE_Z_INDEX);
  const panelCounter = useRef(0);

  const generatePanelId = useCallback(() => {
    return `panel_${Date.now()}_${++panelCounter.current}`;
  }, []);

  const getNextZIndex = useCallback(() => {
    const nextZIndex = topZIndex + Z_INDEX_INCREMENT;
    setTopZIndex(nextZIndex);
    return nextZIndex;
  }, [topZIndex]);

  const addPanel = useCallback(
    (type: Panel['type'], data: any, position?: { x: number; y: number }) => {
      const newPanel: Panel = {
        id: generatePanelId(),
        type,
        data,
        position,
        zIndex: getNextZIndex(),
        isVisible: true,
      };

      setPanels(prev => [...prev, newPanel]);
      return newPanel.id;
    },
    [generatePanelId, getNextZIndex]
  );

  const closePanel = useCallback((panelId: string) => {
    setPanels(prev => prev.filter(panel => panel.id !== panelId));
  }, []);

  const bringToFront = useCallback(
    (panelId: string) => {
      setPanels(prev =>
        prev.map(panel =>
          panel.id === panelId ? { ...panel, zIndex: getNextZIndex() } : panel
        )
      );
    },
    [getNextZIndex]
  );

  const closeAllPanels = useCallback(() => {
    setPanels([]);
    setTopZIndex(BASE_Z_INDEX);
  }, []);

  const getPanelById = useCallback(
    (panelId: string) => {
      return panels.find(panel => panel.id === panelId);
    },
    [panels]
  );

  const updatePanelData = useCallback((panelId: string, data: any) => {
    setPanels(prev =>
      prev.map(panel => (panel.id === panelId ? { ...panel, data } : panel))
    );
  }, []);

  const updatePanelDataByType = useCallback(
    (
      type:
        | 'perLinkFlow'
        | 'flowStacked'
        | 'tracePerLinkFlow'
        | 'traceFlowStacked',
      data: any
    ) => {
      setPanels(prev =>
        prev.map(panel => (panel.type === type ? { ...panel, data } : panel))
      );
    },
    []
  );

  const togglePanelVisibility = useCallback((panelId: string) => {
    setPanels(prev =>
      prev.map(panel =>
        panel.id === panelId ? { ...panel, isVisible: !panel.isVisible } : panel
      )
    );
  }, []);

  const hasPanelOfType = useCallback(
    (type: Panel['type'], data?: any) => {
      return panels.some(
        panel =>
          panel.type === type &&
          (data === undefined ||
            panel.data === data ||
            String(panel.data) === String(data))
      );
    },
    [panels]
  );

  const getPanelByType = useCallback(
    (type: Panel['type'], data?: any) => {
      return panels.find(
        panel =>
          panel.type === type &&
          (data === undefined ||
            panel.data === data ||
            String(panel.data) === String(data))
      );
    },
    [panels]
  );

  return {
    panels,
    addPanel,
    closePanel,
    bringToFront,
    closeAllPanels,
    getPanelById,
    updatePanelData,
    updatePanelDataByType,
    togglePanelVisibility,
    hasPanelOfType,
    getPanelByType,
  };
};
