export interface GraphNode {
  device_name: string;
  dpid: number | null;
  ip: number[];
  is_enabled: boolean;
  is_up: boolean;
  mac: number;
  nickname: string;
  vertex_type: number;
  brand_name: string;
  device_layer: number;
}

export interface GraphEdge {
  dst_dpid: number;
  dst_ip: number | number[];
  dst_interface?: number;
  flow_set: Array<{
    dst_ip: number;
    src_ip: number;
    dst_port: number;
    protocol_number: number;
    src_port: number;
  }>;
  is_up: boolean;
  is_enabled: boolean;
  left_link_bandwidth_bps: number;
  link_bandwidth_bps: number;
  link_bandwidth_usage_bps: number;
  link_bandwidth_utilization_percent: number;
  src_dpid: number;
  src_ip: number | number[];
  src_interface?: number;
}

export interface GraphDataType {
  nodes: GraphNode[];
  edges: GraphEdge[];
  timestamp?: string;
}

export interface GraphDataContextType {
  graphData: GraphDataType[];
  lastUpdated: Date | null;
}
