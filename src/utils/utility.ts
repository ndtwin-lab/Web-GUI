export const getDeviceNameFromDPID = (dpid: number, nodes: any[]): string => {
  const node = nodes.find(n => n.dpid == dpid);
  return node ? node.device_name : dpid.toString();
};

export const getDeviceNameFromIp = (ip: number, nodes: any[]): string => {
  const node = nodes.find(n => {
    if (Array.isArray(n.ip)) {
      return n.ip.includes(ip);
    }
    return n.ip === ip;
  });

  if (node) {
    return node.device_name;
  }

  return ip.toString();
};
