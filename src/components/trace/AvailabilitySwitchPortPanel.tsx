import React, { useState, useRef, useMemo } from 'react';
import Draggable from 'react-draggable';
import { useTranslation } from 'react-i18next';
import { getIpString } from '../../utils/formatters';
import {
  HiOutlineChip,
  HiOutlineLightningBolt,
  HiOutlineInformationCircle,
} from 'react-icons/hi';
import { FaEthernet, FaNetworkWired, FaLink } from 'react-icons/fa';
import type { HistoryFlowData, HistoryGraphData } from './AvailabilityDataManager';

interface PortInfo {
  portNumber: number;
  connectedDevice: string;
  connectedDeviceIps: string[];
  linkId: string;
  bandwidthUsage: number;
  isUp: boolean;
}

interface HistorySwitchPortPanelProps {
  deviceId: string | number | null;
  flowData: HistoryFlowData[];
  graphData?: HistoryGraphData | null;
  currentTime: string;
  onClose: () => void;
  onHighlightLink: (linkId: string) => void;
  onClearHighlight: () => void;
}

const HistorySwitchPortPanel = React.memo(function HistorySwitchPortPanel({
  deviceId,
  flowData,
  graphData,
  currentTime,
  onClose,
  onHighlightLink,
  onClearHighlight,
}: HistorySwitchPortPanelProps) {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [selectedPort, setSelectedPort] = useState<number | null>(null);

  const deviceIdNum =
    typeof deviceId === 'string' ? Number(deviceId) : (deviceId ?? 0);

  // Find the device node from graph data
  const deviceNode = useMemo(() => {
    if (!graphData || !graphData.nodes) return null;
    return graphData.nodes.find((node: any) => {
      return (
        String(node.dpid) === String(deviceIdNum) ||
        (Array.isArray(node.ip) &&
          node.ip.some((ip: any) => ip === deviceIdNum))
      );
    });
  }, [graphData, deviceIdNum]);

  // Calculate port information from historical data
  const portInfo: PortInfo[] = useMemo(() => {
    if (!graphData || !deviceNode || !graphData.edges) return [];

    const ports: PortInfo[] = [];
    const deviceIdStr = String(deviceIdNum);

    // Create a map to store port information and combine bandwidth usage from both directions
    const portMap = new Map<number, PortInfo>();

    graphData.edges.forEach((edge: any) => {
      let connectedDevice: any = null;
      let linkId: string = '';
      let portNumber: number = 0;
      let bandwidthUsage: number = 0;
      let isUp: boolean = true;

      // Check if this switch is the source (outgoing connection)
      if (
        edge.src_dpid !== undefined &&
        edge.src_dpid !== null &&
        String(edge.src_dpid) === deviceIdStr &&
        edge.src_interface !== undefined &&
        edge.src_interface !== null &&
        edge.src_interface > 0 &&
        edge.is_enabled
      ) {
        portNumber = edge.src_interface;
        bandwidthUsage = edge.link_bandwidth_utilization_percent ?? 0;
        isUp = edge.is_up ?? true;

        if (edge.dst_dpid && Number(edge.dst_dpid) !== 0) {
          // Connected to another switch
          connectedDevice = graphData.nodes.find(
            (node: any) => String(node.dpid) === String(edge.dst_dpid)
          );
          if (connectedDevice) {
            const nodeA = String(edge.src_dpid);
            const nodeB = String(edge.dst_dpid);
            linkId = [nodeA, nodeB].sort().join('-');
          }
        } else {
          // Connected to a host, find by IP (use the first dst_ip to find the host)
          const dstIps = Array.isArray(edge.dst_ip)
            ? edge.dst_ip
            : [edge.dst_ip];
          if (dstIps.length > 0 && dstIps[0] !== undefined) {
            connectedDevice = graphData.nodes.find(
              (node: any) =>
                node.vertex_type === 1 &&
                Array.isArray(node.ip) &&
                node.ip.includes(dstIps[0] as number)
            );
            if (connectedDevice) {
              const nodeA = String(edge.src_dpid);
              const nodeB = connectedDevice.device_name; // Use device_name for hosts
              linkId = [nodeA, nodeB].sort().join('-');
            }
          }
        }
      }
      // Check if this switch is the destination (incoming connection from host)
      else if (
        edge.dst_dpid !== undefined &&
        edge.dst_dpid !== null &&
        String(edge.dst_dpid) === deviceIdStr &&
        edge.dst_interface !== undefined &&
        edge.dst_interface !== null &&
        edge.dst_interface > 0 &&
        edge.is_enabled &&
        Number(edge.src_dpid) === 0
      ) {
        portNumber = edge.dst_interface;
        bandwidthUsage = edge.link_bandwidth_utilization_percent ?? 0;
        isUp = edge.is_up ?? true;

        // Connected from a host, find by IP
        const srcIps = Array.isArray(edge.src_ip) ? edge.src_ip : [edge.src_ip];
        if (srcIps.length > 0 && srcIps[0] !== undefined) {
          connectedDevice = graphData.nodes.find(
            (node: any) =>
              node.vertex_type === 1 &&
              Array.isArray(node.ip) &&
              node.ip.includes(srcIps[0] as number)
          );
          if (connectedDevice) {
            const nodeA = String(edge.dst_dpid);
            const nodeB = connectedDevice.device_name; // Use device_name for hosts
            linkId = [nodeA, nodeB].sort().join('-');
          }
        }
      }

      if (connectedDevice && linkId) {
        // Convert all IPs to strings for display
        const deviceIps = Array.isArray(connectedDevice.ip)
          ? connectedDevice.ip.map((ip: number) => getIpString(ip))
          : [getIpString(connectedDevice.ip)];

        const portInfo: PortInfo = {
          portNumber: portNumber,
          connectedDevice: connectedDevice.device_name,
          connectedDeviceIps: deviceIps,
          linkId: linkId,
          bandwidthUsage: bandwidthUsage,
          isUp: isUp,
        };

        // If port already exists, combine bandwidth usage (take the maximum)
        if (portMap.has(portNumber)) {
          const existingPort = portMap.get(portNumber)!;
          existingPort.bandwidthUsage = Math.max(
            existingPort.bandwidthUsage,
            bandwidthUsage
          );
          existingPort.isUp = existingPort.isUp && isUp; // Both directions must be up
        } else {
          portMap.set(portNumber, portInfo);
        }
      }
    });

    // If no graph data available, try to extract port information from flow data
    if (portMap.size === 0 && flowData && flowData.length > 0) {
      const flowPortMap = new Map<number, PortInfo>();

      flowData.forEach(flow => {
        // Find flows that pass through this device
        const deviceIndex = flow.path.findIndex(
          (pathNode: any) => String(pathNode.node) === deviceIdStr
        );

        if (deviceIndex !== -1) {
          const pathNode = flow.path[deviceIndex];
          const portNumber = pathNode.interface || 0;

          if (portNumber > 0) {
            // Calculate bandwidth usage from flow data
            const bandwidth =
              parseInt(
                flow.estimated_flow_sending_rate_bps_in_the_proceeding_1sec_timeslot
              ) || 0;
            const bandwidthUsage = (bandwidth / 1000000000) * 100; // Convert to percentage

            // Find connected device (next or previous node in path)
            let connectedDevice = 'Unknown Device';
            let connectedDeviceIps: string[] = [];
            let linkId = '';

            if (deviceIndex > 0) {
              const prevNode = flow.path[deviceIndex - 1];
              connectedDevice = `Node_${prevNode.node}`;
              connectedDeviceIps = [getIpString(Number(prevNode.node))];
              linkId = [String(prevNode.node), deviceIdStr].sort().join('-');
            } else if (deviceIndex < flow.path.length - 1) {
              const nextNode = flow.path[deviceIndex + 1];
              connectedDevice = `Node_${nextNode.node}`;
              connectedDeviceIps = [getIpString(Number(nextNode.node))];
              linkId = [deviceIdStr, String(nextNode.node)].sort().join('-');
            }

            const portInfo: PortInfo = {
              portNumber: portNumber,
              connectedDevice: connectedDevice,
              connectedDeviceIps: connectedDeviceIps,
              linkId: linkId,
              bandwidthUsage: bandwidthUsage,
              isUp: true, // Assume up for flow data
            };

            if (flowPortMap.has(portNumber)) {
              const existingPort = flowPortMap.get(portNumber)!;
              existingPort.bandwidthUsage += bandwidthUsage;
            } else {
              flowPortMap.set(portNumber, portInfo);
            }
          }
        }
      });

      // Convert flow port map to array
      return Array.from(flowPortMap.values()).sort(
        (a, b) => a.portNumber - b.portNumber
      );
    }

    return Array.from(portMap.values()).sort(
      (a, b) => a.portNumber - b.portNumber
    );
  }, [graphData, deviceIdNum, deviceNode, flowData]);

  const handlePortClick = (port: PortInfo) => {
    if (selectedPort === port.portNumber) {
      setSelectedPort(null);
      onClearHighlight();
    } else {
      setSelectedPort(port.portNumber);
      onHighlightLink(port.linkId);
    }
  };

  const getEdgeColorByUsage = (usagePercent: number) => {
    if (usagePercent >= 100) return '#F44336'; // red
    // 0%: blue (#2196F3), 33%: green (#4CAF50), 66%: yellow (#FFEB3B), 100%: red (#F44336)
    if (usagePercent <= 33) {
      // blue to green
      const ratio = usagePercent / 33;
      const r = Math.round(33 + (76 - 33) * ratio);
      const g = Math.round(150 + (175 - 150) * ratio);
      const b = Math.round(243 + (80 - 243) * ratio);
      return `rgb(${r},${g},${b})`;
    } else if (usagePercent <= 66) {
      // green to yellow
      const ratio = (usagePercent - 33) / 33;
      const r = Math.round(76 + (255 - 76) * ratio);
      const g = Math.round(175 + (235 - 175) * ratio);
      const b = Math.round(80 + (59 - 80) * ratio);
      return `rgb(${r},${g},${b})`;
    } else {
      // yellow to red
      const ratio = (usagePercent - 66) / 34;
      const r = Math.round(255 + (244 - 255) * ratio);
      const g = Math.round(235 + (67 - 235) * ratio);
      const b = Math.round(59 + (54 - 59) * ratio);
      return `rgb(${r},${g},${b})`;
    }
  };

  const getBandwidthStyle = (usage: number) => {
    return { color: getEdgeColorByUsage(usage) };
  };

  const getStatusColor = (isUp: boolean) => {
    return isUp ? 'text-green-600' : 'text-red-600';
  };

  const getStatusIcon = (isUp: boolean) => {
    return isUp ? '●' : '○';
  };

  const handleClose = () => {
    setSelectedPort(null);
    onClearHighlight();
    onClose();
  };

  if (!deviceId || (!graphData && (!flowData || flowData.length === 0))) {
    return null;
  }

  if (!deviceNode && (!flowData || flowData.length === 0)) {
    return null;
  }

  return (
    // @ts-expect-error - Draggable component type issue
    <Draggable nodeRef={nodeRef} handle=".drag-handle">
      <div
        ref={nodeRef}
        className="fixed bottom-2 left-1/4 z-50 w-1/3 rounded-lg border-2 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] p-6 shadow-lg"
        style={{ maxHeight: '70vh', overflowY: 'auto' }}
      >
        <div className="drag-handle mb-6 flex cursor-move items-center justify-between">
          <div className="flex items-center gap-3">
            <HiOutlineChip className="text-2xl text-[#1976d2]" />
            <div>
              <h2 className="text-2xl font-bold text-[#333]">
                {t('switchPorts.title')} - Availability status
              </h2>
              <p className="text-sm text-gray-600">
                {deviceNode ? deviceNode.device_name : `Switch_${deviceIdNum}`}
              </p>
              <p className="text-xs text-gray-500">
                Time: {new Date(currentTime).toLocaleString()}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-2xl font-bold text-gray-500 transition-colors hover:text-gray-700"
            title={t('common.close')}
          >
            &times;
          </button>
        </div>

        {selectedPort && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <HiOutlineInformationCircle className="text-blue-600" />
              <span className="font-semibold text-blue-800">
                {t('switchPorts.selectedPort')}: {selectedPort}
              </span>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-[#e0e0e0] bg-white">
          <div className="border-b border-[#e0e0e0] bg-gradient-to-r from-[#f8fafc] to-[#e3e9f3] px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#1976d2]">
                {t('switchPorts.activePorts')} ({portInfo.length})
              </span>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FaNetworkWired />
                <span>{t('switchPorts.connectedDevices')}</span>
              </div>
            </div>
          </div>

          {portInfo.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FaEthernet className="mx-auto mb-3 text-4xl text-gray-300" />
              <p className="text-lg font-medium">No Active Ports</p>
              <p className="text-sm">
                This switch has no connected ports at this time
              </p>
            </div>
          ) : (
            <div>
              {portInfo.map(port => (
                <div
                  key={port.portNumber}
                  onClick={() => handlePortClick(port)}
                  className={`relative cursor-pointer border-b border-gray-100 p-4 transition-all duration-200 last:border-b-0 hover:bg-gray-50 ${
                    selectedPort === port.portNumber ? 'bg-blue-50' : ''
                  }`}
                >
                  {selectedPort === port.portNumber && (
                    <div className="absolute left-0 top-0 h-full w-1 bg-blue-500"></div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-3 w-3 rounded-full ${getStatusColor(port.isUp)}`}
                      >
                        {getStatusIcon(port.isUp)}
                      </div>
                      <div className="flex items-center gap-2">
                        <FaLink className="text-gray-400" />
                        <span className="text-lg font-semibold text-[#1976d2]">
                          {t('switchPorts.portNumber')} {port.portNumber}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className="text-sm font-medium"
                        style={getBandwidthStyle(port.bandwidthUsage)}
                      >
                        {port.bandwidthUsage.toFixed(1)}%{' '}
                        {t('switchPorts.usage')}
                      </div>
                    </div>
                  </div>

                  <div className="ml-8 mt-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <HiOutlineLightningBolt className="text-gray-400" />
                      <span className="font-medium">
                        {t('switchPorts.connectedTo')}
                      </span>
                      <span className="font-semibold text-[#333]">
                        {port.connectedDevice}
                      </span>
                    </div>
                    <div className="ml-6 font-mono text-xs text-gray-500">
                      {port.connectedDeviceIps.length === 1
                        ? port.connectedDeviceIps[0]
                        : port.connectedDeviceIps.map((ip, index) => (
                            <div key={index} className="mb-1">
                              {ip}
                            </div>
                          ))}
                    </div>
                  </div>

                  {/* Bandwidth usage bar */}
                  <div className="ml-8 mt-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{t('switchPorts.bandwidthUsage')}</span>
                      <div className="h-2 flex-1 rounded-full bg-gray-200">
                        <div
                          className="h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(port.bandwidthUsage, 100)}%`,
                            background: getEdgeColorByUsage(
                              port.bandwidthUsage
                            ),
                          }}
                        />
                      </div>
                      <span className="w-12 text-right">
                        {port.bandwidthUsage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Draggable>
  );
});

export default HistorySwitchPortPanel;
