import {
  get_graph_data,
  get_flow_table_data,
  get_top_k_flow_table_data,
  get_cpu_utilization,
  get_memory_utilization,
  get_temperature,
  get_nickname,
  modify_device_name,
  node_positions,
  flowEntry,
} from './index';

export const apiService = {
  // Graph data management from the NDT api
  getGraphData: async () => get_graph_data.get_graph_data(),
  getFlowTableData: async () => get_flow_table_data.get_flow_table_data(),
  getTopKFlowTableData: async (k: number) =>
    get_top_k_flow_table_data.get_top_k_flow_table_data(k),
  getCPUUtilization: async () => get_cpu_utilization.get_cpu_utilization(),
  getMemoryUtilization: async () =>
    get_memory_utilization.get_memory_utilization(),
  getTemperature: async () => get_temperature.get_temperature(),
  getNickname: async (params: { dpid?: number; mac?: string; name?: string }) =>
    get_nickname.get_nickname(params),
  modifyDeviceName: async (params: any) =>
    modify_device_name.modify_device_name(params),
  modifyNickName: async (params: {
    identifier: { type: 'dpid' | 'mac' | 'name'; value: number | string };
    new_nickname: string;
  }) => modify_device_name.modify_nickname(params),
  installModifyDeleteFlowEntries: async (params: any) =>
    flowEntry.install_modify_delete_flow_entries(params),
  getSwitchOpenflowTable: async () =>
    flowEntry.get_switch_openflow_table_entries(),

  // Node position management (direct PostgreSQL connection)
  getNodePositions: async () => node_positions.load(),
  saveNodePositions: async (nodes: any) => node_positions.save(nodes),
};
