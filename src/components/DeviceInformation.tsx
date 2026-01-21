import React, { useState, useRef } from 'react';
import Draggable from 'react-draggable';
import { useTranslation } from 'react-i18next';
import { apiService } from '../api/apiService';
import { usePolling } from '../hooks/usePolling';
import { useGraphData } from './GraphDataManager';
import { HiPencilAlt } from 'react-icons/hi';
import { getIpString, mac2string } from '../utils/formatters';
import type { GraphDataType } from '../types';

interface UtilizationDataType {
  [key: string]: number;
}

interface DeviceProps {
  data: string | number | null;
  onClose: () => void;
  onShowSwitchPorts?: () => void;
  isSwitchPortsVisible?: boolean;
}

function DeviceInformation({
  data,
  onClose,
  onShowSwitchPorts,
  isSwitchPortsVisible,
}: DeviceProps) {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [editingDeviceName, setEditingDeviceName] = useState(false);
  const [editingNickName, setEditingNickName] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newNickName, setNewNickName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deviceNameError, setDeviceNameError] = useState('');
  const [nickNameError, setNickNameError] = useState('');

  const { graphData }: { graphData: GraphDataType[]; lastUpdated: any } =
    useGraphData();

  // Get device node first to determine parameters for API calls
  const deviceId = typeof data === 'string' ? data : String(data);
  const deviceNode = graphData[graphData.length - 1]?.nodes.find(node => {
    if (node.vertex_type === 0) {
      // Switch nodes - match by dpid
      return String(node.dpid) === deviceId;
    } else {
      // Host nodes - match by device_name
      return node.device_name === deviceId || `host_${node.mac}` === deviceId;
    }
  });

  const cpuPolling = usePolling<UtilizationDataType>({
    fetcher: apiService.getCPUUtilization,
    interval: 10000,
    autoStart: true,
    dependencies: [data],
  });
  const memoryPolling = usePolling<UtilizationDataType>({
    fetcher: apiService.getMemoryUtilization,
    interval: 10000,
    autoStart: true,
    dependencies: [data],
  });
  const temperaturePolling = usePolling<UtilizationDataType>({
    fetcher: apiService.getTemperature,
    interval: 10000,
    autoStart: true,
    dependencies: [data],
  });

  const error =
    cpuPolling.error || memoryPolling.error || temperaturePolling.error;
  const cpuData = cpuPolling.data;
  const memoryData = memoryPolling.data;
  const temperatureData = temperaturePolling.data;

  if (!data) {
    return null;
  }

  if (error || !graphData[graphData.length - 1]) {
    return (
      <div className="fixed bottom-10 right-10 h-1/3 w-1/4 rounded-lg border-2 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-bold text-[#333]">
          {t('device.title')}
        </h2>
        <p className="text-gray-500">
          {error ? String(error) : t('device.errorOccurred')}
        </p>
      </div>
    );
  }

  if (!deviceNode) {
    return (
      <div className="fixed bottom-10 right-10 h-1/3 w-1/4 rounded-lg border-2 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-bold text-[#333]">
          {t('device.title')}
        </h2>
        <p className="text-gray-500">{t('device.deviceNotFound')}</p>
      </div>
    );
  }

  const deviceIpString =
    deviceNode.ip.length > 0 ? getIpString(deviceNode.ip[0]) : '';
  const cpuUtilization =
    cpuData && deviceIpString ? cpuData[deviceIpString] || 0 : 0;
  const memoryUtilization =
    memoryData && deviceIpString ? memoryData[deviceIpString] || 0 : 0;
  const temperatureValue =
    temperatureData && deviceIpString ? temperatureData[deviceIpString] : 0;
  const currentNickname = deviceNode.nickname || deviceNode.device_name || '';

  const handleDeviceNameDoubleClick = () => {
    setEditingDeviceName(true);
    setNewDeviceName(deviceNode.device_name);
  };

  const handleNickNameDoubleClick = () => {
    setEditingNickName(true);
    setNewNickName(currentNickname);
  };

  const handleDeviceNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value.length > 4) {
      setDeviceNameError(t('device.nameTooLong'));
      return;
    }
    setDeviceNameError('');
    setNewDeviceName(e.target.value);
  };

  const handleNickNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value.length > 4) {
      setNickNameError(t('device.nameTooLong'));
      return;
    }
    setNickNameError('');
    setNewNickName(e.target.value);
  };

  const handleDeviceNameKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Enter' && newDeviceName.trim() && !saving) {
      setSaving(true);
      try {
        if (deviceNode.vertex_type === 0) {
          await apiService.modifyDeviceName({
            vertex_type: 0,
            dpid: deviceNode.dpid ?? undefined,
            new_name: newDeviceName.trim(),
          });
        } else if (deviceNode.vertex_type === 1) {
          await apiService.modifyDeviceName({
            vertex_type: 1,
            mac: mac2string(deviceNode.mac),
            new_name: newDeviceName.trim(),
          });
        }
        setEditingDeviceName(false);
        setNewDeviceName('');
        cpuPolling.manualRefresh();
        memoryPolling.manualRefresh();
      } catch (error) {
        alert('Failed to save device name');
      } finally {
        setSaving(false);
      }
    } else if (e.key === 'Escape') {
      setEditingDeviceName(false);
      setNewDeviceName('');
      setDeviceNameError('');
    }
  };

  const handleNickNameKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Enter' && newNickName.trim() && !saving) {
      setSaving(true);
      try {
        let identifier;

        if (deviceNode.vertex_type === 0 && deviceNode.dpid) {
          identifier = { type: 'dpid' as const, value: deviceNode.dpid };
        } else if (deviceNode.vertex_type === 1 && deviceNode.mac) {
          identifier = {
            type: 'mac' as const,
            value: mac2string(deviceNode.mac),
          };
        } else if (deviceNode.device_name) {
          identifier = { type: 'name' as const, value: deviceNode.device_name };
        } else {
          throw new Error('No valid identifier found for device');
        }

        await apiService.modifyNickName({
          identifier,
          new_nickname: newNickName.trim(),
        });

        setEditingNickName(false);
        setNewNickName('');
      } catch (error) {
        alert('Failed to save nickname');
      } finally {
        setSaving(false);
      }
    } else if (e.key === 'Escape') {
      setEditingNickName(false);
      setNewNickName('');
      setNickNameError('');
    }
  };

  return (
    // @ts-expect-error - Draggable component type issue
    <Draggable nodeRef={nodeRef} handle=".drag-handle">
      <div
        ref={nodeRef}
        className="fixed bottom-2 right-4 w-1/3 rounded-lg border-2 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] p-6 shadow-lg"
      >
        <div className="drag-handle mb-6 flex cursor-move items-center justify-between">
          <h2 className="mb-2 text-2xl font-bold text-[#333]">
            {t('device.title')}
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
              {editingDeviceName ? (
                <div className="flex flex-col">
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={newDeviceName}
                      onChange={handleDeviceNameChange}
                      onKeyDown={handleDeviceNameKeyDown}
                      onBlur={() => {
                        setEditingDeviceName(false);
                        setNewDeviceName('');
                        setDeviceNameError('');
                      }}
                      autoFocus
                      className="border-b border-blue-400 px-1 text-lg focus:outline-none"
                      disabled={saving}
                      style={{ minWidth: 80 }}
                    />
                  </div>
                  {deviceNameError && (
                    <p className="mt-1 text-sm text-red-500">
                      {deviceNameError}
                    </p>
                  )}
                </div>
              ) : (
                <span
                  onDoubleClick={handleDeviceNameDoubleClick}
                  style={{ cursor: 'pointer' }}
                >
                  {deviceNode.device_name}
                </span>
              )}
              <HiPencilAlt
                onClick={handleDeviceNameDoubleClick}
                className="cursor-pointer text-gray-500 hover:text-gray-700"
              />
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
              {editingNickName ? (
                <div className="flex flex-col">
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={newNickName}
                      onChange={handleNickNameChange}
                      onKeyDown={handleNickNameKeyDown}
                      onBlur={() => {
                        setEditingNickName(false);
                        setNewNickName('');
                        setNickNameError('');
                      }}
                      autoFocus
                      className="border-b border-blue-400 px-1 text-lg focus:outline-none"
                      disabled={saving}
                      style={{ minWidth: 80 }}
                    />
                  </div>
                  {nickNameError && (
                    <p className="mt-1 text-sm text-red-500">{nickNameError}</p>
                  )}
                </div>
              ) : (
                <span
                  onDoubleClick={handleNickNameDoubleClick}
                  style={{ cursor: 'pointer' }}
                >
                  {deviceNode.nickname}
                </span>
              )}
              <HiPencilAlt
                onClick={handleNickNameDoubleClick}
                className="cursor-pointer text-gray-500 hover:text-gray-700"
              />
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-medium text-[#1976d2]">
              {deviceNode?.vertex_type
                ? t('device.ipAddress')
                : t('device.managementIp')}
            </span>
            <div className="ml-4 flex flex-col items-end">
              {deviceNode.ip.length === 1 ? (
                <span className="text-lg text-[#222]">
                  {getIpString(deviceNode.ip[0])}
                </span>
              ) : (
                <div className="flex flex-col items-end space-y-1">
                  {deviceNode.ip.map((ip, index) => (
                    <span key={index} className="text-lg text-[#222]">
                      {getIpString(ip)}
                    </span>
                  ))}
                </div>
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
              {t('device.cpuUtilization')}
            </span>
            <span className="ml-4 text-lg text-[#222]">
              {cpuUtilization === -1
                ? t('device.unavailable')
                : `${cpuUtilization}%`}
            </span>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-medium text-[#1976d2]">
              {t('device.memoryUtilization')}
            </span>
            <span className="ml-4 text-lg text-[#222]">
              {memoryUtilization === -1
                ? t('device.unavailable')
                : `${memoryUtilization}%`}
            </span>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-medium text-[#1976d2]">
              {t('device.temperature')}
            </span>
            <span className="ml-4 text-lg text-[#222]">
              {temperatureValue === -1
                ? t('device.unavailable')
                : typeof temperatureValue === 'number' &&
                    Number.isInteger(temperatureValue)
                  ? `${temperatureValue}°C`
                  : temperatureValue || t('device.unavailable')}
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
        </div>
      </div>
    </Draggable>
  );
}

export default DeviceInformation;
