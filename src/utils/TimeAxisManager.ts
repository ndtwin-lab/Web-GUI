import type {
  TraceDataPoint,
  ParsedTraceData,
} from '../components/trace/TraceDataParser';

export interface TimeAxisOptions {
  enableCaching?: boolean;
  cacheSize?: number; // Maximum number of cached time points
  enableInterpolation?: boolean; // Enable interpolation for missing time points
}

export class TimeAxisManager {
  private flowData: ParsedTraceData | null = null;
  private graphData: ParsedTraceData | null = null;
  private timeIndex: Map<string, { flowIndex: number; graphIndex: number }> =
    new Map();
  private cache: Map<string, { flowData: any[]; graphData: any }> = new Map();
  private options: Required<TimeAxisOptions>;

  constructor(options: TimeAxisOptions = {}) {
    this.options = {
      enableCaching: options.enableCaching || true,
      cacheSize: options.cacheSize || 100,
      enableInterpolation: options.enableInterpolation || true,
    };
  }

  /**
   * Initialize the time axis with flow and graph data
   */
  initialize(
    flowData: ParsedTraceData | null,
    graphData: ParsedTraceData | null
  ): void {
    this.flowData = flowData;
    this.graphData = graphData;
    this.buildTimeIndex();
    this.cache.clear();
  }

  /**
   * Build time index for fast random access
   */
  private buildTimeIndex(): void {
    this.timeIndex.clear();

    const allTimePoints = new Set<string>();

    if (this.flowData) {
      this.flowData.dataPoints.forEach((point, index) => {
        allTimePoints.add(point.timestamp);
      });
    }

    if (this.graphData) {
      this.graphData.dataPoints.forEach((point, index) => {
        allTimePoints.add(point.timestamp);
      });
    }

    // Create index for each time point
    Array.from(allTimePoints)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .forEach(timestamp => {
        const flowIndex =
          this.flowData?.dataPoints.findIndex(
            point => point.timestamp === timestamp
          ) ?? -1;
        const graphIndex =
          this.graphData?.dataPoints.findIndex(
            point => point.timestamp === timestamp
          ) ?? -1;

        this.timeIndex.set(timestamp, { flowIndex, graphIndex });
      });
  }

  /**
   * Get all available time points
   */
  getAvailableTimePoints(): string[] {
    return Array.from(this.timeIndex.keys()).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );
  }

  /**
   * Get data at specific timestamp
   */
  getDataAtTime(timestamp: string): {
    flowData: any[];
    graphData: any | null;
    hasFlowData: boolean;
    hasGraphData: boolean;
  } {
    // Check cache first
    if (this.options.enableCaching && this.cache.has(timestamp)) {
      const cached = this.cache.get(timestamp)!;
      return {
        flowData: cached.flowData,
        graphData: cached.graphData,
        hasFlowData: cached.flowData.length > 0,
        hasGraphData: cached.graphData !== null,
      };
    }

    const index = this.timeIndex.get(timestamp);
    if (!index) {
      // If exact match not found, try to find the nearest timestamp within 1 second
      const nearestData = this.getNearestDataAtTime(timestamp);
      return {
        flowData: nearestData.flowData,
        graphData: nearestData.graphData,
        hasFlowData: nearestData.flowData.length > 0,
        hasGraphData: nearestData.graphData !== null,
      };
    }

    let flowData: any[] = [];
    let graphData: any = null;

    // Get flow data - try exact match first, then nearest if not found
    if (index.flowIndex >= 0 && this.flowData) {
      const flowPoint = this.flowData.dataPoints[index.flowIndex];
      if (flowPoint && Array.isArray(flowPoint.data)) {
        flowData = flowPoint.data;
      }
    } else if (this.flowData) {
      // If no exact flow match, find the nearest flow data within 1 second
      const targetTime = new Date(timestamp).getTime();
      let nearestFlowIndex = -1;
      let minFlowDiff = Infinity;

      this.flowData.dataPoints.forEach((point, index) => {
        const pointTime = new Date(point.timestamp).getTime();
        const diff = Math.abs(pointTime - targetTime);
        if (diff < minFlowDiff && diff <= 1000) {
          // Within 1 second
          minFlowDiff = diff;
          nearestFlowIndex = index;
        }
      });

      if (nearestFlowIndex >= 0) {
        const flowPoint = this.flowData.dataPoints[nearestFlowIndex];
        if (flowPoint && Array.isArray(flowPoint.data)) {
          flowData = flowPoint.data;
        }
      }
    }

    // Get graph data - try exact match first, then nearest if not found
    if (index.graphIndex >= 0 && this.graphData) {
      const graphPoint = this.graphData.dataPoints[index.graphIndex];
      if (graphPoint && !Array.isArray(graphPoint.data)) {
        graphData = graphPoint.data;
      }
    } else if (this.graphData) {
      // If no exact graph match, find the nearest graph data within 1 second
      const targetTime = new Date(timestamp).getTime();
      let nearestGraphIndex = -1;
      let minGraphDiff = Infinity;

      this.graphData.dataPoints.forEach((point, index) => {
        const pointTime = new Date(point.timestamp).getTime();
        const diff = Math.abs(pointTime - targetTime);
        if (diff < minGraphDiff && diff <= 1000) {
          // Within 1 second
          minGraphDiff = diff;
          nearestGraphIndex = index;
        }
      });

      if (nearestGraphIndex >= 0) {
        const graphPoint = this.graphData.dataPoints[nearestGraphIndex];
        if (graphPoint && !Array.isArray(graphPoint.data)) {
          graphData = graphPoint.data;
        }
      }
    }

    // Cache the result
    if (this.options.enableCaching) {
      this.cacheResult(timestamp, flowData, graphData);
    }

    return {
      flowData,
      graphData,
      hasFlowData: flowData.length > 0,
      hasGraphData: graphData !== null,
    };
  }

  /**
   * Get nearest data to a timestamp
   */
  getNearestDataAtTime(timestamp: string): {
    flowData: any[];
    graphData: any | null;
    actualTime: string;
    timeDifference: number;
  } {
    const targetTime = new Date(timestamp).getTime();
    let nearestTime = '';
    let minDifference = Infinity;

    // Find nearest time point within 1 second (1000ms)
    const maxTimeDifference = 1000; // 1 second tolerance

    for (const timePoint of this.timeIndex.keys()) {
      const difference = Math.abs(new Date(timePoint).getTime() - targetTime);
      if (difference < minDifference && difference <= maxTimeDifference) {
        minDifference = difference;
        nearestTime = timePoint;
      }
    }

    if (!nearestTime) {
      return {
        flowData: [],
        graphData: null,
        actualTime: timestamp,
        timeDifference: Infinity,
      };
    }

    // Get data from the nearest time point
    const index = this.timeIndex.get(nearestTime);
    let flowData: any[] = [];
    let graphData: any = null;

    // Get flow data
    if (index && index.flowIndex >= 0 && this.flowData) {
      const flowPoint = this.flowData.dataPoints[index.flowIndex];
      if (flowPoint && Array.isArray(flowPoint.data)) {
        flowData = flowPoint.data;
      }
    }

    // Get graph data
    if (index && index.graphIndex >= 0 && this.graphData) {
      const graphPoint = this.graphData.dataPoints[index.graphIndex];
      if (graphPoint && !Array.isArray(graphPoint.data)) {
        graphData = graphPoint.data;
      }
    }

    return {
      flowData,
      graphData,
      actualTime: nearestTime,
      timeDifference: minDifference,
    };
  }

  /**
   * Get interpolated data for missing time points
   */
  getInterpolatedDataAtTime(timestamp: string): {
    flowData: any[];
    graphData: any | null;
    isInterpolated: boolean;
  } {
    if (!this.options.enableInterpolation) {
      const data = this.getDataAtTime(timestamp);
      return {
        flowData: data.flowData,
        graphData: data.graphData,
        isInterpolated: false,
      };
    }

    const timePoints = this.getAvailableTimePoints();
    const targetTime = new Date(timestamp).getTime();

    // Find surrounding time points
    let beforeTime = '';
    let afterTime = '';
    let beforeIndex = -1;
    let afterIndex = -1;

    for (let i = 0; i < timePoints.length; i++) {
      const timePoint = timePoints[i];
      const timePointTime = new Date(timePoint).getTime();

      if (timePointTime <= targetTime) {
        beforeTime = timePoint;
        beforeIndex = i;
      }
      if (timePointTime >= targetTime && afterTime === '') {
        afterTime = timePoint;
        afterIndex = i;
        break;
      }
    }

    // If exact match found
    if (beforeTime === timestamp) {
      const data = this.getDataAtTime(timestamp);
      return {
        flowData: data.flowData,
        graphData: data.graphData,
        isInterpolated: false,
      };
    }

    // If no surrounding data
    if (!beforeTime && !afterTime) {
      return {
        flowData: [],
        graphData: null,
        isInterpolated: false,
      };
    }

    // If only one side available
    if (!beforeTime || !afterTime) {
      const availableTime = beforeTime || afterTime;
      if (!availableTime) {
        return {
          flowData: [],
          graphData: null,
          isInterpolated: false,
        };
      }
      const data = this.getDataAtTime(availableTime);
      return {
        flowData: data.flowData,
        graphData: data.graphData,
        isInterpolated: true,
      };
    }

    // Interpolate between two time points
    const beforeData = this.getDataAtTime(beforeTime);
    const afterData = this.getDataAtTime(afterTime);

    const beforeTimeMs = new Date(beforeTime).getTime();
    const afterTimeMs = new Date(afterTime).getTime();
    const ratio = (targetTime - beforeTimeMs) / (afterTimeMs - beforeTimeMs);

    // Simple interpolation: return the closer data point
    const interpolatedFlowData =
      ratio < 0.5 ? beforeData.flowData : afterData.flowData;
    const interpolatedGraphData =
      ratio < 0.5 ? beforeData.graphData : afterData.graphData;

    return {
      flowData: interpolatedFlowData,
      graphData: interpolatedGraphData,
      isInterpolated: true,
    };
  }

  /**
   * Get data within time range
   */
  getDataInTimeRange(
    startTime: string,
    endTime: string
  ): {
    timePoints: string[];
    data: Map<string, { flowData: any[]; graphData: any | null }>;
  } {
    const startTimeMs = new Date(startTime).getTime();
    const endTimeMs = new Date(endTime).getTime();

    const timePoints: string[] = [];
    const data = new Map();

    for (const [timestamp, index] of this.timeIndex) {
      const timeMs = new Date(timestamp).getTime();
      if (timeMs >= startTimeMs && timeMs <= endTimeMs) {
        timePoints.push(timestamp);
        const timeData = this.getDataAtTime(timestamp);
        data.set(timestamp, {
          flowData: timeData.flowData,
          graphData: timeData.graphData,
        });
      }
    }

    return { timePoints: timePoints.sort(), data };
  }

  /**
   * Get time statistics
   */
  getTimeStatistics(): {
    totalTimePoints: number;
    timeRange: { start: string; end: string };
    averageInterval: number; // in milliseconds
    missingTimePoints: string[];
  } {
    const timePoints = this.getAvailableTimePoints();
    const totalTimePoints = timePoints.length;

    if (totalTimePoints === 0) {
      return {
        totalTimePoints: 0,
        timeRange: { start: '', end: '' },
        averageInterval: 0,
        missingTimePoints: [],
      };
    }

    const startTime = timePoints[0];
    const endTime = timePoints[timePoints.length - 1];
    const totalDuration =
      new Date(endTime).getTime() - new Date(startTime).getTime();
    const averageInterval =
      totalTimePoints > 1 ? totalDuration / (totalTimePoints - 1) : 0;

    // Find missing time points (simplified - assumes 1-second intervals)
    const missingTimePoints: string[] = [];
    if (totalTimePoints > 1) {
      const expectedInterval = 1000; // 1 second
      for (let i = 1; i < timePoints.length; i++) {
        const currentTime = new Date(timePoints[i]).getTime();
        const previousTime = new Date(timePoints[i - 1]).getTime();
        const actualInterval = currentTime - previousTime;

        if (actualInterval > expectedInterval * 1.5) {
          // More than 1.5 seconds gap
          const missingCount =
            Math.floor(actualInterval / expectedInterval) - 1;
          for (let j = 1; j <= missingCount; j++) {
            const missingTime = new Date(
              previousTime + j * expectedInterval
            ).toISOString();
            missingTimePoints.push(missingTime);
          }
        }
      }
    }

    return {
      totalTimePoints,
      timeRange: { start: startTime, end: endTime },
      averageInterval,
      missingTimePoints,
    };
  }

  /**
   * Cache result to improve performance
   */
  private cacheResult(
    timestamp: string,
    flowData: any[],
    graphData: any
  ): void {
    if (!this.options.enableCaching) return;

    // Remove oldest entries if cache is full
    if (this.cache.size >= this.options.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(timestamp, { flowData, graphData });
  }

  /**
   * Clear cache to free memory
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): {
    cacheSize: number;
    maxCacheSize: number;
    hitRate: number; // This would need to be tracked separately
  } {
    return {
      cacheSize: this.cache.size,
      maxCacheSize: this.options.cacheSize,
      hitRate: 0, // Would need to implement hit tracking
    };
  }
}
