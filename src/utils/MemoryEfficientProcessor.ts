import {
  TraceDataParser,
  type ParsedTraceData,
  type TraceDataPoint,
} from '../components/trace/TraceDataParser';

export interface MemoryEfficientProcessorOptions {
  onProgress?: (progress: {
    loaded: number;
    total: number;
    percentage: number;
    status: 'reading' | 'parsing' | 'complete' | 'error';
    message?: string;
  }) => void;
  chunkSize?: number; // Size of each chunk to process (default: 1MB)
  maxMemoryUsage?: number; // Maximum memory usage in MB (default: 200MB)
  enableIndexing?: boolean; // Enable indexing for fast random access
}

export interface IndexedDataPoint {
  timestamp: string;
  fileOffset: number;
  dataSize: number;
}

export class MemoryEfficientProcessor {
  private options: Required<MemoryEfficientProcessorOptions>;
  private abortController: AbortController | null = null;
  private dataIndex: IndexedDataPoint[] = [];
  private fileCache: Map<string, any> = new Map();

  constructor(options: MemoryEfficientProcessorOptions = {}) {
    this.options = {
      onProgress: options.onProgress || (() => {}),
      chunkSize: options.chunkSize || 1024 * 1024, // 1MB default
      maxMemoryUsage: options.maxMemoryUsage || 200, // 200MB default
      enableIndexing: options.enableIndexing || true,
    };
  }

  /**
   * Process a large file with memory-efficient streaming and indexing
   */
  async processFile(
    file: File,
    type: 'flow' | 'graph'
  ): Promise<ParsedTraceData> {
    this.abortController = new AbortController();

    try {
      // Validate file size
      const maxFileSize = 5 * 1024 * 1024 * 1024; // 5GB limit
      if (file.size > maxFileSize) {
        throw new Error(
          `File too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB`
        );
      }

      this.options.onProgress({
        loaded: 0,
        total: file.size,
        percentage: 0,
        status: 'reading',
        message: 'Starting file processing...',
      });

      // For very large files, use streaming with indexing
      if (file.size > this.options.maxMemoryUsage * 1024 * 1024) {
        return await this.processLargeFileWithIndexing(file, type);
      } else {
        return await this.processFileInMemory(file, type);
      }
    } catch (error) {
      this.options.onProgress({
        loaded: 0,
        total: file.size,
        percentage: 0,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Process file in memory for smaller files
   */
  private async processFileInMemory(
    file: File,
    type: 'flow' | 'graph'
  ): Promise<ParsedTraceData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = e => {
        try {
          this.options.onProgress({
            loaded: file.size,
            total: file.size,
            percentage: 100,
            status: 'parsing',
            message: 'Parsing file content...',
          });

          const content = e.target?.result as string;
          if (!content || content.trim().length === 0) {
            throw new Error('File is empty or could not be read');
          }

          const parsedData =
            type === 'flow'
              ? TraceDataParser.parseJSONLines(content, 'flow')
              : TraceDataParser.parseJSONLines(content, 'graph');

          if (
            !parsedData ||
            !parsedData.dataPoints ||
            parsedData.dataPoints.length === 0
          ) {
            throw new Error(`No valid ${type} data found in file`);
          }

          this.options.onProgress({
            loaded: file.size,
            total: file.size,
            percentage: 100,
            status: 'complete',
            message: `Successfully processed ${parsedData.dataPoints.length} data points`,
          });

          resolve(parsedData);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.onabort = () => reject(new Error('File reading was aborted'));

      reader.readAsText(file);
    });
  }

  /**
   * Process very large files using streaming with indexing for fast random access
   */
  private async processLargeFileWithIndexing(
    file: File,
    type: 'flow' | 'graph'
  ): Promise<ParsedTraceData> {
    const stream = file.stream();
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let totalBytesRead = 0;
    let lineOffset = 0;
    const dataPoints: TraceDataPoint[] = [];
    let minTimestamp = Infinity;
    let maxTimestamp = 0;

    try {
      while (true) {
        if (this.abortController?.signal.aborted) {
          throw new Error('Processing was aborted');
        }

        const { done, value } = await reader.read();

        if (done) break;

        totalBytesRead += value.length;
        buffer += decoder.decode(value, { stream: true });

        // Update progress
        const percentage = Math.round((totalBytesRead / file.size) * 100);
        this.options.onProgress({
          loaded: totalBytesRead,
          total: file.size,
          percentage,
          status: 'reading',
          message: `Reading file... ${percentage}%`,
        });

        // Process complete lines from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const jsonData = JSON.parse(line);

              if (!jsonData.timestamp) {
                console.warn(`Missing timestamp field at offset ${lineOffset}`);
                lineOffset += line.length + 1;
                continue;
              }

              const timestampMs = parseInt(jsonData.timestamp, 10);
              if (isNaN(timestampMs)) {
                console.warn(
                  `Invalid timestamp format at offset ${lineOffset}: ${jsonData.timestamp}`
                );
                lineOffset += line.length + 1;
                continue;
              }

              minTimestamp = Math.min(minTimestamp, timestampMs);
              maxTimestamp = Math.max(maxTimestamp, timestampMs);

              // Convert Unix timestamp to ISO format
              const timestampIso = new Date(timestampMs).toISOString();

              let data: any;

              if (type === 'flow') {
                // Parse flow data
                if (!jsonData.flow_info || !Array.isArray(jsonData.flow_info)) {
                  console.warn(
                    `Missing or invalid flow_info field at offset ${lineOffset}`
                  );
                  lineOffset += line.length + 1;
                  continue;
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
                  estimated_flow_sending_rate_bps_in_the_last_sec:
                    flow.estimated_flow_sending_rate_bps_in_the_last_sec,
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
                    `Missing or invalid nodes field at offset ${lineOffset}`
                  );
                  lineOffset += line.length + 1;
                  continue;
                }

                const validNodes = jsonData.nodes.filter((node: any) => {
                  if (!node || typeof node !== 'object') {
                    console.warn(
                      `Invalid node object at offset ${lineOffset}:`,
                      node
                    );
                    return false;
                  }
                  if (!node.dpid) {
                    console.warn(
                      `Node missing dpid at offset ${lineOffset}:`,
                      node
                    );
                    return false;
                  }
                  return true;
                });

                const validEdges = (jsonData.edges || []).filter(
                  (edge: any) => {
                    if (!edge || typeof edge !== 'object') {
                      console.warn(
                        `Invalid edge object at offset ${lineOffset}:`,
                        edge
                      );
                      return false;
                    }
                    if (
                      (!edge.src_dpid && !edge.src) ||
                      (!edge.dst_dpid && !edge.dst)
                    ) {
                      console.warn(
                        `Edge missing src or dst at offset ${lineOffset}:`,
                        edge
                      );
                      return false;
                    }
                    return true;
                  }
                );

                data = {
                  timestamp: timestampIso,
                  nodes: validNodes,
                  edges: validEdges,
                };
              }

              // Create indexed data point
              const dataPoint: TraceDataPoint = {
                timestamp: timestampIso,
                data,
              };

              dataPoints.push(dataPoint);

              // Create index entry for fast random access
              if (this.options.enableIndexing) {
                this.dataIndex.push({
                  timestamp: timestampIso,
                  fileOffset: lineOffset,
                  dataSize: line.length,
                });
              }
            } catch (error) {
              console.warn(
                `Error parsing line at offset ${lineOffset}:`,
                error
              );
            }
          }
          lineOffset += line.length + 1;
        }

        // Yield control periodically to prevent blocking
        if (dataPoints.length % 1000 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const jsonData = JSON.parse(buffer);
          const timestampMs = parseInt(jsonData.timestamp, 10);
          if (!isNaN(timestampMs)) {
            minTimestamp = Math.min(minTimestamp, timestampMs);
            maxTimestamp = Math.max(maxTimestamp, timestampMs);
          }

          const timestampIso = new Date(timestampMs).toISOString();
          let data: any;

          if (type === 'flow') {
            data =
              jsonData.flow_info?.map((flow: any) => ({
                timestamp: timestampIso,
                src_ip: flow.src_ip,
                dst_ip: flow.dst_ip,
                src_port: flow.src_port,
                dst_port: flow.dst_port,
                protocol_id: flow.protocol_id,
                estimated_flow_sending_rate_bps_in_the_proceeding_1sec_timeslot:
                  flow.estimated_flow_sending_rate_bps_in_the_proceeding_1sec_timeslot,
                estimated_flow_sending_rate_bps_in_the_last_sec:
                  flow.estimated_flow_sending_rate_bps_in_the_last_sec,
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
              })) || [];
          } else {
            data = {
              timestamp: timestampIso,
              nodes: jsonData.nodes || [],
              edges: jsonData.edges || [],
            };
          }

          dataPoints.push({
            timestamp: timestampIso,
            data,
          });
        } catch (error) {
          console.warn('Skipping invalid JSON line in final buffer');
        }
      }

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

      this.options.onProgress({
        loaded: file.size,
        total: file.size,
        percentage: 100,
        status: 'complete',
        message: `Successfully processed ${dataPoints.length} data points`,
      });

      return {
        type,
        dataPoints,
        timeRange: {
          start: startTime,
          end: endTime,
        },
        metadata: {
          fileSize: file.size,
          fileName: file.name,
          parseTime: new Date().toISOString(),
          dataPointsCount: dataPoints.length,
        },
      };
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Get data at specific timestamp with fast random access
   */
  getDataAtTimestamp(timestamp: string): TraceDataPoint | null {
    if (!this.options.enableIndexing) {
      console.warn(
        'Indexing is not enabled. Use processFile with enableIndexing: true'
      );
      return null;
    }

    const indexEntry = this.dataIndex.find(
      entry => entry.timestamp === timestamp
    );
    if (!indexEntry) {
      return null;
    }

    // Check cache first
    if (this.fileCache.has(timestamp)) {
      return this.fileCache.get(timestamp);
    }

    // For now, return null as we need the original file to implement random access
    // This would require storing the file reference and implementing seek functionality
    return null;
  }

  /**
   * Get nearest data point to a timestamp
   */
  getNearestDataAtTimestamp(timestamp: string): TraceDataPoint | null {
    if (!this.options.enableIndexing || this.dataIndex.length === 0) {
      return null;
    }

    const targetTime = new Date(timestamp).getTime();
    let nearestEntry = this.dataIndex[0];
    let minDiff = Math.abs(
      new Date(nearestEntry.timestamp).getTime() - targetTime
    );

    for (const entry of this.dataIndex) {
      const diff = Math.abs(new Date(entry.timestamp).getTime() - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        nearestEntry = entry;
      }
    }

    return this.getDataAtTimestamp(nearestEntry.timestamp);
  }

  /**
   * Clear cache to free memory
   */
  clearCache(): void {
    this.fileCache.clear();
  }

  /**
   * Abort the current processing
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Check if file is too large for processing
   */
  static isFileTooLarge(file: File, maxSizeMB: number = 5000): boolean {
    return file.size > maxSizeMB * 1024 * 1024;
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
