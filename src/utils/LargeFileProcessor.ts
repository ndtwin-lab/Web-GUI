import {
  TraceDataParser,
  type ParsedTraceData,
} from '../components/trace/TraceDataParser';

export interface OpenProgress {
  loaded: number;
  total: number;
  percentage: number;
  status: 'reading' | 'parsing' | 'complete' | 'error';
  message?: string;
}

export interface LargeFileProcessorOptions {
  onProgress?: (progress: OpenProgress) => void;
  chunkSize?: number; // Size of each chunk to process (default: 1MB)
  maxMemoryUsage?: number; // Maximum memory usage in MB (default: 100MB)
}

export class LargeFileProcessor {
  private options: Required<LargeFileProcessorOptions>;
  private abortController: AbortController | null = null;

  constructor(options: LargeFileProcessorOptions = {}) {
    this.options = {
      onProgress: options.onProgress || (() => {}),
      chunkSize: options.chunkSize || 1024 * 1024, // 1MB default
      maxMemoryUsage: options.maxMemoryUsage || 100, // 100MB default
    };
  }

  /**
   * Process a large file in chunks to avoid memory overflow
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

      // For very large files, use streaming approach
      if (file.size > this.options.maxMemoryUsage * 1024 * 1024) {
        return await this.processLargeFileStreaming(file, type);
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
   * Process very large files using streaming approach with optimized memory management
   */
  private async processLargeFileStreaming(
    file: File,
    type: 'flow' | 'graph'
  ): Promise<ParsedTraceData> {
    const stream = file.stream();
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let totalBytesRead = 0;
    const allDataPoints: any[] = [];
    let timeRange = { start: '', end: '' };
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
              const data = JSON.parse(line);

              // Extract timestamp for time range calculation
              const timestamp = data.timestamp || data.time;
              if (timestamp) {
                const timestampMs = parseInt(timestamp, 10);
                if (!isNaN(timestampMs)) {
                  minTimestamp = Math.min(minTimestamp, timestampMs);
                  maxTimestamp = Math.max(maxTimestamp, timestampMs);
                }
              }

              allDataPoints.push(data);
            } catch (error) {
              console.warn(
                'Skipping invalid JSON line:',
                line.substring(0, 100)
              );
            }
          }
        }

        // Check memory usage and yield control periodically
        if (allDataPoints.length % 1000 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0)); // Yield control
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          const timestamp = data.timestamp || data.time;
          if (timestamp) {
            const timestampMs = parseInt(timestamp, 10);
            if (!isNaN(timestampMs)) {
              minTimestamp = Math.min(minTimestamp, timestampMs);
              maxTimestamp = Math.max(maxTimestamp, timestampMs);
            }
          }
          allDataPoints.push(data);
        } catch (error) {
          console.warn('Skipping invalid JSON line in final buffer');
        }
      }

      // Calculate time range from timestamps
      if (minTimestamp !== Infinity && maxTimestamp !== 0) {
        timeRange = {
          start: new Date(minTimestamp).toISOString(),
          end: new Date(maxTimestamp).toISOString(),
        };
      }

      this.options.onProgress({
        loaded: file.size,
        total: file.size,
        percentage: 100,
        status: 'parsing',
        message: `Parsing ${allDataPoints.length} data points...`,
      });

      // Parse the data using TraceDataParser
      const content = allDataPoints
        .map(data => JSON.stringify(data))
        .join('\n');
      const parsedData =
        type === 'flow'
          ? TraceDataParser.parseJSONLines(content, 'flow')
          : TraceDataParser.parseJSONLines(content, 'graph');

      this.options.onProgress({
        loaded: file.size,
        total: file.size,
        percentage: 100,
        status: 'complete',
        message: `Successfully processed ${parsedData.dataPoints.length} data points`,
      });

      return parsedData;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Process a batch of data points
   */
  private async processBatch(
    dataPoints: any[],
    type: 'flow' | 'graph'
  ): Promise<void> {
    // This is where you would process the batch
    // For now, we'll just validate the data structure
    for (const data of dataPoints) {
      if (type === 'flow') {
        // Validate flow data structure
        if (!data.flow_id && !data.src_ip && !data.dst_ip) {
          console.warn('Invalid flow data structure:', data);
        }
      } else {
        // Validate graph data structure
        if (!data.nodes && !data.links) {
          console.warn('Invalid graph data structure:', data);
        }
      }
    }
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
