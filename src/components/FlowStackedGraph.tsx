import React, { useMemo, useRef, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import { useFlowDataManager } from './FlowDataManager';
import type { FlowDataType } from '../types/';
import { getIpString, formatTime } from '../utils/formatters';
import { formatBandwidth as formatRate } from '../utils/formatters';
import Draggable from 'react-draggable';
import type { PerLinkFlowGraphProps } from '../types';

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

function getPortLabel(port?: number) {
  if (port === undefined) return 'N/A';
  const found = commonPorts.find(p => p.port === port);
  return found ? `${port} (${found.protocol})` : port.toString();
}

interface FlowType {
  src_ip: number;
  dst_ip: number;
  protocol_number?: number;
  protocol_id?: number;
  src_port?: number;
  dst_port?: number;
}

function FlowStackedGraph({ selectedFlows, onClose }: PerLinkFlowGraphProps) {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const dataZoomStateRef = useRef<{ start: number; end: number } | null>(null);
  const { flowDataHistory } = useFlowDataManager();
  
  const parseTimeToTimestamp = (timeStr: string | number | undefined): number => {
    if (!timeStr) return 0;
    if (typeof timeStr === 'number') return timeStr;
    
    // "2025-09-12 00:13:37"
    const [datePart, timePart] = timeStr.split(' ');
    if (datePart && timePart) {
      const [y, m, d] = datePart.split('-').map(n => parseInt(n, 10));
      const [hh, mm, ss] = timePart.split(':').map(n => parseInt(n, 10));
      if (
        !Number.isNaN(y) &&
        !Number.isNaN(m) &&
        !Number.isNaN(d) &&
        !Number.isNaN(hh) &&
        !Number.isNaN(mm) &&
        !Number.isNaN(ss)
      ) {
        return new Date(y, m - 1, d, hh, mm, ss).getTime();
      }
    }
    
    const parsed = Date.parse(timeStr);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const timePoints = useMemo(
    () =>
      flowDataHistory.map(snap => {
        const timestamps = snap.map(f => parseTimeToTimestamp(f.latest_sampled_time));
        const maxTimestamp = Math.max(...timestamps, 0);
        return maxTimestamp > 0 ? formatTime(maxTimestamp) : '';
      }),
    [flowDataHistory]
  );
  const stackedData = useMemo(() => {
    const flowSeries = selectedFlows.slice(0, COLORS.length).map(flow => {
      const data = flowDataHistory.map((snapshot: FlowDataType[]) => {
        const match = snapshot.find(
          f =>
            f.src_ip === flow.src_ip &&
            f.dst_ip === flow.dst_ip &&
            (flow.protocol_number === undefined ||
              f.protocol_id === flow.protocol_number) &&
            (flow.src_port === undefined || f.src_port === flow.src_port) &&
            (flow.dst_port === undefined || f.dst_port === flow.dst_port)
        );
        return match
          ? match.estimated_flow_sending_rate_bps_in_the_last_sec
          : 0;
      });
      return data;
    });
    const stacked: number[] = [];
    for (let i = 0; i < timePoints.length; ++i) {
      let sum = 0;
      for (let j = 0; j < flowSeries.length; ++j) {
        if (j === 0) sum += flowSeries[j][i];
        else {
          const startIdx =
            i >= timePoints.length - flowSeries[j].length
              ? i
              : timePoints.length - flowSeries[j].length;
          sum += i >= startIdx ? flowSeries[j][i] : 0;
        }
      }
      stacked.push(sum);
    }
    return stacked;
  }, [selectedFlows, flowDataHistory, timePoints]);

  const handleDataZoom = useCallback((params: any) => {
    if (params && params.start !== undefined && params.end !== undefined) {
      dataZoomStateRef.current = {
        start: params.start,
        end: params.end,
      };
    }
  }, []);

  const getFlowLabel = (flow: FlowType) => {
    const proto =
      flow.protocol_number !== undefined
        ? protocolMap[flow.protocol_number] || flow.protocol_number
        : 'Any';
    const src = getIpString(flow.src_ip);
    const dst = getIpString(flow.dst_ip);
    const sport = getPortLabel(flow.src_port);
    const dport = getPortLabel(flow.dst_port);
    return `${src}:${sport} → ${dst}:${dport} (${proto})`;
  };

  const initializeChart = useCallback(() => {
    if (!chartRef.current) return;

    const savedZoom = dataZoomStateRef.current;
    const defaultStart = savedZoom ? savedZoom.start : 0;
    const defaultEnd = savedZoom ? savedZoom.end : 100;

    const flowSeries = selectedFlows
      .slice(0, COLORS.length)
      .map((flow, idx) => {
        const data = flowDataHistory.map((snapshot: FlowDataType[]) => {
          const match = snapshot.find(
            f =>
              f.src_ip === flow.src_ip &&
              f.dst_ip === flow.dst_ip &&
              (flow.protocol_number === undefined ||
                f.protocol_id === flow.protocol_number) &&
              (flow.src_port === undefined || f.src_port === flow.src_port) &&
              (flow.dst_port === undefined || f.dst_port === flow.dst_port)
          );
          return match
            ? match.estimated_flow_sending_rate_bps_in_the_last_sec
            : 0;
        });
        return {
          name: getFlowLabel(flow),
          type: 'line',
          stack: 'total',
          data,
          smooth: true,
          lineStyle: { color: COLORS[idx], width: 2 },
          itemStyle: { color: COLORS[idx] },
          areaStyle: { color: COLORS[idx] + '55' },
          emphasis: { focus: 'series' },
          symbol: 'circle',
          symbolSize: 6,
          id: `flow-${idx}`,
        };
      });

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
      legend: { data: flowSeries.map(s => s.name), top: 2 },
      grid: {
        left: '1%',
        right: '1%',
        bottom: '15%',
        top: '25%',
        containLabel: true,
      },
      dataZoom: [
        { type: 'inside', start: defaultStart, end: defaultEnd },
        {
          show: true,
          type: 'slider',
          top: '85%',
          start: defaultStart,
          end: defaultEnd,
          handleSize: '110%',
        },
      ],
      xAxis: {
        type: 'category',
        data: timePoints,
        axisLabel: { rotate: 45, fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (v: number) => formatRate(v),
          fontSize: 10,
        },
      },
      series: flowSeries,
    };

    chartRef.current.getEchartsInstance().setOption(option);
  }, [selectedFlows, flowDataHistory, timePoints]);

  React.useEffect(() => {
    if (!chartRef.current) return;
    initializeChart();
  }, [initializeChart]);

  React.useEffect(() => {
    if (!chartRef.current || timePoints.length === 0) return;

    const echartsInstance = chartRef.current.getEchartsInstance();
    const option = echartsInstance.getOption();

    option.xAxis[0].data = timePoints;

    const flowSeries = selectedFlows
      .slice(0, COLORS.length)
      .map((flow, idx) => {
        const data = flowDataHistory.map((snapshot: FlowDataType[]) => {
          const match = snapshot.find(
            f =>
              f.src_ip === flow.src_ip &&
              f.dst_ip === flow.dst_ip &&
              (flow.protocol_number === undefined ||
                f.protocol_id === flow.protocol_number) &&
              (flow.src_port === undefined || f.src_port === flow.src_port) &&
              (flow.dst_port === undefined || f.dst_port === flow.dst_port)
          );
          return match
            ? match.estimated_flow_sending_rate_bps_in_the_last_sec
            : 0;
        });
        return data;
      });

    flowSeries.forEach((data, idx) => {
      if (option.series[idx]) {
        option.series[idx].data = data;
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
  }, [selectedFlows, flowDataHistory, timePoints]);

  return (
    // @ts-expect-error - Draggable component type issue
    <Draggable nodeRef={nodeRef} handle=".drag-handle">
      <div
        ref={nodeRef}
        className="fixed bottom-2 right-4 flex h-auto w-1/2 flex-col space-y-3 rounded-lg border-2 border-gray-300 bg-[#f0f4f8] p-4 shadow-xl"
      >
        <div className="drag-handle mb-2 flex cursor-move items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">
            {t('linkFlow.totalFlowBandwidthUsage')}
          </h2>
          <button
            onClick={onClose}
            className="text-2xl font-bold text-gray-500 hover:text-gray-700"
            title={t('common.close')}
          >
            &times;
          </button>
        </div>
        <div className="rounded-lg bg-gray-100 p-4 shadow-inner">
          <ReactECharts
            ref={chartRef}
            option={{}}
            style={{ height: 320, width: '100%' }}
            notMerge={false}
            onEvents={{ dataZoom: handleDataZoom }}
          />
        </div>
      </div>
    </Draggable>
  );
}

export default FlowStackedGraph;
