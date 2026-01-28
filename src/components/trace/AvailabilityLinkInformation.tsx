import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import Draggable from 'react-draggable';
import { formatBandwidth } from '../../utils/formatters';
import { getDeviceNameFromIp } from '../../utils/utility';
import type { AvailabilityFlowData, AvailabilityGraphData } from './AvailabilityDataManager';
import LoadingSpinner from '../common/LoadingSpinner';

interface AvailabilityLinkInformationProps {
  data: { src: number; dst: number };
  flowData: AvailabilityFlowData[];
  graphData?: AvailabilityGraphData | null;
  currentTime: string;
  onClose: () => void;
  isLoading?: boolean;
  totalTimePoints?: number;
}

function AvailabilityLinkInformation({
  data: selectedLink,
  flowData,
  graphData,
  currentTime,
  onClose,
  isLoading = false,
  totalTimePoints = 0,
}: AvailabilityLinkInformationProps) {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const dataZoomStateRef = useRef<{ start: number; end: number } | null>(null);
  const [isChartReady, setIsChartReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Find the current link data from graph data
  const linkData = useMemo(() => {
    if (!selectedLink || !graphData || !graphData.nodes || !graphData.edges)
      return null;

    return graphData.edges.find(edge => {
      const srcIps = Array.isArray(edge.src_ip)
        ? edge.src_ip.filter(ip => ip !== undefined)
        : [edge.src_ip].filter(ip => ip !== undefined);
      const dstIps = Array.isArray(edge.dst_ip)
        ? edge.dst_ip.filter(ip => ip !== undefined)
        : [edge.dst_ip].filter(ip => ip !== undefined);

      // Helper function to check if a node ID matches an edge endpoint
      const matchesNode = (
        nodeId: string | number,
        dpid: number,
        ips: number[]
      ) => {
        // Check if nodeId matches dpid
        if (String(dpid) === String(nodeId)) return true;

        // Check if nodeId matches any IP
        if (ips.includes(Number(nodeId))) return true;

        // Check if nodeId is a host name (non-numeric string)
        if (typeof nodeId === 'string' && isNaN(Number(nodeId))) {
          const hostNode = graphData.nodes.find(
            n =>
              n.vertex_type === 1 &&
              n.device_name === nodeId &&
              Array.isArray(n.ip) &&
              n.ip.some(ip => ips.includes(ip))
          );
          return !!hostNode;
        }

        return false;
      };

      return (
        (matchesNode(
          selectedLink.src || '',
          Number(edge.src_dpid) || 0,
          srcIps
        ) &&
          matchesNode(
            selectedLink.dst || '',
            Number(edge.dst_dpid) || 0,
            dstIps
          )) ||
        (matchesNode(
          selectedLink.dst || '',
          Number(edge.src_dpid) || 0,
          srcIps
        ) &&
          matchesNode(
            selectedLink.src || '',
            Number(edge.dst_dpid) || 0,
            dstIps
          ))
      );
    });
  }, [selectedLink, graphData]);

  const srcDeviceName = useMemo(() => {
    if (!linkData || !graphData) return 'Unknown Device';

    if (typeof selectedLink?.src === 'string') {
      if (isNaN(Number(selectedLink.src))) {
        return selectedLink.src;
      }
    }

    if (
      typeof selectedLink?.src === 'number' ||
      (typeof selectedLink?.src === 'string' &&
        !isNaN(Number(selectedLink.src)))
    ) {
      const switchNode = graphData.nodes.find(
        n => n.vertex_type === 0 && String(n.dpid) === String(selectedLink.src)
      );
      if (switchNode) {
        return switchNode.device_name;
      }
    }

    return getDeviceNameFromIp(
      Array.isArray(linkData.src_ip)
        ? linkData.src_ip[0] || 0
        : linkData.src_ip || 0,
      graphData.nodes
    );
  }, [linkData, graphData, selectedLink]);

  const dstDeviceName = useMemo(() => {
    if (!linkData || !graphData) return 'Unknown Device';

    if (typeof selectedLink?.dst === 'string') {
      if (isNaN(Number(selectedLink.dst))) {
        return selectedLink.dst;
      }
    }

    if (
      typeof selectedLink?.dst === 'number' ||
      (typeof selectedLink?.dst === 'string' &&
        !isNaN(Number(selectedLink.dst)))
    ) {
      const switchNode = graphData.nodes.find(
        n => n.vertex_type === 0 && String(n.dpid) === String(selectedLink.dst)
      );
      if (switchNode) {
        return switchNode.device_name;
      }
    }

    return getDeviceNameFromIp(
      Array.isArray(linkData.dst_ip)
        ? linkData.dst_ip[0] || 0
        : linkData.dst_ip || 0,
      graphData.nodes
    );
  }, [linkData, graphData, selectedLink]);

  // Calculate bandwidth history from start to current time
  const bandwidthHistoryData = useMemo(() => {
    if (!selectedLink || !flowData || flowData.length === 0) return [];

    const currentTimeMs = new Date(currentTime).getTime();
    const history: { time: string; in: number; out: number }[] = [];

    // Group flow data by timestamp and filter up to current time
    const flowDataByTime = new Map<string, AvailabilityFlowData[]>();
    flowData.forEach(flow => {
      const flowTimeMs = new Date(flow.timestamp).getTime();
      if (flowTimeMs <= currentTimeMs) {
        const timeKey = flow.timestamp;
        if (!flowDataByTime.has(timeKey)) {
          flowDataByTime.set(timeKey, []);
        }
        flowDataByTime.get(timeKey)!.push(flow);
      }
    });

    // Calculate bandwidth for each time point
    flowDataByTime.forEach((flows, timeKey) => {
      let inBandwidth = 0;
      let outBandwidth = 0;

      flows.forEach(flow => {
        // Check if this flow uses the selected link
        const usesLink = flow.path.some((pathNode, index) => {
          if (index === flow.path.length - 1) return false;
          const current = String(pathNode.node);
          const next = String(flow.path[index + 1].node);

          // Check if this path segment matches our link
          return (
            (current === String(selectedLink.src) &&
              next === String(selectedLink.dst)) ||
            (current === String(selectedLink.dst) &&
              next === String(selectedLink.src))
          );
        });

        if (usesLink) {
          const bandwidth =
            parseInt(
              flow.estimated_flow_sending_rate_bps_in_the_proceeding_1sec_timeslot
            ) || 0;

          // Determine direction based on flow source/destination
          if (String(flow.src_ip) === String(selectedLink.src)) {
            outBandwidth += bandwidth;
          } else {
            inBandwidth += bandwidth;
          }
        }
      });

      const time = new Date(timeKey);
      history.push({
        time: time.toLocaleTimeString([], {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        out: outBandwidth,
        in: inBandwidth,
      });
    });

    return history.sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
  }, [selectedLink, flowData, currentTime]);

  const handleDataZoom = useCallback((params: any) => {
    if (params && params.start !== undefined && params.end !== undefined) {
      dataZoomStateRef.current = {
        start: params.start,
        end: params.end,
      };
    }
  }, []);

  const initializeChart = useCallback(() => {
    if (!linkData || !chartRef.current || bandwidthHistoryData.length === 0)
      return;

    const timeData = bandwidthHistoryData.map(item => item.time);
    const outData = bandwidthHistoryData.map(item => item.out);
    const inData = bandwidthHistoryData.map(item => item.in);

    const savedZoom = dataZoomStateRef.current;
    const defaultStart = savedZoom ? savedZoom.start : 0;
    const defaultEnd = savedZoom ? savedZoom.end : 100;

    const option = {
      tooltip: {
        trigger: 'axis',
        formatter: function (params: any) {
          let result = params[0].axisValue + '<br/>';
          params.forEach((param: any) => {
            result +=
              param.marker +
              param.seriesName +
              ': ' +
              formatBandwidth(param.value) +
              '<br/>';
          });
          return result;
        },
      },
      legend: {
        textStyle: {
          fontSize: 14,
        },
        data: [
          `${dstDeviceName} → ${srcDeviceName}`,
          `${srcDeviceName} → ${dstDeviceName}`,
        ],
        top: 2,
      },
      grid: {
        left: '1%',
        right: '1%',
        bottom: '15%',
        top: '25%',
        containLabel: true,
      },
      toolbox: {
        itemSize: 15,
        feature: {
          dataZoom: {
            yAxisIndex: 'none',
          },
          saveAsImage: {},
        },
        top: '10%',
        right: '1%',
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
        boundaryGap: false,
        data: timeData,
        axisLabel: {
          rotate: 45,
          fontSize: 10,
          interval: 'auto',
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
          formatter: function (value: number) {
            return formatBandwidth(value).replace(' ', '');
          },
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
      series: [
        {
          name: `${dstDeviceName} → ${srcDeviceName}`,
          type: 'line',
          data: inData,
          smooth: true,
          lineStyle: {
            color: '#3182ce',
            width: 2,
          },
          itemStyle: {
            color: '#3182ce',
          },
          symbol: 'circle',
          symbolSize: 4,
          connectNulls: true,
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(49, 130, 206, 0.3)' },
                { offset: 1, color: 'rgba(49, 130, 206, 0.1)' },
              ],
            },
          },
        },
        {
          name: `${srcDeviceName} → ${dstDeviceName}`,
          type: 'line',
          data: outData,
          smooth: true,
          lineStyle: {
            color: '#e53e3e',
            width: 2,
          },
          itemStyle: {
            color: '#e53e3e',
          },
          symbol: 'circle',
          symbolSize: 4,
          connectNulls: true,
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(229, 62, 62, 0.3)' },
                { offset: 1, color: 'rgba(229, 62, 62, 0.1)' },
              ],
            },
          },
        },
      ],
      animation: true,
      animationDuration: 1000,
      animationEasing: 'cubicOut',
    };

    chartRef.current.getEchartsInstance().setOption(option, true);
    setIsChartReady(true);
  }, [linkData, bandwidthHistoryData.length, srcDeviceName, dstDeviceName]);

  useEffect(() => {
    if (linkData && bandwidthHistoryData.length > 0) {
      initializeChart();
    }
  }, [initializeChart, linkData, bandwidthHistoryData.length]);

  useEffect(() => {
    if (bandwidthHistoryData.length === 0 && !isLoading) {
      setError('No link data available');
    } else {
      setError(null);
    }
  }, [bandwidthHistoryData, isLoading]);

  useEffect(() => {
    if (!chartRef.current || bandwidthHistoryData.length === 0) return;

    const echartsInstance = chartRef.current.getEchartsInstance();
    const option = echartsInstance.getOption();

    const timeData = bandwidthHistoryData.map(item => item.time);
    const outData = bandwidthHistoryData.map(item => item.out);
    const inData = bandwidthHistoryData.map(item => item.in);

    option.xAxis[0].data = timeData;
    option.series[0].data = inData;
    option.series[1].data = outData;

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
  }, [bandwidthHistoryData]);

  // Show loading state
  if (isLoading) {
    return (
      // @ts-expect-error - Draggable component type issue
      <Draggable nodeRef={nodeRef} handle=".drag-handle">
        <div
          ref={nodeRef}
          className="fixed bottom-2 right-4 flex h-auto w-1/2 flex-col space-y-3 rounded-lg border-2 border-gray-300 bg-[#f0f4f8] p-4 shadow-xl"
        >
          <div className="drag-handle flex cursor-move items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800">
                {t('link.title')} - Availability status
              </h2>
              <p className="text-sm text-gray-600">
                {srcDeviceName} ⭤ {dstDeviceName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-2xl font-bold text-gray-500 transition-colors hover:text-gray-700"
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

  if (error) {
    return (
      <div className="fixed bottom-2 right-4 flex h-auto w-1/2 flex-col space-y-3 rounded-lg border-2 border-gray-300 bg-[#f0f4f8] p-4 shadow-xl">
        <h2 className="text-xl font-bold text-gray-800">{t('link.title')}</h2>
        <p className="text-gray-500">
          {t('link.errorOccurred')}: {error}
        </p>
      </div>
    );
  }

  if (!linkData) {
    return (
      <div className="fixed bottom-2 right-4 flex h-auto w-1/2 flex-col space-y-3 rounded-lg border-2 border-gray-300 bg-[#f0f4f8] p-4 shadow-xl">
        <h2 className="text-xl font-bold text-gray-800">{t('link.title')}</h2>
        <p className="text-gray-500">{t('link.loading')}</p>
      </div>
    );
  }

  const linkSpeed = linkData.link_bandwidth_bps
    ? formatBandwidth(Number(linkData.link_bandwidth_bps))
    : 'N/A';
  const linkStatus = linkData.is_up ? 'Up' : 'Down';

  const latestBandwidth = bandwidthHistoryData[
    bandwidthHistoryData.length - 1
  ] || { in: 0, out: 0 };

  return (
    // @ts-expect-error - Draggable component type issue
    <Draggable nodeRef={nodeRef} handle=".drag-handle">
      <div
        ref={nodeRef}
        className="fixed bottom-2 right-4 flex h-auto w-1/2 flex-col space-y-3 rounded-lg border-2 border-gray-300 bg-[#f0f4f8] p-4 shadow-xl"
      >
        <div className="drag-handle flex cursor-move items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {t('link.title')} - Availability status
            </h2>
            <p className="text-sm text-gray-600">
              {srcDeviceName} ⭤ {dstDeviceName}
            </p>
            <p className="text-xs text-gray-500">
              Time: {new Date(currentTime).toLocaleString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-2xl font-bold text-gray-500 transition-colors hover:text-gray-700"
            title={t('common.close')}
          >
            &times;
          </button>
        </div>

        <div className="rounded-lg bg-gray-100 p-4 shadow-inner">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-lg font-semibold">
              <span className="text-blue-500">
                {dstDeviceName} → {srcDeviceName}:{' '}
                {formatBandwidth(latestBandwidth.in)}
              </span>
              <span className="mx-1 text-gray-400"> / </span>
              <span className="text-red-500">
                {srcDeviceName} → {dstDeviceName}:{' '}
                {formatBandwidth(latestBandwidth.out)}
              </span>
            </span>
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ReactECharts
              ref={chartRef}
              option={{}}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
              onEvents={{ dataZoom: handleDataZoom }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 text-sm text-gray-700">
          <div className="flex justify-between border-t pt-2">
            <span className="font-medium">{t('link.linkSpeed')}</span>
            <span className="font-semibold">{linkSpeed}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="font-medium">{t('link.linkStatus')}</span>
            <span
              className={`font-semibold ${linkStatus === t('link.up') ? 'text-green-600' : 'text-red-600'}`}
            >
              {linkStatus}
            </span>
          </div>
        </div>
      </div>
    </Draggable>
  );
}

export default memo(AvailabilityLinkInformation);
