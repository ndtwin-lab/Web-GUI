import React, { useMemo, useRef } from 'react';
import Draggable from 'react-draggable';
import { useTranslation } from 'react-i18next';
import { useGraphData } from '../GraphDataManager';
import { getDeviceNameFromIp } from '../../utils/utility';

type Flow = {
  src_ip: number;
  dst_ip: number;
  src_port?: number;
  dst_port?: number;
  protocol_id?: number;
  first_sampled_time?: string | number;
  latest_sampled_time?: string | number;
  estimated_flow_sending_rate_bps_in_the_proceeding_1sec_timeslot?: number;
};

interface TopKFlowsPanelProps {
  result: string; // JSON string array from LLM
  explanation?: string;
  onClose: () => void;
}

function formatBandwidth(bps?: number) {
  const n = bps ?? 0;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} Gbps`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Mbps`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)} Kbps`;
  return `${n} bps`;
}

const protocolMap: Record<number, string> = {
  6: 'TCP',
  17: 'UDP',
  1: 'ICMP',
};

// Protocol badge styling configuration
const getProtocolBadge = (protocolId: number) => {
  const getProtocolStyle = (protocolId: number): string => {
    switch (protocolId) {
      case 6: // TCP
        return 'border-blue-200 bg-blue-100 text-[#1976d2]';
      case 17: // UDP
        return 'border-green-200 bg-green-100 text-green-800';
      case 53: // DNS
        return 'bg-purple-100 text-purple-800';
      case 67: // DHCP
      case 68: // DHCP
        return 'bg-yellow-100 text-yellow-800';
      case 80: // HTTP
        return 'bg-blue-200 text-blue-900';
      case 161: // SNMP
        return 'bg-teal-100 text-teal-800';
      case 389: // LDAP
        return 'bg-pink-100 text-pink-800';
      case 443: // HTTPS
        return 'bg-indigo-100 text-indigo-800';
      case 3306: // MYSQL
        return 'bg-green-200 text-green-900';
      case 5432: // POSTGRESQL
        return 'bg-red-100 text-red-800';
      case 27017: // MONGODB
        return 'bg-orange-200 text-orange-600';
      default:
        return 'border-orange-200 bg-orange-100 text-orange-800';
    }
  };

  const protocolName = protocolMap[protocolId] || protocolId.toString();
  const styleClass = getProtocolStyle(protocolId);

  return (
    <span
      className={`rounded-lg border px-2 py-1 text-xs font-medium ${styleClass}`}
    >
      {protocolName}
    </span>
  );
};

const TopKFlowsPanel: React.FC<TopKFlowsPanelProps> = ({
  result,
  explanation,
  onClose,
}) => {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const { graphData } = useGraphData();
  const latestNodes = useMemo(
    () =>
      graphData && graphData.length > 0
        ? graphData[graphData.length - 1].nodes
        : [],
    [graphData]
  );

  const flows: Flow[] = useMemo(() => {
    try {
      const parsed = JSON.parse(result);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Failed to parse flows result', e);
      return [];
    }
  }, [result]);

  return (
    <>
      {/* @ts-expect-error - Draggable component type issue */}
      <Draggable nodeRef={nodeRef} handle=".drag-handle">
        <div
          ref={nodeRef}
          className="fixed bottom-6 right-4 w-11/12 max-w-5xl overflow-hidden rounded-lg border-4 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] shadow-lg"
        >
          <div className="drag-handle cursor-move border-b border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <h2
                  className="text-xl font-bold tracking-tight"
                  style={{ color: '#1976d2' }}
                >
                  Top-K Flows
                </h2>
                <span className="rounded-lg border border-[#e0e0e0] bg-[#fff] px-2 py-1 text-sm font-medium text-[#1976d2]">
                  {flows.length} Flows
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={onClose}
                  className="rounded-md border border-[#e0e0e0] bg-[#fff] p-2 transition-all duration-200 hover:bg-[#e3e9f3]"
                  title="Close"
                >
                  <svg
                    className="h-5 w-5"
                    style={{ color: '#FF7F50' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
            {explanation && (
              <p className="mt-2 text-sm text-gray-600">{explanation}</p>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto bg-[#fff] p-4">
            {flows.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No data available
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {flows.map((flow, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-base font-semibold text-gray-800">
                        {getDeviceNameFromIp(flow.src_ip, latestNodes)} →{' '}
                        {getDeviceNameFromIp(flow.dst_ip, latestNodes)}
                      </h3>
                      <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
                        #{idx + 1}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="col-span-2">
                        <span className="text-gray-500">Protocol:</span>{' '}
                        {flow.protocol_id ? (
                          getProtocolBadge(flow.protocol_id)
                        ) : (
                          <span className="font-mono">N/A</span>
                        )}
                      </div>
                      <div>
                        <span className="text-gray-500">Source Port:</span>{' '}
                        <span className="font-mono">
                          {flow.src_port ?? 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Destination Port:</span>{' '}
                        <span className="font-mono">
                          {flow.dst_port ?? 'N/A'}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-500">Sending rate:</span>{' '}
                        <span className="font-mono">
                          {formatBandwidth(
                            flow.estimated_flow_sending_rate_bps_in_the_proceeding_1sec_timeslot
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="drag-handle cursor-move border-t border-[#e0e0e0] bg-[#f8fafc] px-6 py-3">
            <div className="flex items-center justify-between text-sm text-[#9c9c9c]">
              <span>Showing {flows.length} flows</span>
              <span>Last Updated: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </Draggable>
    </>
  );
};

export default TopKFlowsPanel;
