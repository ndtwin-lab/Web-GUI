import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AvailabilityDataParser,
  type ParsedAvailabilityData,
  type AvailabilityFlowData,
  type AvailabilityGraphData,
} from './AvailabilityDataParser';
import {
  LargeFileProcessor,
  type OpenProgress,
} from '../../utils/LargeFileProcessor';
import { MemoryEfficientProcessor } from '../../utils/MemoryEfficientProcessor';
import { TimeAxisManager } from '../../utils/TimeAxisManager';

// Export types for compatibility
export type HistoryFlowData = any;
export type HistoryGraphData = any;

// Re-export types from AvailabilityDataParser for convenience
export type {
  AvailabilityFlowData,
  AvailabilityGraphData,
  ParsedAvailabilityData,
} from './AvailabilityDataParser';

export interface AvailabilityDataManagerState {
  flowData: ParsedAvailabilityData | null;
  graphData: ParsedAvailabilityData | null;
  currentTime: string;
  timeRange: {
    start: string;
    end: string;
  };
  availableTimePoints: string[];
  isPlaying: boolean;
  playbackSpeed: number;
  openProgress: OpenProgress | null;
  isOpening: boolean;
}

interface AvailabilityDataManagerProps {
  children: (
    state: AvailabilityDataManagerState & {
      openFlowData: (file: File) => Promise<void>;
      openGraphData: (file: File) => Promise<void>;
      clearData: () => void;
      getCurrentFlowData: () => AvailabilityFlowData[];
      getCurrentGraphData: () => AvailabilityGraphData | null;
      getAllFlowData: () => AvailabilityFlowData[];
      getAllFlowDataWithLoading: () => {
        data: AvailabilityFlowData[];
        isLoading: boolean;
        totalTimePoints: number;
      };
      setCurrentTime: (time: string) => void;
      setTimeRange: (start: string, end: string) => void;
      getAvailableTimePoints: () => string[];
      stepToNextTime: () => void;
      stepToPreviousTime: () => void;
      startPlayback: () => void;
      pausePlayback: () => void;
      stopPlayback: () => void;
      setPlaybackSpeed: (speed: number) => void;
      getDataAtTime: (time: string) => {
        flowData: AvailabilityFlowData[];
        graphData: AvailabilityGraphData | null;
      };
      getNearestDataAtTime: (time: string) => {
        flowData: AvailabilityFlowData[];
        graphData: AvailabilityGraphData | null;
        actualTime: string;
      };
      abortOpen: () => void;
    }
  ) => React.ReactNode;
}

const AvailabilityDataManager: React.FC<AvailabilityDataManagerProps> = ({ children }) => {
  const { t } = useTranslation();

  const [flowData, setFlowData] = useState<ParsedAvailabilityData | null>(null);
  const [graphData, setGraphData] = useState<ParsedAvailabilityData | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [timeRange, setTimeRange] = useState<{
    start: string;
    end: string;
  }>({
    start: '',
    end: '',
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackInterval, setPlaybackInterval] =
    useState<NodeJS.Timeout | null>(null);
  const [openProgress, setOpenProgress] = useState<OpenProgress | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [fileProcessor, setFileProcessor] = useState<LargeFileProcessor | null>(
    null
  );
  const [memoryProcessor, setMemoryProcessor] =
    useState<MemoryEfficientProcessor | null>(null);
  const [timeAxisManager] = useState(
    () =>
      new TimeAxisManager({
        enableCaching: true,
        cacheSize: 200,
        enableInterpolation: true,
      })
  );

  const availableTimePoints = useMemo((): string[] => {
    // Initialize time axis manager when data changes
    timeAxisManager.initialize(flowData, graphData);
    return timeAxisManager.getAvailableTimePoints();
  }, [flowData, graphData, timeAxisManager]);

  const updateTimeRange = useCallback(() => {
    if (availableTimePoints.length === 0) {
      setTimeRange({ start: '', end: '' });
      return;
    }

    const start = availableTimePoints[0];
    const end = availableTimePoints[availableTimePoints.length - 1];

    setTimeRange({ start, end });

    if (!currentTime || !availableTimePoints.includes(currentTime)) {
      setCurrentTime(start);
    }
  }, [availableTimePoints, currentTime]);

  useEffect(() => {
    updateTimeRange();
  }, [updateTimeRange]);

  const openFlowData = useCallback(async (file: File) => {
    try {
      setIsOpening(true);
      setOpenProgress({
        loaded: 0,
        total: file.size,
        percentage: 0,
        status: 'reading',
        message: 'Starting flow data open...',
      });

      // Check if file is too large
      if (LargeFileProcessor.isFileTooLarge(file)) {
        throw new Error(
          `File is too large (${LargeFileProcessor.formatFileSize(file.size)}). Maximum size is 5GB.`
        );
      }

      // Use memory efficient processor for large files
      const processor = new MemoryEfficientProcessor({
        onProgress: progress => {
          setOpenProgress(progress);
        },
        chunkSize: 1024 * 1024, // 1MB chunks
        maxMemoryUsage: 200, // 200MB max memory usage
        enableIndexing: true, // Enable indexing for fast random access
      });

      setMemoryProcessor(processor);
      const parsedData = await processor.processFile(file, 'flow');

      if (
        !parsedData ||
        !parsedData.dataPoints ||
        parsedData.dataPoints.length === 0
      ) {
        throw new Error('No valid flow data found in file');
      }

      setFlowData(parsedData);
      // console.log('Flow data opened:', {
      //   timePoints: parsedData.dataPoints.length,
      //   timeRange: parsedData.timeRange,
      // });

      setOpenProgress({
        loaded: file.size,
        total: file.size,
        percentage: 100,
        status: 'complete',
        message: `Successfully opened ${parsedData.dataPoints.length} flow data points`,
      });
    } catch (error) {
      console.error('Error opening flow data:', error);
      setOpenProgress({
        loaded: 0,
        total: file.size,
        percentage: 0,
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
      throw error;
    } finally {
      setIsOpening(false);
      setMemoryProcessor(null);
    }
  }, []);

  const openGraphData = useCallback(async (file: File) => {
    try {
      setIsOpening(true);
      setOpenProgress({
        loaded: 0,
        total: file.size,
        percentage: 0,
        status: 'reading',
        message: 'Starting graph data open...',
      });

      // Check if file is too large
      if (LargeFileProcessor.isFileTooLarge(file)) {
        throw new Error(
          `File is too large (${LargeFileProcessor.formatFileSize(file.size)}). Maximum size is 5GB.`
        );
      }

      // Use memory efficient processor for large files
      const processor = new MemoryEfficientProcessor({
        onProgress: progress => {
          setOpenProgress(progress);
        },
        chunkSize: 1024 * 1024, // 1MB chunks
        maxMemoryUsage: 200, // 200MB max memory usage
        enableIndexing: true, // Enable indexing for fast random access
      });

      setMemoryProcessor(processor);
      const parsedData = await processor.processFile(file, 'graph');

      if (
        !parsedData ||
        !parsedData.dataPoints ||
        parsedData.dataPoints.length === 0
      ) {
        throw new Error('No valid graph data found in file');
      }

      setGraphData(parsedData);
      // console.log('Graph data opened:', {
      //   timePoints: parsedData.dataPoints.length,
      //   timeRange: parsedData.timeRange,
      // });

      setOpenProgress({
        loaded: file.size,
        total: file.size,
        percentage: 100,
        status: 'complete',
        message: `Successfully opened ${parsedData.dataPoints.length} graph data points`,
      });
    } catch (error) {
      console.error('Error opening graph data:', error);
      setOpenProgress({
        loaded: 0,
        total: file.size,
        percentage: 0,
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
      throw error;
    } finally {
      setIsOpening(false);
      setMemoryProcessor(null);
    }
  }, []);

  const clearData = useCallback(() => {
    setFlowData(null);
    setGraphData(null);
    setCurrentTime('');
    setTimeRange({ start: '', end: '' });
    setIsPlaying(false);
    setOpenProgress(null);
    setIsOpening(false);
    if (playbackInterval) {
      clearInterval(playbackInterval);
      setPlaybackInterval(null);
    }
    if (fileProcessor) {
      fileProcessor.abort();
      setFileProcessor(null);
    }
    if (memoryProcessor) {
      memoryProcessor.abort();
      memoryProcessor.clearCache();
      setMemoryProcessor(null);
    }
  }, [playbackInterval, fileProcessor, memoryProcessor]);

  const abortOpen = useCallback(() => {
    if (fileProcessor) {
      fileProcessor.abort();
      setFileProcessor(null);
    }
    if (memoryProcessor) {
      memoryProcessor.abort();
      memoryProcessor.clearCache();
      setMemoryProcessor(null);
    }
    setIsOpening(false);
    setOpenProgress(null);
  }, [fileProcessor, memoryProcessor]);

  const getDataAtTime = useCallback(
    (time: string) => {
      const result = timeAxisManager.getDataAtTime(time);
      return {
        flowData: result.flowData as any[],
        graphData: result.graphData as any | null,
      };
    },
    [timeAxisManager]
  );

  const getNearestDataAtTime = useCallback(
    (time: string) => {
      const result = timeAxisManager.getNearestDataAtTime(time);
      return {
        flowData: result.flowData as any[],
        graphData: result.graphData as any | null,
        actualTime: result.actualTime,
      };
    },
    [timeAxisManager]
  );

  const getCurrentFlowData = useCallback((): any[] => {
    if (!currentTime) return [];
    const { flowData: data } = getDataAtTime(currentTime);
    return data;
  }, [currentTime, getDataAtTime]);

  const getCurrentGraphData = useCallback((): any | null => {
    if (!currentTime) return null;
    const { graphData: data } = getDataAtTime(currentTime);
    return data;
  }, [currentTime, getDataAtTime]);

  // Get all historical flow data for chart display
  const getAllFlowData = useCallback((): any[] => {
    if (!flowData) return [];
    const allFlows: any[] = [];
    flowData.dataPoints.forEach(point => {
      if (point.data && Array.isArray(point.data)) {
        allFlows.push(...(point.data as any[]));
      }
    });
    return allFlows;
  }, [flowData]);

  const getAllFlowDataWithLoading = useCallback((): {
    data: any[];
    isLoading: boolean;
    totalTimePoints: number;
  } => {
    if (!flowData) return { data: [], isLoading: false, totalTimePoints: 0 };

    const allFlows: any[] = [];
    flowData.dataPoints.forEach(point => {
      if (point.data && Array.isArray(point.data)) {
        allFlows.push(...(point.data as any[]));
      }
    });

    return {
      data: allFlows,
      isLoading: isOpening,
      totalTimePoints: flowData.dataPoints.length,
    };
  }, [flowData, isOpening]);

  const stepToNextTime = useCallback(() => {
    const currentIndex = availableTimePoints.indexOf(currentTime);
    if (currentIndex < availableTimePoints.length - 1) {
      setCurrentTime(availableTimePoints[currentIndex + 1]);
    }
  }, [currentTime, availableTimePoints]);

  const stepToPreviousTime = useCallback(() => {
    const currentIndex = availableTimePoints.indexOf(currentTime);
    if (currentIndex > 0) {
      setCurrentTime(availableTimePoints[currentIndex - 1]);
    }
  }, [currentTime, availableTimePoints]);

  const startPlayback = useCallback(() => {
    if (isPlaying || availableTimePoints.length === 0) return;

    setIsPlaying(true);
    const interval = setInterval(() => {
      setCurrentTime(prevTime => {
        const currentIndex = availableTimePoints.indexOf(prevTime);
        if (currentIndex >= availableTimePoints.length - 1) {
          setIsPlaying(false);
          return prevTime;
        }
        return availableTimePoints[currentIndex + 1];
      });
    }, 1000 / playbackSpeed);

    setPlaybackInterval(interval);
  }, [isPlaying, availableTimePoints, playbackSpeed]);

  const pausePlayback = useCallback(() => {
    setIsPlaying(false);
    if (playbackInterval) {
      clearInterval(playbackInterval);
      setPlaybackInterval(null);
    }
  }, [playbackInterval]);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (playbackInterval) {
      clearInterval(playbackInterval);
      setPlaybackInterval(null);
    }
    if (availableTimePoints.length > 0) {
      setCurrentTime(availableTimePoints[0]);
    }
  }, [playbackInterval, availableTimePoints]);

  const handleSetTimeRange = useCallback((start: string, end: string) => {
    setTimeRange({ start, end });
  }, []);

  const handleSetPlaybackSpeed = useCallback(
    (speed: number) => {
      setPlaybackSpeed(speed);
      if (isPlaying) {
        pausePlayback();
        setTimeout(() => startPlayback(), 100);
      }
    },
    [isPlaying, pausePlayback, startPlayback]
  );

  useEffect(() => {
    return () => {
      if (playbackInterval) {
        clearInterval(playbackInterval);
      }
    };
  }, [playbackInterval]);

  const state: any = {
    flowData,
    graphData,
    currentTime,
    timeRange,
    availableTimePoints,
    isPlaying,
    playbackSpeed,
    openProgress,
    isOpening,
  };

  return (
    <>
      {children({
        ...state,
        openFlowData,
        openGraphData,
        clearData,
        getCurrentFlowData,
        getCurrentGraphData,
        getAllFlowData,
        getAllFlowDataWithLoading,
        setCurrentTime,
        setTimeRange: handleSetTimeRange,
        getAvailableTimePoints: () => availableTimePoints,
        stepToNextTime,
        stepToPreviousTime,
        startPlayback,
        pausePlayback,
        stopPlayback,
        setPlaybackSpeed: handleSetPlaybackSpeed,
        getDataAtTime,
        getNearestDataAtTime,
        abortOpen,
      })}
    </>
  );
};

export default AvailabilityDataManager;
