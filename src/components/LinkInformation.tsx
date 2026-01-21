import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import { useGraphData } from './GraphDataManager';
import Draggable from 'react-draggable';
import { formatBandwidth } from '../utils/formatters';
import { getDeviceNameFromIp } from '../utils/utility';
import type { GraphDataType, LinkProps } from '../types';

function LinkInformation({ data: selectedLink, onClose }: LinkProps) {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const dataZoomStateRef = useRef<{ start: number; end: number } | null>(null);
  const currentBwRef = useRef({ in: 0, out: 0 });
  const [currentBwDisplay, setCurrentBwDisplay] = useState({ in: 0, out: 0 });
  const [error, setError] = useState<string | null>(null);

  const { graphData }: { graphData: GraphDataType[]; lastUpdated: any } =
    useGraphData();

  const linkData = useMemo(() => {
    if (!selectedLink || !graphData || graphData.length === 0) return null;
    const latestData = graphData[graphData.length - 1];
    return latestData.edges.find(edge => {
      const srcIps = Array.isArray(edge.src_ip) ? edge.src_ip : [edge.src_ip];
      const dstIps = Array.isArray(edge.dst_ip) ? edge.dst_ip : [edge.dst_ip];

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
          const hostNode = latestData.nodes.find(
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
        (matchesNode(selectedLink.src, edge.src_dpid, srcIps) &&
          matchesNode(selectedLink.dst, edge.dst_dpid, dstIps)) ||
        (matchesNode(selectedLink.dst, edge.src_dpid, srcIps) &&
          matchesNode(selectedLink.src, edge.dst_dpid, dstIps))
      );
    });
  }, [selectedLink, graphData]);
  const latestData = useMemo(() => {
    return graphData && graphData.length > 0
      ? graphData[graphData.length - 1]
      : null;
  }, [graphData]);

  const srcDeviceName = useMemo(() => {
    if (!linkData || !latestData) return 'Unknown Device';

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
      const switchNode = latestData.nodes.find(
        n => n.vertex_type === 0 && String(n.dpid) === String(selectedLink.src)
      );
      if (switchNode) {
        return switchNode.device_name;
      }
    }

    return getDeviceNameFromIp(
      Array.isArray(linkData.src_ip) ? linkData.src_ip[0] : linkData.src_ip,
      latestData.nodes
    );
  }, [linkData, latestData, selectedLink]);

  const dstDeviceName = useMemo(() => {
    if (!linkData || !latestData) return 'Unknown Device';

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
      const switchNode = latestData.nodes.find(
        n => n.vertex_type === 0 && String(n.dpid) === String(selectedLink.dst)
      );
      if (switchNode) {
        return switchNode.device_name;
      }
    }

    return getDeviceNameFromIp(
      Array.isArray(linkData.dst_ip) ? linkData.dst_ip[0] : linkData.dst_ip,
      latestData.nodes
    );
  }, [linkData, latestData, selectedLink]);

  const linkId = useMemo(
    () =>
      linkData
        ? `${linkData.src_dpid || linkData.src_ip}-${linkData.dst_dpid || linkData.dst_ip}`
        : null,
    [linkData]
  );

  const bandwidthHistoryData = useMemo(() => {
    if (!selectedLink || !graphData || graphData.length === 0) return [];

    const history: { time: string; in: number; out: number }[] = [];

    graphData.forEach(timePoint => {
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
          const hostNode = timePoint.nodes.find(
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

      const outEdge = timePoint.edges.find(edge => {
        const srcIps = Array.isArray(edge.src_ip) ? edge.src_ip : [edge.src_ip];
        const dstIps = Array.isArray(edge.dst_ip) ? edge.dst_ip : [edge.dst_ip];

        return (
          matchesNode(selectedLink.src, edge.src_dpid, srcIps) &&
          matchesNode(selectedLink.dst, edge.dst_dpid, dstIps)
        );
      });

      const inEdge = timePoint.edges.find(edge => {
        const srcIps = Array.isArray(edge.src_ip) ? edge.src_ip : [edge.src_ip];
        const dstIps = Array.isArray(edge.dst_ip) ? edge.dst_ip : [edge.dst_ip];

        return (
          matchesNode(selectedLink.dst, edge.src_dpid, srcIps) &&
          matchesNode(selectedLink.src, edge.dst_dpid, dstIps)
        );
      });

      if (outEdge || inEdge) {
        const time = timePoint.timestamp
          ? new Date(timePoint.timestamp)
          : new Date();
        history.push({
          time: time.toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          out: outEdge ? outEdge.link_bandwidth_usage_bps || 0 : 0,
          in: inEdge ? inEdge.link_bandwidth_usage_bps || 0 : 0,
        });
      }
    });

    return history;
  }, [selectedLink, graphData]);

  const handleDataZoom = useCallback((params: any) => {
    if (params && params.start !== undefined && params.end !== undefined) {
      dataZoomStateRef.current = {
        start: params.start,
        end: params.end,
      };
    }
  }, []);

  const initializeChart = useCallback(() => {
    if (!linkData || !linkId || !chartRef.current) return;

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
        },
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
        boundaryGap: false,
        data: timeData,
        axisLabel: {
          rotate: 45,
          fontSize: 10,
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
      },
      series: [
        {
          name: `${dstDeviceName} → ${srcDeviceName}`,
          type: 'line',
          data: inData,
          smooth: true,
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
    };

    chartRef.current.getEchartsInstance().setOption(option);
  }, [linkId, linkData, bandwidthHistoryData, srcDeviceName, dstDeviceName]);

  useEffect(() => {
    if (!linkData || !linkId) {
      return;
    }

    initializeChart();
  }, [linkData, linkId, initializeChart]);

  useEffect(() => {
    if (graphData.length === 0) {
      setError('No link data available');
    } else {
      setError(null);
    }
  }, [graphData]);

  useEffect(() => {
    if (
      !linkData ||
      !linkId ||
      !chartRef.current ||
      bandwidthHistoryData.length === 0
    )
      return;

    const timeData = bandwidthHistoryData.map(item => item.time);
    const outData = bandwidthHistoryData.map(item => item.out);
    const inData = bandwidthHistoryData.map(item => item.in);

    const option = chartRef.current.getEchartsInstance().getOption();
    option.xAxis[0].data = timeData;
    option.series[0].data = inData;
    option.series[1].data = outData;

    if (dataZoomStateRef.current) {
      option.dataZoom[0].start = dataZoomStateRef.current.start;
      option.dataZoom[0].end = dataZoomStateRef.current.end;
      option.dataZoom[1].start = dataZoomStateRef.current.start;
      option.dataZoom[1].end = dataZoomStateRef.current.end;
    }

    chartRef.current.getEchartsInstance().setOption(option, {
      notMerge: false,
      lazyUpdate: true,
    });

    const latest = bandwidthHistoryData[bandwidthHistoryData.length - 1];
    currentBwRef.current = { in: latest.in, out: latest.out };
    setCurrentBwDisplay({ in: latest.in, out: latest.out });
  }, [bandwidthHistoryData, linkId]);

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
    ? formatBandwidth(linkData.link_bandwidth_bps)
    : 'N/A';
  const linkStatus = linkData.is_up ? 'Up' : 'Down';

  return (
    // @ts-expect-error - Draggable component type issue
    <Draggable nodeRef={nodeRef} handle=".drag-handle">
      <div
        ref={nodeRef}
        className="fixed bottom-2 right-4 flex  h-auto w-1/2 flex-col space-y-3 rounded-lg border-2 border-gray-300 bg-[#f0f4f8] p-4 shadow-xl"
      >
        <div className="drag-handle flex cursor-move items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {t('link.title')}
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

        <div className="rounded-lg bg-gray-100 p-4 shadow-inner">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-lg font-semibold">
              <span className="text-blue-500">
                {dstDeviceName} → {srcDeviceName}:{' '}
                {formatBandwidth(currentBwDisplay.in)}
              </span>
              <span className="mx-1 text-gray-400"> / </span>
              <span className="text-red-500">
                {srcDeviceName} → {dstDeviceName}:{' '}
                {formatBandwidth(currentBwDisplay.out)}
              </span>
            </span>
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ReactECharts
              ref={chartRef}
              option={{}}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
              onEvents={{
                dataZoom: handleDataZoom,
              }}
            />
          </div>
        </div>

        <div className="drag-handle grid grid-cols-2 gap-x-6 text-sm text-gray-700">
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

export default LinkInformation;
