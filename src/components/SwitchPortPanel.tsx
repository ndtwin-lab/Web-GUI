import React, { useState, useRef, useMemo } from 'react';
import Draggable from 'react-draggable';
import { useTranslation } from 'react-i18next';
import { apiService } from '../api/apiService';
import { usePolling } from '../hooks/usePolling';
import { getIpString } from '../utils/formatters';
import {
  HiOutlineChip,
  HiOutlineLightningBolt,
  HiOutlineInformationCircle,
} from 'react-icons/hi';
import { FaEthernet, FaNetworkWired, FaLink } from 'react-icons/fa';
import type { GraphDataType } from '../types';

interface PortInfo {
  portNumber: number;
  connectedDevice: string;
  connectedDeviceIps: string[]; // Changed from connectedDeviceIp to connectedDeviceIps array
  linkId: string;
  bandwidthUsage: number;
  isUp: boolean;
}

interface SwitchPortPanelProps {
  deviceId: string | number | null;
  onClose: () => void;
  onHighlightLink: (linkId: string) => void;
  onClearHighlight: () => void;
}

const SwitchPortPanel = React.memo(function SwitchPortPanel({
  deviceId,
  onClose,
  onHighlightLink,
  onClearHighlight,
}: SwitchPortPanelProps) {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [selectedPort, setSelectedPort] = useState<number | null>(null);

  const graphPolling = usePolling<GraphDataType>({
    fetcher: apiService.getGraphData,
    interval: 1000,
    autoStart: true,
    dependencies: [deviceId],
  });

  const error = graphPolling.error;
  const graphData = graphPolling.data;

  const deviceIdNum =
    typeof deviceId === 'string' ? Number(deviceId) : (deviceId ?? 0);
  const deviceNode = graphData?.nodes.find(node => {
    return node.dpid === deviceIdNum || node.ip.includes(deviceIdNum);
  });

  const portInfo: PortInfo[] = useMemo(() => {
    if (!graphData || !deviceNode) return [];
    const ports: PortInfo[] = [];
    const deviceIdStr = String(deviceIdNum);

    // Create a map to store port information and combine bandwidth usage from both directions
    const portMap = new Map<number, PortInfo>();

    graphData.edges.forEach(edge => {
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
        isUp = edge.is_up;

        if (edge.dst_dpid && edge.dst_dpid !== 0) {
          // Connected to another switch
          connectedDevice = graphData.nodes.find(
            node => String(node.dpid) === String(edge.dst_dpid)
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
          if (dstIps.length > 0) {
            connectedDevice = graphData.nodes.find(
              node =>
                node.vertex_type === 1 &&
                Array.isArray(node.ip) &&
                node.ip.includes(dstIps[0])
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
        edge.src_dpid === 0
      ) {
        portNumber = edge.dst_interface;
        bandwidthUsage = edge.link_bandwidth_utilization_percent ?? 0;
        isUp = edge.is_up;

        // Connected from a host, find by IP
        const srcIps = Array.isArray(edge.src_ip) ? edge.src_ip : [edge.src_ip];
        if (srcIps.length > 0) {
          connectedDevice = graphData.nodes.find(
            node =>
              node.vertex_type === 1 &&
              Array.isArray(node.ip) &&
              node.ip.includes(srcIps[0])
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

    return Array.from(portMap.values()).sort(
      (a, b) => a.portNumber - b.portNumber
    );
  }, [graphData, deviceIdNum, deviceNode]);

  const handlePortClick = (port: PortInfo) => {
    // console.log('Port clicked:', port);
    // console.log('Current selectedPort:', selectedPort, 'Type:', typeof selectedPort);
    // console.log('Port number:', port.portNumber, 'Type:', typeof port.portNumber);
    // console.log('Comparison result:', selectedPort === port.portNumber);

    if (selectedPort === port.portNumber) {
      // console.log('Clearing selection');
      setSelectedPort(null);
      onClearHighlight();
    } else {
      // console.log('Setting selection to:', port.portNumber);
      setSelectedPort(port.portNumber);
      // console.log('Highlighting link:', port.linkId);
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

  if (!deviceId || !graphData) {
    return null;
  }
  if (error) {
    return (
      <div className="fixed bottom-2 left-1/4 h-1/3 w-1/3 rounded-lg border-2 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-bold text-[#333]">
          {t('switchPorts.title')}
        </h2>
        <p className="text-gray-500">
          {t('switchPorts.informationNotAvailable')}
        </p>
      </div>
    );
  }
  if (!deviceNode || deviceNode.vertex_type !== 0) {
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
                {t('switchPorts.title')}
              </h2>
              <p className="text-sm text-gray-600">{deviceNode.device_name}</p>
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
            {/* <p className="text-sm text-blue-700">
              Click on a port to highlight its connected link in the topology. 
              Click again to clear the highlight.
            </p> */}
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
              <p className="text-sm">This switch has no connected ports</p>
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

export default SwitchPortPanel;
