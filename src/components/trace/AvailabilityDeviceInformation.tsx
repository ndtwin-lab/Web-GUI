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
import type { AvailabilityFlowData, AvailabilityGraphData } from './AvailabilityDataParser';

interface AvailabilityDeviceInformationProps {
  data: string | number | null;
  flowData: AvailabilityFlowData[];
  graphData?: AvailabilityGraphData | null;
  currentTime: string;
  onClose: () => void;
  onShowSwitchPorts?: () => void;
  isSwitchPortsVisible?: boolean;
}

function AvailabilityDeviceInformation({
  data,
  flowData,
  graphData,
  currentTime,
  onClose,
  onShowSwitchPorts,
  isSwitchPortsVisible,
}: AvailabilityDeviceInformationProps) {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);

  const deviceIdNum = typeof data === 'string' ? Number(data) : (data ?? 0);

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

  if (!data) {
    return null;
  }

  if (!graphData) {
    return (
      <div className="fixed bottom-10 right-10 h-1/3 w-1/4 rounded-lg border-2 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-bold text-[#333]">
          {t('device.title')} - Trace
        </h2>
        <p className="text-gray-500">{t('device.errorOccurred')}</p>
      </div>
    );
  }

  if (!deviceNode) {
    return (
      <div className="fixed bottom-10 right-10 h-1/3 w-1/4 rounded-lg border-2 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-bold text-[#333]">
          {t('device.title')} - Trace
        </h2>
        <p className="text-gray-500">{t('device.deviceNotFound')}</p>
      </div>
    );
  }

  const deviceIpString =
    deviceNode.ip && deviceNode.ip.length > 0
      ? getIpString(deviceNode.ip[0])
      : '';
  const currentNickname = deviceNode.device_name || '';

  return (
    // @ts-expect-error - Draggable component type issue
    <Draggable nodeRef={nodeRef} handle=".drag-handle">
      <div
        ref={nodeRef}
        className="fixed bottom-2 right-4 w-1/3 rounded-lg border-2 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] p-6 shadow-lg"
      >
        <div className="drag-handle mb-6 flex cursor-move items-center justify-between">
          <h2 className="mb-2 text-2xl font-bold text-[#333]">
            {t('device.title')} - Trace
          </h2>
          <div className="flex items-center gap-2">
            {deviceNode.vertex_type === 0 &&
              onShowSwitchPorts &&
              !isSwitchPortsVisible && (
                <button
                  onClick={onShowSwitchPorts}
                  className="rounded-lg bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 transition-colors duration-200 hover:bg-gray-300"
                  title={t('device.switchPorts')}
                >
                  {t('device.showPorts')}
                </button>
              )}
            <button
              onClick={onClose}
              className="text-2xl font-bold text-gray-500 transition-colors hover:text-gray-700"
              title={t('common.close')}
            >
              &times;
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-[#e0e0e0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-medium text-[#1976d2]">
              {t('device.deviceName')}
            </span>
            <div
              className="flex items-center justify-end gap-2 text-lg text-[#222]"
              style={{ minWidth: 80 }}
            >
              <span>{deviceNode.device_name}</span>
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-medium text-[#1976d2]">
              {t('device.nickName')}
            </span>
            <div
              className="flex items-center justify-end gap-2 text-lg text-[#222]"
              style={{ minWidth: 80 }}
            >
              <span>{currentNickname}</span>
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-medium text-[#1976d2]">
              {deviceNode?.vertex_type
                ? t('device.ipAddress')
                : t('device.managementIp')}
            </span>
            <div className="ml-4 flex flex-col items-end">
              {deviceNode.ip && deviceNode.ip.length === 1 ? (
                <span className="text-lg text-[#222]">
                  {getIpString(deviceNode.ip[0])}
                </span>
              ) : deviceNode.ip && deviceNode.ip.length > 1 ? (
                <div className="flex flex-col items-end space-y-1">
                  {deviceNode.ip.map((ip: number, index: number) => (
                    <span key={index} className="text-lg text-[#222]">
                      {getIpString(ip)}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-lg text-[#222]">
                  {t('device.unavailable')}
                </span>
              )}
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-medium text-[#1976d2]">
              {t('device.deviceDpid')}
            </span>
            <span className="ml-4 text-lg text-[#222]">
              {deviceNode.dpid || 'none'}
            </span>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-medium text-[#1976d2]">
              {t('device.status')}
            </span>
            <span
              className={`ml-4 text-lg ${deviceNode.is_up ? 'text-green-600' : 'text-red-600'}`}
            >
              {deviceNode.is_up ? t('device.online') : t('device.offline')}
            </span>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-medium text-[#1976d2]">
              {t('device.currentTime')}
            </span>
            <span className="ml-4 text-lg text-[#222]">
              {new Date(currentTime).toLocaleString()}
            </span>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-medium text-[#1976d2]">
              {t('device.vertexType')}
            </span>
            <span className="ml-4 text-lg text-[#222]">
              {deviceNode.vertex_type === 0
                ? t('device.switch')
                : t('device.host')}
            </span>
          </div>
        </div>
      </div>
    </Draggable>
  );
}

export default AvailabilityDeviceInformation;
