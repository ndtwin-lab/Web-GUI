import React, {
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
} from 'react';
import Draggable from 'react-draggable';
import { useTranslation } from 'react-i18next';
import { getIpString } from '../../utils/formatters';
import { getDeviceNameFromIp } from '../../utils/utility';
import { FaChartLine, FaLayerGroup, FaChartArea } from 'react-icons/fa';
import type { TraceFlowData, TraceGraphData } from './TraceDataManager';

interface TraceLinkFlowInformationProps {
  data: {
    src: number | string;
    dst: number | string;
    direction?: 'src2dst' | 'dst2src';
  } | null;
  flowData: TraceFlowData[];
  graphData?: TraceGraphData | null;
  currentTime: string;
  onClose: () => void;
  onAddPanel?: (
    type:
      | 'traceLinkInfo'
      | 'traceLinkInfoAll'
      | 'tracePerLinkFlow'
      | 'traceFlowStacked',
    data: any
  ) => void;
  onUpdatePanelData?: (
    type: 'tracePerLinkFlow' | 'traceFlowStacked',
    data: any
  ) => void;
  onClearHighlight?: () => void;
}

type SortField = 'start_time' | 'end_time' | 'sending_rate' | null;
type SortDirection = 'asc' | 'desc';

const protocolMap: Record<number, string> = {
  6: 'TCP',
  17: 'UDP',
  1: 'ICMP',
};

function formatRate(bps: number) {
  let value: string;
  let unit: string;

  if (bps >= 1_000_000_000) {
    value = (bps / 1_000_000_000).toFixed(2);
    unit = 'Gbps';
  } else if (bps >= 1_000_000) {
    value = (bps / 1_000_000).toFixed(2);
    unit = 'Mbps';
  } else if (bps >= 1_000) {
    value = (bps / 1_000).toFixed(2);
    unit = 'Kbps';
  } else {
    value = bps.toString();
    unit = 'bps';
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>
      <span style={{ minWidth: '6ch', textAlign: 'left' }}>{value}</span>
      <span style={{ marginLeft: '0.5ch', minWidth: '4ch', textAlign: 'left' }}>
        {unit}
      </span>
    </span>
  );
}

const COLORS = ['#e53e3e', '#38a169', '#3182ce', '#ecc94b', '#9f7aea'];

const TraceLinkFlowInformation: React.FC<TraceLinkFlowInformationProps> = ({
  data: selectedLink,
  flowData,
  graphData,
  currentTime,
  onClose,
  onAddPanel,
  onUpdatePanelData,
  onClearHighlight,
}) => {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [selectedFlows, setSelectedFlows] = useState<any[]>([]);
  // Initialize direction from selectedLink, default to 'both' if not specified
  const [direction, setDirection] = useState<'both' | 'src2dst' | 'dst2src'>(
    selectedLink?.direction || 'both'
  );

  // Update direction when selectedLink changes
  useEffect(() => {
    if (selectedLink) {
      // If direction is specified, use it; otherwise default to 'both'
      setDirection(selectedLink.direction || 'both');
      // Clear selected flows when link changes
      setSelectedFlows([]);
    }
  }, [selectedLink]);

  // Find the current link data from graph data
  const linkData = useMemo(() => {
    if (!selectedLink || !graphData || !graphData.nodes || !graphData.edges)
      return null;

    return graphData.edges.filter(edge => {
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
    if (!linkData || linkData.length === 0 || !graphData)
      return 'Unknown Device';

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
      Array.isArray(linkData[0].src_ip)
        ? linkData[0].src_ip[0] || 0
        : linkData[0].src_ip || 0,
      graphData.nodes
    );
  }, [linkData, graphData, selectedLink]);

  const dstDeviceName = useMemo(() => {
    if (!linkData || linkData.length === 0 || !graphData)
      return 'Unknown Device';

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
      Array.isArray(linkData[0].dst_ip)
        ? linkData[0].dst_ip[0] || 0
        : linkData[0].dst_ip || 0,
      graphData.nodes
    );
  }, [linkData, graphData, selectedLink]);

  // Get flows for the current time that use this link
  const flowsTable = useMemo(() => {
    if (!selectedLink || !flowData || flowData.length === 0) return [];

    // Use more flexible time matching to handle timestamp discrepancies
    const currentTimeMs = new Date(currentTime).getTime();

    // Get flows for the current timestamp with tolerance
    const currentFlows = flowData.filter(flow => {
      const flowTimeMs = new Date(flow.timestamp).getTime();
      // Allow 1 second tolerance for timestamp matching
      return Math.abs(flowTimeMs - currentTimeMs) <= 1000;
    });

    // Filter flows that use the selected link and apply direction filter
    const filteredFlows = currentFlows.filter(flow => {
      // Check if this flow's path uses the selected link
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

      if (!usesLink) return false;

      // Apply direction filter by checking the path direction
      if (direction === 'src2dst') {
        // Check if flow goes from selectedLink.src to selectedLink.dst
        return flow.path.some((pathNode, index) => {
          if (index === flow.path.length - 1) return false;
          const current = String(pathNode.node);
          const next = String(flow.path[index + 1].node);
          return (
            current === String(selectedLink.src) &&
            next === String(selectedLink.dst)
          );
        });
      } else if (direction === 'dst2src') {
        // Check if flow goes from selectedLink.dst to selectedLink.src
        return flow.path.some((pathNode, index) => {
          if (index === flow.path.length - 1) return false;
          const current = String(pathNode.node);
          const next = String(flow.path[index + 1].node);
          return (
            current === String(selectedLink.dst) &&
            next === String(selectedLink.src)
          );
        });
      } else {
        // 'both' direction - return all flows that use the link
        return true;
      }
    });
    return filteredFlows.map(flow => ({
      ...flow,
      estimated_flow_sending_rate_bps_in_the_last_sec:
        parseInt(
          flow.estimated_flow_sending_rate_bps_in_the_proceeding_1sec_timeslot
        ) || 0,
      // Preserve original first_sampled_time and latest_sampled_time strings
      first_sampled_time: flow.first_sampled_time || '',
      latest_sampled_time: flow.latest_sampled_time || flow.timestamp || '',
    }));
  }, [selectedLink, flowData, currentTime, direction]);

  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const sortedFlows = useMemo(() => {
    if (!sortField) return flowsTable;
    return [...flowsTable].sort((a, b) => {
      // Helper function to parse time string to epoch timestamp for sorting
      const parseToEpoch = (val: any): number => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          // Try to parse format like "2025-09-12 00:13:37"
          const [datePart, timePart] = val.split(' ');
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
          // Fallback to Date.parse for ISO strings
          const t = Date.parse(val);
          return Number.isNaN(t) ? 0 : t;
        }
        return 0;
      };

      let aValue: number, bValue: number;
      if (sortField === 'start_time') {
        aValue = parseToEpoch(
          a.first_sampled_time ?? (a as any).start_time_ms ?? 0
        );
        bValue = parseToEpoch(
          b.first_sampled_time ?? (b as any).start_time_ms ?? 0
        );
      } else if (sortField === 'end_time') {
        aValue = parseToEpoch(
          a.latest_sampled_time ?? (a as any).end_time_ms ?? 0
        );
        bValue = parseToEpoch(
          b.latest_sampled_time ?? (b as any).end_time_ms ?? 0
        );
      } else if (sortField === 'sending_rate') {
        aValue = a.estimated_flow_sending_rate_bps_in_the_last_sec ?? 0;
        bValue = b.estimated_flow_sending_rate_bps_in_the_last_sec ?? 0;
      } else return 0;
      if (sortDirection === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });
  }, [flowsTable, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '⭥';
    return sortDirection === 'asc' ? '⭡' : '⭣';
  };

  const areSameFlow = useCallback((a: any, b: any) => {
    const aProto = a.protocol_id;
    const bProto = b.protocol_id;

    const sameSrc = a.src_ip === b.src_ip;
    const sameDst = a.dst_ip === b.dst_ip;
    const sameProto = aProto === bProto;

    return sameSrc && sameDst && sameProto;
  }, []);

  const handleFlowSelection = useCallback(
    (flow: any, checked: boolean) => {
      setSelectedFlows(prev => {
        const index = prev.findIndex(f => areSameFlow(f, flow));

        if (checked) {
          if (index !== -1) return prev;
          if (prev.length >= COLORS.length) return prev;
          return [...prev, flow];
        }

        if (index === -1) return prev;
        const next = [...prev];
        next.splice(index, 1);
        return next;
      });
    },
    [areSameFlow]
  );

  const findSelectedFlowIndex = useCallback(
    (flow: any) => selectedFlows.findIndex(f => areSameFlow(f, flow)),
    [selectedFlows, areSameFlow]
  );

  const isFlowSelected = useCallback(
    (flow: any) => findSelectedFlowIndex(flow) !== -1,
    [findSelectedFlowIndex]
  );

  const getFlowColorIndex = useCallback(
    (flow: any) => findSelectedFlowIndex(flow),
    [findSelectedFlowIndex]
  );

  // Only update panel data when selectedFlows actually changes, not on every render
  useEffect(() => {
    if (selectedFlows.length > 0) {
      onUpdatePanelData?.('tracePerLinkFlow', selectedFlows);
      onUpdatePanelData?.('traceFlowStacked', selectedFlows);
    }
  }, [selectedFlows]); // Remove onUpdatePanelData from dependencies to prevent unnecessary updates

  return (
    <>
      {/* @ts-expect-error - Draggable component type issue */}
      <Draggable nodeRef={nodeRef} handle=".drag-handle">
        <div
          ref={nodeRef}
          className="fixed bottom-[55%] right-[1%] z-40 flex h-auto w-4/5 flex-col space-y-3 rounded-lg border-2 border-gray-300 bg-[#f0f4f8] p-4 shadow-xl"
          style={{ minWidth: 400, maxHeight: '40vh', overflowY: 'auto' }}
        >
          <div className="drag-handle flex cursor-move items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800">
                {t('linkFlow.title')} - Availability status
              </h2>
              <p className="font-mono text-sm text-gray-500">
                {srcDeviceName} ⭤ {dstDeviceName}
              </p>
              <p className="text-xs text-gray-500">
                Time: {new Date(currentTime).toLocaleString()}
              </p>
              <div className="mt-2 flex space-x-2">
                <button
                  className={`rounded border px-2 py-1 text-xs font-semibold ${direction === 'both' ? 'border-blue-500 bg-blue-500 text-white' : 'border-blue-300 bg-white text-blue-500'} transition`}
                  onClick={() => setDirection('both')}
                >
                  {t('flow.both')}
                </button>
                <button
                  className={`rounded border px-2 py-1 text-xs font-semibold ${direction === 'src2dst' ? 'border-blue-500 bg-blue-500 text-white' : 'border-blue-300 bg-white text-blue-500'} transition`}
                  onClick={() => setDirection('src2dst')}
                >
                  {srcDeviceName} → {dstDeviceName}
                </button>
                <button
                  className={`rounded border px-2 py-1 text-xs font-semibold ${direction === 'dst2src' ? 'border-blue-500 bg-blue-500 text-white' : 'border-blue-300 bg-white text-blue-500'} transition`}
                  onClick={() => setDirection('dst2src')}
                >
                  {dstDeviceName} → {srcDeviceName}
                </button>
              </div>
              <p className="mt-2 text-sm font-medium text-gray-600">
                {direction === 'both' && (
                  <>
                    {t('flow.both')}: {sortedFlows.length}{' '}
                    {t('flow.flows') || 'flows'}
                  </>
                )}
                {direction === 'src2dst' && (
                  <>
                    {srcDeviceName} → {dstDeviceName}: {sortedFlows.length}{' '}
                    {t('flow.flows') || 'flows'}
                  </>
                )}
                {direction === 'dst2src' && (
                  <>
                    {dstDeviceName} → {srcDeviceName}: {sortedFlows.length}{' '}
                    {t('flow.flows') || 'flows'}
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-col items-end space-y-2">
              <div className="flex space-x-2">
                <button
                  onClick={() => onAddPanel?.('traceLinkInfo', selectedLink)}
                  className="flex items-center p-1 text-blue-500 hover:text-blue-700"
                  title={t('linkFlow.showHideLinkBandwidth')}
                >
                  <FaChartLine size={20} />
                  <span className="ml-1 text-xs font-semibold">
                    {t('flow.bandwidth')}
                  </span>
                </button>
                <button
                  onClick={() => onAddPanel?.('traceLinkInfoAll', selectedLink)}
                  className="flex items-center p-1 text-purple-500 hover:text-purple-700"
                  title="Show all historical link bandwidth data"
                >
                  <FaChartLine size={20} />
                  <span className="ml-1 text-xs font-semibold">All Data</span>
                </button>
                <button
                  onClick={() =>
                    onAddPanel?.('tracePerLinkFlow', selectedFlows)
                  }
                  className="flex items-center p-1 text-green-500 hover:text-green-700"
                  title={t('linkFlow.compareSelectedFlows')}
                >
                  <FaLayerGroup size={20} />
                  <span className="ml-1 text-xs font-semibold">
                    {t('flow.compare')}
                  </span>
                </button>
                <button
                  onClick={() =>
                    onAddPanel?.('traceFlowStacked', selectedFlows)
                  }
                  className="flex items-center p-1 text-orange-500 hover:text-orange-700"
                  title={t('linkFlow.showStackedSum')}
                >
                  <FaChartArea size={20} />
                  <span className="ml-1 text-xs font-semibold">
                    {t('flow.stacked')}
                  </span>
                </button>
                <button
                  onClick={() => {
                    onClearHighlight?.();
                    onClose();
                  }}
                  className="text-2xl font-bold text-gray-500 transition-colors hover:text-gray-700"
                  title={t('common.close')}
                >
                  &times;
                </button>
              </div>
            </div>
          </div>
          {sortedFlows.length === 0 ? (
            <p className="text-gray-500">{t('flow.noFlowsFound')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full rounded-lg bg-white text-sm">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr>
                    <th
                      className="cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]"
                      onClick={() => handleSort(null)}
                    >
                      {t('flow.srcIp')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]"
                      onClick={() => handleSort(null)}
                    >
                      {t('flow.dstIp')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]"
                      onClick={() => handleSort(null)}
                    >
                      {t('flow.srcPort')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]"
                      onClick={() => handleSort(null)}
                    >
                      {t('flow.dstPort')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]"
                      onClick={() => handleSort(null)}
                    >
                      {t('flow.protocol')}
                    </th>
                    <th
                      className={`cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]
                        ${sortField === 'sending_rate' ? 'bg-[#e3e9f3] text-[#ff5722]' : 'text-[#1976d2]'}`}
                      onClick={() => handleSort('sending_rate')}
                    >
                      {t('flow.sendingRate')} {getSortIcon('sending_rate')}
                    </th>
                    <th
                      className={`cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]
                        ${sortField === 'start_time' ? 'bg-[#e3e9f3] text-[#ff5722]' : 'text-[#1976d2]'}`}
                      onClick={() => handleSort('start_time')}
                    >
                      {t('flow.firstSampleTime')} {getSortIcon('start_time')}
                    </th>
                    <th
                      className={`cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]
                        ${sortField === 'end_time' ? 'bg-[#e3e9f3] text-[#ff5722]' : 'text-[#1976d2]'}`}
                      onClick={() => handleSort('end_time')}
                    >
                      {t('flow.latestSampleTime')} {getSortIcon('end_time')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-[#1976d2]">
                      {t('flow.select')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFlows.map((flow, idx) => {
                    // console.log(flow);
                    const colorIdx = getFlowColorIndex(flow);
                    const bgColor =
                      colorIdx !== -1 ? COLORS[colorIdx] + '22' : undefined;
                    return (
                      <tr
                        key={idx}
                        className="border-b border-gray-200 hover:bg-[#f8fafc]"
                        style={bgColor ? { background: bgColor } : {}}
                      >
                        <td className="px-4 py-2 font-mono">
                          {getIpString(flow.src_ip)}
                        </td>
                        <td className="px-4 py-2 font-mono">
                          {getIpString(flow.dst_ip)}
                        </td>
                        <td className="px-4 py-2 font-mono">
                          {(() => {
                            if (flow.src_port !== undefined) {
                              return flow.src_port;
                            }
                            if (
                              flow.path?.[0] &&
                              typeof flow.path[0].interface === 'number'
                            ) {
                              return flow.path[0].interface;
                            }
                            return 'N/A';
                          })()}
                        </td>
                        <td className="px-4 py-2 font-mono">
                          {(() => {
                            if (flow.dst_port !== undefined) {
                              return flow.dst_port;
                            }
                            if (flow.path && flow.path.length > 0) {
                              const lastInterface =
                                flow.path[flow.path.length - 1]?.interface;
                              if (typeof lastInterface === 'number') {
                                return lastInterface;
                              }
                            }
                            return 'N/A';
                          })()}
                        </td>
                        <td className="px-4 py-2 font-mono">
                          {(() => {
                            if (
                              Number.isFinite(flow.protocol_id) &&
                              protocolMap[Number(flow.protocol_id)]
                            ) {
                              return protocolMap[Number(flow.protocol_id)];
                            }
                            return flow.protocol_id ?? 'N/A';
                          })()}
                        </td>
                        <td className="px-4 py-2 font-mono">
                          {formatRate(
                            flow.estimated_flow_sending_rate_bps_in_the_last_sec ??
                              0
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono">
                          {flow.first_sampled_time || 'N/A'}
                        </td>
                        <td className="px-4 py-2 font-mono">
                          {flow.latest_sampled_time || 'N/A'}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={isFlowSelected(flow)}
                            disabled={
                              colorIdx === -1 &&
                              selectedFlows.length >= COLORS.length
                            }
                            onChange={e =>
                              handleFlowSelection(flow, e.target.checked)
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Draggable>
    </>
  );
};

export default TraceLinkFlowInformation;
