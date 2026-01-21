import { NETWORK_CONSTANTS } from './constants';

export const getIpString = (ip: number): string => {
  return (
    (ip & 0xff) +
    '.' +
    ((ip >>> 8) & 0xff) +
    '.' +
    ((ip >>> 16) & 0xff) +
    '.' +
    ((ip >>> 24) & 0xff)
  );
};

export const mac2string = (mac: number): string => {
  return (
    mac
      .toString(16)
      .padStart(12, '0')
      .match(/.{1,2}/g)
      ?.join(':') ?? ''
  );
};

export const formatBandwidth = (bps: number): string => {
  if (bps === undefined || bps === null) return 'N/A';

  const { GBPS, MBPS, KBPS } = NETWORK_CONSTANTS.BANDWIDTH_THRESHOLDS;

  if (bps >= GBPS) {
    return `${(bps / GBPS).toFixed(2)} Gbps`;
  }
  if (bps >= MBPS) {
    return `${(bps / MBPS).toFixed(2)} Mbps`;
  }
  if (bps >= KBPS) {
    return `${(bps / KBPS).toFixed(2)} Kbps`;
  }
  return `${Math.round(bps)} bps`;
};

export const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-TW', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const formatDeviceName = (device: {
  device_name?: string;
  ip?: number;
  dpid?: number;
}): string => {
  if (device.device_name) {
    return device.device_name;
  }
  if (device.ip) {
    return getIpString(device.ip);
  }
  if (device.dpid) {
    return device.dpid.toString();
  }
  return 'Unknown Device';
};
