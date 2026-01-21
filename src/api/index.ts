const NDT_API_BASE_URL = import.meta.env.VITE_NDT_API_BASE_URL;

// Local API server for node positions (runs in Docker, accessible from browser)
const NODE_POSITIONS_API_URL =
  import.meta.env.VITE_NODE_POSITIONS_API_URL || 'http://localhost:3001';

export const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || `API Error: ${response.status}`);
  }
  const jsonData = await response.json();
  return jsonData;
};

const fetchApi = async (endpoint: string, options = {}) => {
  try {
    const response = await fetch(`${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options as any).headers,
      },
    });
    return handleResponse(response);
  } catch (error) {
    console.error(`API request failed: ${endpoint}`);
    throw error;
  }
};

// Authentication removed - no longer needed

export const get_graph_data = {
  get_graph_data: async () =>
    fetchApi(`${NDT_API_BASE_URL}/ndt/get_graph_data`),
};

export const get_cpu_utilization = {
  get_cpu_utilization: async () =>
    fetchApi(`${NDT_API_BASE_URL}/ndt/get_cpu_utilization`),
};

export const get_memory_utilization = {
  get_memory_utilization: async () =>
    fetchApi(`${NDT_API_BASE_URL}/ndt/get_memory_utilization`),
};

export const get_temperature = {
  get_temperature: async () =>
    fetchApi(`${NDT_API_BASE_URL}/ndt/get_temperature`),
};

export const get_nickname = {
  get_nickname: async (params: {
    dpid?: number;
    mac?: string;
    name?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params.dpid !== undefined) {
      queryParams.append('dpid', params.dpid.toString());
    } else if (params.mac) {
      queryParams.append('mac', params.mac);
    } else if (params.name) {
      queryParams.append('name', params.name);
    }

    const url = `${NDT_API_BASE_URL}/ndt/get_nickname${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return fetchApi(url);
  },
};

export const get_flow_table_data = {
  get_flow_table_data: async () =>
    fetchApi(`${NDT_API_BASE_URL}/ndt/get_detected_flow_data`),
};

export const modify_device_name = {
  modify_device_name: async ({
    vertex_type,
    dpid,
    mac,
    new_name,
  }: {
    vertex_type: number;
    dpid?: number;
    mac?: string;
    new_name: string;
  }) => {
    const body: any = { vertex_type, new_name };
    if (vertex_type === 0 && dpid !== undefined) {
      body.dpid = dpid;
    } else if (vertex_type === 1 && mac) {
      body.mac = mac;
    }
    return fetchApi(`${NDT_API_BASE_URL}/ndt/modify_device_name`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  modify_nickname: async (params: {
    identifier: { type: 'dpid' | 'mac' | 'name'; value: number | string };
    new_nickname: string;
  }) => {
    return fetchApi(`${NDT_API_BASE_URL}/ndt/modify_nickname`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};

// Flow entry management APIs
export const flowEntry = {
  // New batch operation API
  // According to API spec:
  // - install_flow_entries: dpid, match, actions required; priority optional (defaults to 0)
  // - modify_flow_entries: dpid, match, actions required; priority optional (defaults to 0)
  // - delete_flow_entries: dpid, match required
  install_modify_delete_flow_entries: async (data: {
    install_flow_entries?: Array<{
      dpid: number;
      priority?: number;
      match: object;
      actions: Array<{
        type: string;
        port?: number;
      }>;
    }>;
    modify_flow_entries?: Array<{
      dpid: number;
      priority?: number;
      match: object;
      actions: Array<{
        type: string;
        port?: number;
      }>;
    }>;
    delete_flow_entries?: Array<{
      dpid: number;
      priority?: number;
      match: object;
    }>;
  }) =>
    fetchApi(
      `${NDT_API_BASE_URL}/ndt/install_flow_entries_modify_flow_entries_and_delete_flow_entries`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  get_switch_openflow_table_entries: async () =>
    fetchApi(`${NDT_API_BASE_URL}/ndt/get_switch_openflow_table_entries`),
};

// This function saves and loads the positions of nodes in the topology
// Uses PostgreSQL database via local API server
export const node_positions = {
  save: async (nodes: any[]) => {
    try {
      // Transform node data to match database schema
      // nodes have: { id, x, y, type }
      // database expects: { node_id, x, y, type }
      const nodePositions = nodes.map(node => ({
        node_id: node.id,
        x: parseFloat(node.x.toString()),
        y: parseFloat(node.y.toString()),
        type: node.type || null,
      }));

      console.log(
        `Saving node positions to: ${NODE_POSITIONS_API_URL}/api/node_positions`
      );
      const response = await fetchApi(
        `${NODE_POSITIONS_API_URL}/api/node_positions`,
        {
          method: 'POST',
          body: JSON.stringify({ nodes: nodePositions }),
        }
      );

      console.log(`Successfully saved ${nodePositions.length} node positions`);
      return {
        success: true,
        message: 'Node positions saved to PostgreSQL',
        ...response,
      };
    } catch (error) {
      console.error('Failed to save node positions:', error);
      console.error(
        `API URL was: ${NODE_POSITIONS_API_URL}/api/node_positions`
      );
      // Fallback to localStorage if API fails
      try {
        localStorage.setItem('node_positions', JSON.stringify({ nodes }));
        console.warn('Fell back to localStorage due to API error');
        return {
          success: true,
          message: 'Node positions saved to localStorage (fallback)',
        };
      } catch (localError) {
        console.error('Failed to save to localStorage:', localError);
        throw error;
      }
    }
  },
  load: async () => {
    try {
      console.log(
        `Loading node positions from: ${NODE_POSITIONS_API_URL}/api/node_positions`
      );
      const response = await fetchApi(
        `${NODE_POSITIONS_API_URL}/api/node_positions`
      );

      // Response should have: { success: true, nodes: [{ node_id, x, y, type }] }
      if (response.success && response.nodes) {
        console.log(
          `Successfully loaded ${response.nodes.length} node positions`
        );
        return {
          success: true,
          nodes: response.nodes,
        };
      }

      return { success: true, nodes: [] };
    } catch (error) {
      console.error('Failed to load node positions from API:', error);
      console.error(
        `API URL was: ${NODE_POSITIONS_API_URL}/api/node_positions`
      );
      // Fallback to localStorage if API fails
      try {
        const stored = localStorage.getItem('node_positions');
        if (stored) {
          const data = JSON.parse(stored);
          // Transform localStorage data to match expected format
          const nodes = (data.nodes || []).map((node: any) => ({
            node_id: node.id || node.node_id,
            x: node.x,
            y: node.y,
            type: node.type || null,
          }));
          console.warn('Loaded from localStorage (fallback)');
          return { success: true, nodes };
        }
        return { success: true, nodes: [] };
      } catch (localError) {
        console.error('Failed to load from localStorage:', localError);
        return { success: false, nodes: [] };
      }
    }
  },
};
