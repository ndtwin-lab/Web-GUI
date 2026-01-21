import React, { useRef, useMemo } from 'react';
import Draggable from 'react-draggable';
import { useTranslation } from 'react-i18next';
import { useGraphData } from '../GraphDataManager';
import { getDeviceNameFromIp } from '../../utils/utility';

type LinkMetrics = {
  destination_port: number;
  source_port: number;
  total_bandwidth_bps: number;
  used_bandwidth_bps: number;
  utilization: number;
};

type TopKLinkEntry = {
  rank: number;
  status: string;
} & Record<string, LinkMetrics>;

interface LLMResponseData {
  explanation: string;
  state: string;
  tasks: Array<{
    order: number;
    parameters: { k: number };
    result: string;
    type: 'GetTopKCongestedLinks' | 'GetTopKFlow';
  }>;
  valid: boolean;
}

interface GetTopKCongestedLinksProps {
  data: LLMResponseData;
  onClose: () => void;
}

const GetTopKCongestedLinks: React.FC<GetTopKCongestedLinksProps> = ({
  data,
  onClose,
}) => {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);

  // Parse the result data
  const parseTopKData = (resultString: string): TopKLinkEntry[] => {
    try {
      const parsed = JSON.parse(resultString);
      return parsed.top_k_links || [];
    } catch (error) {
      console.error('Error parsing top K data:', error);
      return [];
    }
  };

  // Convert dotted IPv4 string to little-endian integer
  const dottedIpToLittleEndianInt = (ipStr: string): number | null => {
    const parts = ipStr.split('.').map(p => Number(p));
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return null;
    // little-endian storage: a.b.c.d => a | (b<<8) | (c<<16) | (d<<24)
    return (
      ((parts[0] & 0xff) |
        ((parts[1] & 0xff) << 8) |
        ((parts[2] & 0xff) << 16) |
        ((parts[3] & 0xff) << 24)) >>>
      0
    );
  };

  // Resolve a key like "10.0.0.2_to_192.168.123.11" to "s1 → s2"
  const { graphData } = useGraphData();
  const latestNodes = useMemo(() => {
    return graphData && graphData.length > 0
      ? graphData[graphData.length - 1].nodes
      : [];
  }, [graphData]);

  const prettyLinkName = (rawKey: string): string => {
    const [lhs, rhs] = rawKey.split('_to_');
    if (!lhs || !rhs) return rawKey;
    const lhsInt = dottedIpToLittleEndianInt(lhs);
    const rhsInt = dottedIpToLittleEndianInt(rhs);
    const lhsName =
      lhsInt !== null ? getDeviceNameFromIp(lhsInt, latestNodes) : lhs;
    const rhsName =
      rhsInt !== null ? getDeviceNameFromIp(rhsInt, latestNodes) : rhs;
    return `${lhsName} → ${rhsName}`;
  };

  const formatBandwidth = (bps: number) => {
    if (bps >= 1_000_000_000) {
      return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
    } else if (bps >= 1_000_000) {
      return `${(bps / 1_000_000).toFixed(2)} Mbps`;
    } else if (bps >= 1_000) {
      return `${(bps / 1_000).toFixed(2)} Kbps`;
    } else {
      return `${bps} bps`;
    }
  };

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 80) return 'text-red-600 bg-red-50';
    if (utilization >= 60) return 'text-orange-600 bg-orange-50';
    if (utilization >= 40) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'up':
        return 'text-green-600 bg-green-50';
      case 'down':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const topKData =
    data.tasks.length > 0 ? parseTopKData(data.tasks[0].result) : [];

  // Extract link entries (excluding rank and status)
  const getLinkEntries = (
    link: TopKLinkEntry
  ): Array<[string, LinkMetrics]> => {
    return Object.entries(link).filter(
      ([key]) => key !== 'rank' && key !== 'status'
    ) as Array<[string, LinkMetrics]>;
  };

  // Render a single link metric card
  const renderLinkMetricCard = (linkName: string, linkData: LinkMetrics) => {
    return (
      <div
        key={linkName}
        className="rounded-lg border border-gray-200 bg-gray-50 p-4"
      >
        <h4 className="mb-3 font-semibold text-gray-700">
          {prettyLinkName(linkName)}
        </h4>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Interface:</span>
            <span className="font-mono text-sm">{linkData.source_port}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Link Bandwidth:</span>
            <span className="font-mono text-sm">
              {formatBandwidth(linkData.total_bandwidth_bps)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Used Bandwidth:</span>
            <span className="font-mono text-sm">
              {formatBandwidth(linkData.used_bandwidth_bps)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Utilization:</span>
            <span
              className={`rounded px-2 py-1 text-sm font-medium ${getUtilizationColor(
                linkData.utilization
              )}`}
            >
              {linkData.utilization.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Render a single link entry
  const renderLinkEntry = (link: TopKLinkEntry, index: number) => {
    const linkEntries = getLinkEntries(link);

    return (
      <div
        key={index}
        className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">
            Rank #{link.rank}
          </h3>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(
              link.status
            )}`}
          >
            {link.status.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {linkEntries.map(([linkName, linkData]) =>
            renderLinkMetricCard(linkName, linkData)
          )}
        </div>
      </div>
    );
  };

  // Render empty state
  const renderEmptyState = () => {
    return (
      <div className="p-6 text-center text-gray-500">No data available</div>
    );
  };

  // Render content based on data availability
  const renderContent = () => {
    if (topKData.length === 0) {
      return renderEmptyState();
    }

    return (
      <div className="p-4">
        {topKData.map((link, index) => renderLinkEntry(link, index))}
      </div>
    );
  };

  return (
    <>
      {/* @ts-expect-error */}
      <Draggable nodeRef={nodeRef} handle=".drag-handle">
        <div
          ref={nodeRef}
          className="fixed bottom-6 right-4 w-11/12 max-w-6xl overflow-hidden rounded-lg border-4 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] shadow-lg"
        >
          <div className="drag-handle cursor-move border-b border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <h2
                  className="text-xl font-bold tracking-tight"
                  style={{ color: '#1976d2' }}
                >
                  Top-K Congested Links
                </h2>
                <span className="rounded-lg border border-[#e0e0e0] bg-[#fff] px-2 py-1 text-sm font-medium text-[#1976d2]">
                  {topKData.length} Links
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
            <div className="mt-2">
              <p className="text-sm text-gray-600">{data.explanation}</p>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto bg-[#fff]">
            {renderContent()}
          </div>

          {/* Footer */}
          <div className="drag-handle cursor-move border-t border-[#e0e0e0] bg-[#f8fafc] px-6 py-3">
            <div className="flex items-center justify-between text-sm text-[#9c9c9c]">
              <span>Showing {topKData.length} congested links</span>
              <span>Last Updated: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </Draggable>
    </>
  );
};

export default GetTopKCongestedLinks;
