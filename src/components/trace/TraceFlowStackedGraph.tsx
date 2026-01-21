import React, {
  useMemo,
  useRef,
  useCallback,
  useState,
  useEffect,
  memo,
} from 'react';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import type { TraceFlowData } from './TraceDataParser';
import { getIpString } from '../../utils/formatters';
import { formatBandwidth as formatRate } from '../../utils/formatters';
import Draggable from 'react-draggable';
import LoadingSpinner from '../common/LoadingSpinner';

const COLORS = ['#e53e3e', '#38a169', '#3182ce', '#ecc94b', '#9f7aea'];
const protocolMap: Record<number, string> = { 6: 'TCP', 17: 'UDP', 1: 'ICMP' };
const commonPorts = [
  { port: 20, protocol: 'FTP-DATA' },
  { port: 21, protocol: 'FTP' },
  { port: 22, protocol: 'SSH' },
  { port: 23, protocol: 'TELNET' },
  { port: 25, protocol: 'SMTP' },
  { port: 53, protocol: 'DNS' },
  { port: 80, protocol: 'HTTP' },
  { port: 110, protocol: 'POP3' },
  { port: 123, protocol: 'NTP' },
  { port: 143, protocol: 'IMAP' },
  { port: 161, protocol: 'SNMP' },
  { port: 443, protocol: 'HTTPS' },
  { port: 3306, protocol: 'MYSQL' },
  { port: 3389, protocol: 'RDP' },
  { port: 5432, protocol: 'POSTGRESQL' },
  { port: 6379, protocol: 'REDIS' },
  { port: 8080, protocol: 'HTTP-ALT' },
  { port: 8443, protocol: 'HTTPS-ALT' },
];

interface FlowType {
  src_ip: number;
  dst_ip: number;
  protocol_number?: number;
  protocol_id?: number;
  src_port?: number;
  dst_port?: number;
}

interface TraceFlowStackedGraphProps {
  selectedFlows: FlowType[];
  flowData: TraceFlowData[];
  currentTime: string;
  onClose: () => void;
  isLoading?: boolean;
  totalTimePoints?: number;
}

function getPortLabel(port?: number) {
  if (port === undefined) return 'N/A';
  const found = commonPorts.find(p => p.port === port);
  return found ? `${port} (${found.protocol})` : port.toString();
}

function TraceFlowStackedGraph({
  selectedFlows,
  flowData,
  currentTime,
  onClose,
  isLoading = false,
  totalTimePoints = 0,
}: TraceFlowStackedGraphProps) {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const dataZoomStateRef = useRef<{ start: number; end: number } | null>(null);
  const [isChartReady, setIsChartReady] = useState(false);

  // Process data from start to current time
  const processedData = useMemo(() => {
    if (!flowData || flowData.length === 0) {
      return { timePoints: [], flowDataByTime: new Map(), series: [] };
    }

    // Filter data up to current time
    const currentTimeMs = new Date(currentTime).getTime();
    const filteredFlowData = flowData.filter(flow => {
      const flowTimeMs = new Date(flow.timestamp).getTime();
      return flowTimeMs <= currentTimeMs;
    });

    // Group flow data by timestamp
    const flowDataByTime = new Map<string, TraceFlowData[]>();
    const timeSet = new Set<string>();

    filteredFlowData.forEach(flow => {
      const timestamp = flow.timestamp;
      timeSet.add(timestamp);

      if (!flowDataByTime.has(timestamp)) {
        flowDataByTime.set(timestamp, []);
      }
      flowDataByTime.get(timestamp)!.push(flow);
    });

    // Create sorted time points
    const timePoints = Array.from(timeSet)
      .sort()
      .map(timestamp => {
        const time = new Date(timestamp);
        return time.toLocaleTimeString([], {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      });

    // Create series data for each selected flow
    const series = selectedFlows.slice(0, COLORS.length).map((flow, idx) => {
      const data = timePoints.map(timePoint => {
        // Find the corresponding timestamp for this time point
        const timestamp = Array.from(flowDataByTime.keys()).find(ts => {
          const time = new Date(ts);
          const formattedTime = time.toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          return formattedTime === timePoint;
        });

        if (!timestamp) return 0;

        const flowsAtTime = flowDataByTime.get(timestamp) || [];
        const match = flowsAtTime.find(
          f =>
            f.src_ip === flow.src_ip &&
            f.dst_ip === flow.dst_ip &&
            (flow.protocol_number === undefined ||
              f.protocol_id === flow.protocol_number) &&
            (flow.src_port === undefined || f.src_port === flow.src_port) &&
            (flow.dst_port === undefined || f.dst_port === flow.dst_port)
        );
        return match
          ? parseInt(
              match.estimated_flow_sending_rate_bps_in_the_proceeding_1sec_timeslot
            ) || 0
          : 0;
      });

      const proto =
        flow.protocol_number !== undefined
          ? protocolMap[flow.protocol_number] || flow.protocol_number
          : 'Any';
      const src = getIpString(flow.src_ip);
      const dst = getIpString(flow.dst_ip);
      const sport = getPortLabel(flow.src_port);
      const dport = getPortLabel(flow.dst_port);
      const name = `${src}:${sport} → ${dst}:${dport} (${proto})`;

      return {
        name,
        type: 'line',
        stack: 'total',
        data,
        smooth: true,
        lineStyle: { color: COLORS[idx], width: 2 },
        itemStyle: { color: COLORS[idx] },
        areaStyle: { color: COLORS[idx] + '55' },
        emphasis: { focus: 'series' },
        symbol: 'circle',
        symbolSize: 4,
        id: `flow-${idx}`,
      };
    });

    return { timePoints, flowDataByTime, series };
  }, [selectedFlows, flowData, currentTime]);

  const handleDataZoom = useCallback((params: any) => {
    if (params && params.start !== undefined && params.end !== undefined) {
      dataZoomStateRef.current = {
        start: params.start,
        end: params.end,
      };
    }
  }, []);

  const initializeChart = useCallback(() => {
    if (!chartRef.current || !processedData.timePoints.length) return;

    const savedZoom = dataZoomStateRef.current;
    const defaultStart = savedZoom ? savedZoom.start : 0;
    const defaultEnd = savedZoom ? savedZoom.end : 100;

    const option = {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          let s = `<b>${params[0].axisValue}</b><br/>`;
          params.forEach((p: any) => {
            s += `<span style='color:${p.color}'>●</span> <b>${p.seriesName}</b>: ${formatRate(p.value)}<br/>`;
          });
          return s;
        },
      },
      legend: {
        data: processedData.series.map(s => s.name),
        top: 2,
        type: 'scroll',
        pageButtonItemGap: 5,
        pageButtonGap: 10,
        pageIconSize: 12,
        pageIconColor: '#2f4554',
        pageIconInactiveColor: '#aaa',
        pageTextStyle: {
          color: '#333',
        },
      },
      grid: {
        left: '1%',
        right: '1%',
        bottom: '15%',
        top: '25%',
        containLabel: true,
      },
      dataZoom: [
        {
          type: 'inside',
          start: defaultStart,
          end: defaultEnd,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
        },
        {
          show: true,
          type: 'slider',
          top: '85%',
          start: defaultStart,
          end: defaultEnd,
          handleSize: '110%',
          showDetail: true,
          showDataShadow: true,
          realtime: true,
          filterMode: 'filter',
        },
      ],
      xAxis: {
        type: 'category',
        data: processedData.timePoints,
        axisLabel: {
          rotate: 45,
          fontSize: 10,
          interval: 'auto',
          formatter: (value: string) => {
            // Show fewer labels for better readability
            return value;
          },
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: '#f0f0f0',
            type: 'dashed',
          },
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (v: number) => formatRate(v),
          fontSize: 10,
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: '#f0f0f0',
            type: 'dashed',
          },
        },
      },
      series: processedData.series,
      animation: true,
      animationDuration: 1000,
      animationEasing: 'cubicOut',
    };

    chartRef.current.getEchartsInstance().setOption(option, true);
    setIsChartReady(true);
  }, [processedData.timePoints, processedData.series]); // Only depend on the actual data, not the entire processedData object

  useEffect(() => {
    if (processedData.timePoints.length > 0) {
      initializeChart();
    }
  }, [initializeChart, processedData.timePoints.length]);

  useEffect(() => {
    if (!chartRef.current || processedData.timePoints.length === 0) return;

    const echartsInstance = chartRef.current.getEchartsInstance();
    const option = echartsInstance.getOption();

    option.xAxis[0].data = processedData.timePoints;

    processedData.series.forEach((s, idx) => {
      if (option.series[idx]) {
        option.series[idx].data = s.data;
      }
    });

    if (dataZoomStateRef.current) {
      option.dataZoom[0].start = dataZoomStateRef.current.start;
      option.dataZoom[0].end = dataZoomStateRef.current.end;
      option.dataZoom[1].start = dataZoomStateRef.current.start;
      option.dataZoom[1].end = dataZoomStateRef.current.end;
    }

    echartsInstance.setOption(option, {
      notMerge: false,
      lazyUpdate: true,
    });
  }, [processedData.timePoints, processedData.series]);

  // Show loading state
  if (isLoading) {
    return (
      // @ts-expect-error - Draggable component type issue
      <Draggable nodeRef={nodeRef} handle=".drag-handle">
        <div
          ref={nodeRef}
          className="fixed bottom-2 right-4 flex h-auto w-1/2 flex-col space-y-3 rounded-lg border-2 border-gray-300 bg-[#f0f4f8] p-4 shadow-xl"
        >
          <div className="drag-handle mb-2 flex cursor-move items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">
              {t('linkFlow.totalFlowBandwidthUsage')} - Availability status
            </h2>
            <button
              onClick={onClose}
              className="text-2xl font-bold text-gray-500 hover:text-gray-700"
              title={t('common.close')}
            >
              &times;
            </button>
          </div>
          <div className="flex h-80 items-center justify-center">
            <div className="text-center">
              <LoadingSpinner size="large" />
              <p className="mt-4 text-sm text-gray-600">
                Loading {totalTimePoints} time points...
              </p>
            </div>
          </div>
        </div>
      </Draggable>
    );
  }

  return (
    // @ts-expect-error - Draggable component type issue
    <Draggable nodeRef={nodeRef} handle=".drag-handle">
      <div
        ref={nodeRef}
        className="fixed bottom-2 right-4 flex h-auto w-1/2 flex-col space-y-3 rounded-lg border-2 border-gray-300 bg-[#f0f4f8] p-4 shadow-xl"
      >
        <div className="drag-handle mb-2 flex cursor-move items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">
            {t('linkFlow.totalFlowBandwidthUsage')} - Availability status
          </h2>
          <button
            onClick={onClose}
            className="text-2xl font-bold text-gray-500 hover:text-gray-700"
            title={t('common.close')}
          >
            &times;
          </button>
        </div>

        {!isChartReady && processedData.timePoints.length === 0 ? (
          <div className="flex h-80 items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-gray-600">No data available</p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-gray-100 p-4 shadow-inner">
            <div className="mb-2 text-sm text-gray-600">
              Showing {processedData.timePoints.length} time points
            </div>
            <ReactECharts
              ref={chartRef}
              option={{}}
              style={{ height: 320, width: '100%' }}
              notMerge={false}
              opts={{ renderer: 'canvas' }}
              onEvents={{ dataZoom: handleDataZoom }}
            />
          </div>
        )}
      </div>
    </Draggable>
  );
}

export default memo(TraceFlowStackedGraph);
