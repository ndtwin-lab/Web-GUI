import React from 'react';

export interface AvailabilityFlowData {
  timestamp: string;
  src_ip: number;
  dst_ip: number;
  src_port: number;
  dst_port: number;
  protocol_id: number;
  estimated_flow_sending_rate_bps_in_the_proceeding_1sec_timeslot: string;
  estimated_packet_rate_in_the_proceeding_1sec_timeslot: string;
  estimated_packet_rate_in_the_last_sec: string;
  first_sampled_time: string;
  latest_sampled_time: string;
  path: Array<{
    node: string;
    interface: number;
  }>;
}

export interface AvailabilityGraphData {
  timestamp: string;
  nodes: Array<{
    device_name: string;
    dpid: string;
    ip: number[];
    is_enabled: boolean;
    is_up: boolean;
    mac: string;
    vertex_type: number;
    brand_name: string;
    device_layer: number;
  }>;
  edges: Array<{
    src_dpid?: string;
    dst_dpid?: string;
    src_ip?: number[];
    dst_ip?: number[];
    src_interface?: number;
    dst_interface?: number;
    link_bandwidth_utilization_percent?: number;
    link_bandwidth_bps?: string;
    link_bandwidth_usage_bps?: string;
    left_link_bandwidth_bps?: string;
    flow_set?: any[];
    is_enabled?: boolean;
    is_up?: boolean;
    // Legacy fields for backward compatibility
    src?: string;
    dst?: string;
    src_port?: number;
    dst_port?: number;
    bandwidth?: number;
    delay?: number;
  }>;
}

export interface AvailabilityDataPoint {
  timestamp: string;
  data: AvailabilityFlowData[] | AvailabilityGraphData;
}

export interface ParsedAvailabilityData {
  type: 'flow' | 'graph';
  dataPoints: AvailabilityDataPoint[];
  timeRange: {
    start: string;
    end: string;
  };
  metadata: {
    fileSize: number;
    fileName: string;
    parseTime: string;
    dataPointsCount: number;
  };
}

export class AvailabilityDataParser {
  /**
   * Parse JSON Lines format history data (each line is a JSON object)
   */
  static parseJSONLines(
    content: string,
    type: 'flow' | 'graph'
  ): ParsedAvailabilityData {
    try {
      const lines = content.trim().split('\n');
      const dataPoints: AvailabilityDataPoint[] = [];
      let minTimestamp = Infinity;
      let maxTimestamp = 0;
      let baseTimestamp = 0;

      lines.forEach((line, index) => {
        if (line.trim()) {
          try {
            const jsonData = JSON.parse(line);

            if (!jsonData.timestamp) {
              console.warn(`Line ${index + 1}: Missing timestamp field`);
              return;
            }

            const timestampMs = parseInt(jsonData.timestamp, 10);
            if (isNaN(timestampMs)) {
              console.warn(
                `Line ${index + 1}: Invalid timestamp format: ${jsonData.timestamp}`
              );
              return;
            }

            // Use first timestamp as base for relative time calculation
            if (baseTimestamp === 0) {
              baseTimestamp = timestampMs;
            }

            minTimestamp = Math.min(minTimestamp, timestampMs);
            maxTimestamp = Math.max(maxTimestamp, timestampMs);

            // Convert Unix timestamp (milliseconds) directly to ISO format
            const timestampIso = new Date(timestampMs).toISOString();

            let data: any[] | any;

            if (type === 'flow') {
              // Parse flow data
              if (!jsonData.flow_info || !Array.isArray(jsonData.flow_info)) {
                console.warn(
                  `Line ${index + 1}: Missing or invalid flow_info field`
                );
                return;
              }

              data = jsonData.flow_info.map((flow: any) => ({
                timestamp: timestampIso,
                src_ip: flow.src_ip,
                dst_ip: flow.dst_ip,
                src_port: flow.src_port,
                dst_port: flow.dst_port,
                protocol_id: flow.protocol_id,
                estimated_flow_sending_rate_bps_in_the_proceeding_1sec_timeslot:
                  flow.estimated_flow_sending_rate_bps_in_the_proceeding_1sec_timeslot,
                estimated_packet_rate_in_the_proceeding_1sec_timeslot:
                  flow.estimated_packet_rate_in_the_proceeding_1sec_timeslot,
                estimated_packet_rate_in_the_last_sec:
                  flow.estimated_packet_rate_in_the_last_sec,
                // Preserve original string format for first_sampled_time and latest_sampled_time
                first_sampled_time: flow.first_sampled_time || '',
                latest_sampled_time: flow.latest_sampled_time || '',
                // Also keep the ms versions for backward compatibility (convert to timestamp if needed)
                // first_sampled_time_ms: flow.first_sampled_time_ms && typeof flow.first_sampled_time_ms === 'number'
                //   ? flow.first_sampled_time_ms
                //   : flow.first_sampled_time
                //     ? new Date(flow.first_sampled_time).getTime()
                //     : new Date(timestampIso).getTime(),
                // latest_sampled_time_ms: flow.latest_sampled_time_ms && typeof flow.latest_sampled_time_ms === 'number'
                //   ? flow.latest_sampled_time_ms
                //   : flow.latest_sampled_time
                //     ? new Date(flow.latest_sampled_time).getTime()
                //     : new Date(timestampIso).getTime(),
                path: flow.path || [],
              }));
            } else {
              // Parse graph data
              if (!jsonData.nodes || !Array.isArray(jsonData.nodes)) {
                console.warn(
                  `Line ${index + 1}: Missing or invalid nodes field`
                );
                return;
              }

              // validate
              const validNodes = jsonData.nodes.filter((node: any) => {
                if (!node || typeof node !== 'object') {
                  console.warn(`Line ${index + 1}: Invalid node object:`, node);
                  return false;
                }
                if (!node.dpid) {
                  console.warn(`Line ${index + 1}: Node missing dpid:`, node);
                  return false;
                }
                return true;
              });

              // validate edges
              const validEdges = (jsonData.edges || []).filter((edge: any) => {
                if (!edge || typeof edge !== 'object') {
                  console.warn(`Line ${index + 1}: Invalid edge object:`, edge);
                  return false;
                }
                // support (src_dpid, dst_dpid) and (src, dst)
                if (
                  (!edge.src_dpid && !edge.src) ||
                  (!edge.dst_dpid && !edge.dst)
                ) {
                  console.warn(
                    `Line ${index + 1}: Edge missing src or dst:`,
                    edge
                  );
                  return false;
                }
                return true;
              });

              data = {
                timestamp: timestampIso,
                nodes: validNodes,
                edges: validEdges,
              };
            }

            dataPoints.push({
              timestamp: timestampIso,
              data,
            });
          } catch (error) {
            console.error(`Error parsing line ${index + 1}:`, error);
          }
        }
      });

      // Sort by timestamp
      dataPoints.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const startTime = dataPoints.length > 0 ? dataPoints[0].timestamp : '';
      const endTime =
        dataPoints.length > 0
          ? dataPoints[dataPoints.length - 1].timestamp
          : '';

      return {
        type,
        dataPoints,
        timeRange: {
          start: startTime,
          end: endTime,
        },
        metadata: {
          fileSize: content.length,
          fileName: `opened_${type}.json`,
          parseTime: new Date().toISOString(),
          dataPointsCount: dataPoints.length,
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse JSON lines: ${error}`);
    }
  }

  /**
   * Parse JSON format history data (legacy support)
   */
  static parseJSON(content: string): ParsedAvailabilityData {
    try {
      const data = JSON.parse(content);

      // Handle different JSON formats
      if (Array.isArray(data)) {
        // Format: Array of data points
        return this.parseArrayFormat(data);
      } else if (data.dataPoints && Array.isArray(data.dataPoints)) {
        // Format: Object with dataPoints array
        return this.parseObjectFormat(data);
      } else if (data.timestamps && Array.isArray(data.timestamps)) {
        // Format: Object with timestamps and corresponding data
        return this.parseTimestampFormat(data);
      } else {
        throw new Error('Unsupported JSON format');
      }
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error}`);
    }
  }

  /**
   * Parse CSV format history data
   */
  static parseCSV(content: string): ParsedAvailabilityData {
    try {
      const lines = content.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim());

      // Find timestamp column index
      const timestampIndex = headers.findIndex(
        h =>
          h.toLowerCase().includes('timestamp') ||
          h.toLowerCase().includes('time') ||
          h.toLowerCase().includes('date')
      );

      if (timestampIndex === -1) {
        throw new Error('No timestamp column found in CSV');
      }

      const dataPoints: AvailabilityDataPoint[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length >= headers.length) {
          const timestamp = values[timestampIndex];

          // Create a basic data point structure
          // You'll need to customize this based on your actual CSV format
          const dataPoint: AvailabilityDataPoint = {
            timestamp,
            data: [],
          };

          dataPoints.push(dataPoint);
        }
      }

      return {
        type: 'flow', // Default to flow type for CSV
        dataPoints,
        timeRange: {
          start: dataPoints[0]?.timestamp || '',
          end: dataPoints[dataPoints.length - 1]?.timestamp || '',
        },
        metadata: {
          fileSize: content.length,
          fileName: 'opened.csv',
          parseTime: new Date().toISOString(),
          dataPointsCount: dataPoints.length,
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse CSV: ${error}`);
    }
  }

  /**
   * Parse text format history data
   */
  static parseText(content: string): ParsedAvailabilityData {
    try {
      const lines = content
        .trim()
        .split('\n')
        .filter(line => line.trim());

      // Try to detect format automatically
      if (content.includes('{') && content.includes('}')) {
        // Looks like JSON
        return this.parseJSON(content);
      } else if (content.includes(',') && lines.length > 1) {
        // Looks like CSV
        return this.parseCSV(content);
      } else {
        // Custom text format - you'll need to implement this based on your format
        return this.parseCustomTextFormat(content);
      }
    } catch (error) {
      throw new Error(`Failed to parse text: ${error}`);
    }
  }

  /**
   * Parse custom text format
   */
  private static parseCustomTextFormat(content: string): ParsedAvailabilityData {
    const lines = content
      .trim()
      .split('\n')
      .filter(line => line.trim());
    const dataPoints: AvailabilityDataPoint[] = [];

    // This is a placeholder implementation
    // You'll need to customize this based on your actual text format
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Example: Parse timestamp from line
      // You'll need to implement the actual parsing logic
      const timestamp = new Date(
        Date.now() - (lines.length - i) * 60000
      ).toISOString();

      const dataPoint: AvailabilityDataPoint = {
        timestamp,
        data: [],
      };

      dataPoints.push(dataPoint);
    }

    return {
      type: 'flow', // Default to flow type for text
      dataPoints,
      timeRange: {
        start: dataPoints[0]?.timestamp || '',
        end: dataPoints[dataPoints.length - 1]?.timestamp || '',
      },
      metadata: {
        fileSize: content.length,
        fileName: 'opened.txt',
        parseTime: new Date().toISOString(),
        dataPointsCount: dataPoints.length,
      },
    };
  }

  /**
   * Parse array format JSON
   */
  private static parseArrayFormat(data: any[]): ParsedAvailabilityData {
    const dataPoints: AvailabilityDataPoint[] = data.map((item, index) => ({
      timestamp:
        item.timestamp ||
        new Date(Date.now() - (data.length - index) * 60000).toISOString(),
      data: item.flows || item.data || [],
    }));

    return {
      type: 'flow', // Default to flow type for array format
      dataPoints,
      timeRange: {
        start: dataPoints[0]?.timestamp || '',
        end: dataPoints[dataPoints.length - 1]?.timestamp || '',
      },
      metadata: {
        fileSize: JSON.stringify(data).length,
        fileName: 'opened.json',
        parseTime: new Date().toISOString(),
        dataPointsCount: dataPoints.length,
      },
    };
  }

  /**
   * Parse object format JSON
   */
  private static parseObjectFormat(data: any): ParsedAvailabilityData {
    const dataPoints: AvailabilityDataPoint[] = data.dataPoints.map(
      (item: any, index: number) => ({
        timestamp:
          item.timestamp ||
          new Date(
            Date.now() - (data.dataPoints.length - index) * 60000
          ).toISOString(),
        data: item.flows || item.data || [],
      })
    );

    return {
      type: 'flow', // Default to flow type for object format
      dataPoints,
      timeRange: {
        start: dataPoints[0]?.timestamp || '',
        end: dataPoints[dataPoints.length - 1]?.timestamp || '',
      },
      metadata: {
        fileSize: JSON.stringify(data).length,
        fileName: 'opened.json',
        parseTime: new Date().toISOString(),
        dataPointsCount: dataPoints.length,
      },
    };
  }

  /**
   * Parse timestamp format JSON
   */
  private static parseTimestampFormat(data: any): ParsedAvailabilityData {
    const dataPoints: AvailabilityDataPoint[] = data.timestamps.map(
      (timestamp: string, index: number) => ({
        timestamp,
        data: data.flows?.[index] || data.data?.[index] || [],
      })
    );

    return {
      type: 'flow', // Default to flow type for timestamp format
      dataPoints,
      timeRange: {
        start: dataPoints[0]?.timestamp || '',
        end: dataPoints[dataPoints.length - 1]?.timestamp || '',
      },
      metadata: {
        fileSize: JSON.stringify(data).length,
        fileName: 'opened.json',
        parseTime: new Date().toISOString(),
        dataPointsCount: dataPoints.length,
      },
    };
  }

  /**
   * Get data point at specific timestamp
   */
  static getDataAtTimestamp(
    data: ParsedAvailabilityData,
    timestamp: string
  ): AvailabilityDataPoint | null {
    return data.dataPoints.find(point => point.timestamp === timestamp) || null;
  }

  /**
   * Get data points within time range
   */
  static getDataInTimeRange(
    data: ParsedAvailabilityData,
    start: string,
    end: string
  ): AvailabilityDataPoint[] {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    return data.dataPoints.filter(point => {
      const pointTime = new Date(point.timestamp).getTime();
      return pointTime >= startTime && pointTime <= endTime;
    });
  }

  /**
   * Get nearest data point to a timestamp
   */
  static getNearestDataPoint(
    data: ParsedAvailabilityData,
    timestamp: string
  ): AvailabilityDataPoint | null {
    if (data.dataPoints.length === 0) return null;

    const targetTime = new Date(timestamp).getTime();
    let nearestPoint = data.dataPoints[0];
    let minDiff = Math.abs(
      new Date(nearestPoint.timestamp).getTime() - targetTime
    );

    for (const point of data.dataPoints) {
      const diff = Math.abs(new Date(point.timestamp).getTime() - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        nearestPoint = point;
      }
    }

    return nearestPoint;
  }

  /**
   * Validate parsed data
   */
  static validateData(data: ParsedAvailabilityData): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data.dataPoints || data.dataPoints.length === 0) {
      errors.push('No data points found');
    }

    if (!data.timeRange.start || !data.timeRange.end) {
      errors.push('Invalid time range');
    }

    if (data.dataPoints.length > 0) {
      // Check for missing timestamps
      const invalidPoints = data.dataPoints.filter(point => !point.timestamp);
      if (invalidPoints.length > 0) {
        errors.push(`${invalidPoints.length} data points missing timestamps`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

export default AvailabilityDataParser;
