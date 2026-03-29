export interface FlowSetType {
  src_ip: number;
  dst_ip: number;
  protocol_number?: number;
  protocol_id?: number;
  src_port?: number;
  dst_port?: number;
}

export interface FlowDataType {
  dst_ip: number;
  dst_port: number;
  estimated_flow_sending_rate_bps_in_the_proceeding_1sec_timeslot: number;
  estimated_packet_rate_in_the_last_sec: number;
  estimated_packet_rate_in_the_proceeding_1sec_timeslot: number;
  first_sampled_time: string;
  latest_sampled_time: string;
  path: Array<{ node: number; interface: number }>;
  protocol_id: number;
  src_ip: number;
  src_port: number;
}

export interface FlowEntryType {
  dpid: number;
  flows: {
    [key: string]: Array<{
      actions: string[];
      byte_count?: number;
      cookie: number;
      duration_nsec?: number;
      duration_sec?: number;
      flags: number;
      hard_timeout: number;
      idle_timeout: number;
      length: number;
      match: {
        dl_dst?: string;
        dl_type?: number;
        nw_dst?: string;
        nw_src?: string;
        in_port?: number;
        [key: string]: any;
      };
      packet_count?: number;
      priority: number;
      table_id: number;
    }>;
  };
}

export interface SelectedFlow {
  dpid: number;
  flow: {
    match: any;
    actions: any[];
    [key: string]: any;
  };
}

export interface FlowDataContextType {
  flowDataHistory: FlowDataType[][];
  lastUpdated: Date | null;
}

export interface LinkProps {
  data: { src: number; dst: number } | null;
  onClose: () => void;
}

export interface PerLinkFlowGraphProps {
  selectedFlows: FlowSetType[];
  onClose: () => void;
}
