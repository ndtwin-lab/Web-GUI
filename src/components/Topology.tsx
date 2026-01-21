import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import cytoscape from 'cytoscape';
// @ts-expect-error - cytoscape-grid-guide module type issue
import gridGuide from 'cytoscape-grid-guide';
import { usePolling } from '../hooks/usePolling';
import { apiService } from '../api/apiService';
// import { useGraphData } from './GraphDataManager';
import { getIpString } from '../utils/formatters';
import type { GraphDataType } from '../types/graph';
import { getEdgeColorByUsage } from '../utils/colorUtils';

if (!cytoscape.prototype.hasInitialised) {
  gridGuide(cytoscape);
  cytoscape.prototype.hasInitialised = true;
}

interface TopologyProps {
  onNodeSelect: (nodeId: string | null) => void;
  onEdgeSelect: (
    edgeData: {
      src: number | string;
      dst: number | string;
      direction?: 'src2dst' | 'dst2src';
    } | null
  ) => void;
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  multiSelectMode?: boolean;
}

export interface TopologyRef {
  clearHighlights: () => void;
  clearHighlightedEdge: (edgeId: string) => void;
  clearHighlightedNode: (nodeId: string) => void;
  highlightPortLink: (linkId: string) => void;
  clearPortHighlight: () => void;
}

function getFatTreePositions(
  graphData: any,
  processedNodes?: Map<string, any>
) {
  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) return {};

  const allGraphNodes = graphData.nodes;
  const allGraphEdges = graphData.edges || {};

  const nodesToProcess = processedNodes
    ? Array.from(processedNodes.values())
    : allGraphNodes;

  const layerMap = new Map<number, any[]>();
  nodesToProcess.forEach((n: any) => {
    const layer = n.device_layer;
    if (!layerMap.has(layer)) {
      layerMap.set(layer, []);
    }
    layerMap.get(layer)!.push(n);
  });

  const layers = Array.from(layerMap.keys()).sort((a, b) => a - b);

  let coreSwitches: any[] = [];
  let aggSwitches: any[] = [];
  let edgeSwitches: any[] = [];
  let hosts: any[] = [];

  if (layers.length >= 4) {
    // 4 layers or more: the smallest layer is core, the largest layer is host
    coreSwitches = layerMap.get(layers[0]) || [];
    aggSwitches = layerMap.get(layers[1]) || [];
    edgeSwitches = layerMap.get(layers[2]) || [];
    hosts = layerMap.get(layers[layers.length - 1]) || [];
  } else if (layers.length === 3) {
    // 3 layers: the first layer is aggregation, the second layer is edge, the third layer is host
    aggSwitches = layerMap.get(layers[0]) || [];
    edgeSwitches = layerMap.get(layers[1]) || [];
    hosts = layerMap.get(layers[2]) || [];
  } else if (layers.length === 2) {
    // 2 layers: the first layer is switch, the second layer is host
    edgeSwitches = layerMap.get(layers[0]) || [];
    hosts = layerMap.get(layers[1]) || [];
  } else {
    // Only one layer, treat all as edge switches
    edgeSwitches = layerMap.get(layers[0]) || [];
  }

  // console.log(`Core switches: ${coreSwitches.length}, Agg switches: ${aggSwitches.length}, Edge switches: ${edgeSwitches.length}, Hosts: ${hosts.length}`);

  const hostsByEdgeSwitch = new Map<string, any[]>();
  edgeSwitches.forEach((s: any) => hostsByEdgeSwitch.set(String(s.dpid), []));

  // IP alias - now we group hosts by their device_name
  const hostGroups = new Map<string, any>();
  hosts.forEach((host: any) => {
    if (!hostGroups.has(host.device_name)) {
      hostGroups.set(host.device_name, host);
    }
  });

  // Assign hosts to edge switches
  hostGroups.forEach((host: any) => {
    const hostIps = Array.isArray(host.ip) ? host.ip : [host.ip];
    // Find which edge switch this host connects to
    for (const edgeKey in allGraphEdges) {
      const edge = allGraphEdges[edgeKey];
      const srcIps = Array.isArray(edge.src_ip) ? edge.src_ip : [edge.src_ip];
      const dstIps = Array.isArray(edge.dst_ip) ? edge.dst_ip : [edge.dst_ip];

      // Check if any of the host's IPs connect to an edge switch
      const connectingIp = hostIps.find(
        (hostIp: any) =>
          (srcIps.includes(hostIp) && edge.dst_dpid && edge.dst_dpid !== 0) ||
          (dstIps.includes(hostIp) && edge.src_dpid && edge.src_dpid !== 0)
      );

      if (connectingIp) {
        const edgeSwitchId = String(edge.dst_dpid || edge.src_dpid);
        if (hostsByEdgeSwitch.has(edgeSwitchId)) {
          hostsByEdgeSwitch.get(edgeSwitchId)!.push(host);
          break;
        }
      }
    }
  });

  const x_spacing_host = 80;
  const y_core = -800;
  const y_agg = -200;
  const y_edge = 400;
  const y_host = 800;

  let totalHostCount = 0;
  hostsByEdgeSwitch.forEach(hosts => {
    totalHostCount += hosts.length;
  });
  const totalWidth = Math.max(800, (totalHostCount - 1) * x_spacing_host + 200);

  const edgeCount = edgeSwitches.length;
  let edgeSwitchX: number[] = [];
  if (edgeCount === 1) {
    edgeSwitchX = [totalWidth / 2];
  } else if (edgeCount > 1) {
    edgeSwitchX = edgeSwitches.map(
      (_: any, i: number) => (i * totalWidth) / (edgeCount - 1)
    );
  }

  const aggCount = aggSwitches.length;
  let aggSwitchX: number[] = [];
  if (aggCount === 1) {
    aggSwitchX = [totalWidth / 2];
  } else if (aggCount > 1) {
    aggSwitchX = aggSwitches.map(
      (_: any, i: number) => (i * totalWidth) / (aggCount - 1)
    );
  }

  const coreCount = coreSwitches.length;
  let coreSwitchX: number[] = [];
  if (coreCount === 1) {
    coreSwitchX = [
      aggSwitchX.length > 1
        ? (aggSwitchX[0] + aggSwitchX[aggSwitchX.length - 1]) / 2
        : totalWidth / 2,
    ];
  } else if (coreCount > 1 && aggSwitchX.length > 1) {
    const left = aggSwitchX[0];
    const right = aggSwitchX[aggSwitchX.length - 1];
    const coreSpacing = (right - left) / coreCount;
    const start = left + coreSpacing / 2;
    coreSwitchX = coreSwitches.map(
      (_: any, i: number) => start + i * coreSpacing
    );
  } else if (coreCount > 1) {
    coreSwitchX = coreSwitches.map(
      (_: any, i: number) => (i * totalWidth) / (coreCount - 1)
    );
  }

  const hostPositions: { id: string; x: number; y: number }[] = [];
  edgeSwitches.forEach((s: any, i: number) => {
    const edgeId = String(s.dpid);
    const hosts = hostsByEdgeSwitch.get(edgeId) || [];
    const n = hosts.length;
    if (n === 0) return;
    const startX = edgeSwitchX[i] - ((n - 1) * x_spacing_host) / 2;
    hosts.forEach((host: any, j: number) => {
      const id = host.device_name; // Use device_name for hosts
      hostPositions.push({ id, x: startX + j * x_spacing_host, y: y_host });
    });
  });

  const nodePositions = new Map<string, { x: number; y: number }>();
  // core
  coreSwitches.forEach((node: any, i: number) => {
    const id = String(node.dpid);
    nodePositions.set(id, { x: coreSwitchX[i], y: y_core });
    // console.log(`Core switch ${id} position:`, { x: coreSwitchX[i], y: y_core });
  });
  // aggregation
  aggSwitches.forEach((node: any, i: number) => {
    const id = String(node.dpid);
    nodePositions.set(id, { x: aggSwitchX[i], y: y_agg });
    // console.log(`Agg switch ${id} position:`, { x: aggSwitchX[i], y: y_agg });
  });
  // edge
  edgeSwitches.forEach((node: any, i: number) => {
    const id = String(node.dpid);
    nodePositions.set(id, { x: edgeSwitchX[i], y: y_edge });
    // console.log(`Edge switch ${id} position:`, { x: edgeSwitchX[i], y: y_edge });
  });
  // hosts
  hostPositions.forEach(({ id, x, y }) => {
    nodePositions.set(id, { x, y });
    // console.log(`Host ${id} position:`, { x, y });
  });

  const posObj: Record<string, { x: number; y: number }> = {};
  nodePositions.forEach((v, k) => {
    posObj[k] = v;
  });

  // console.log(`Total positions calculated: ${Object.keys(posObj).length}`);
  return posObj;
}

const Topology = forwardRef<TopologyRef, TopologyProps>(
  (
    {
      onNodeSelect,
      onEdgeSelect,
      width,
      height,
      className,
      style,
      selectedNodeId,
      selectedEdgeId,
      multiSelectMode = false,
    },
    ref
  ) => {
    const DEFAULT_REFRESH_INTERVAL = 1;
    const cyRef = useRef<HTMLDivElement>(null);
    const cyInstance = useRef<cytoscape.Core | null>(null);

    const [graphData, setGraphData] = useState<GraphDataType>({
      nodes: [],
      edges: [],
    });
    const [highlightedEdges, setHighlightedEdges] = useState<string[]>([]);
    const [highlightedNodes, setHighlightedNodes] = useState<string[]>([]);
    const [refreshInterval, setRefreshInterval] = useState(
      DEFAULT_REFRESH_INTERVAL
    ); // seconds
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [hasFit, setHasFit] = useState(false);

    const manualNodePositions = useRef<
      Record<string, { x: number; y: number }>
    >({});

    const polling = usePolling<GraphDataType>({
      fetcher: apiService.getGraphData,
      interval: refreshInterval * 1000,
      autoStart: true,
      dependencies: [refreshInterval],
    });

    useImperativeHandle(ref, () => ({
      clearHighlights: () => {
        setHighlightedEdges([]);
        if (cyInstance.current) {
          cyInstance.current.edges().removeClass('highlighted');
        }
      },
      clearHighlightedEdge: (edgeId: string) => {
        setHighlightedEdges(prev => prev.filter(id => id !== edgeId));
        if (cyInstance.current) {
          const edge = cyInstance.current.getElementById(edgeId);
          if (edge) {
            edge.removeClass('highlighted');
          }
        }
      },
      clearHighlightedNode: (nodeId: string) => {
        setHighlightedNodes(prev => prev.filter(id => id !== nodeId));
        if (cyInstance.current) {
          const node = cyInstance.current.getElementById(nodeId);
          if (node) {
            node.removeClass('highlighted');
          }
        }
      },
      highlightPortLink: (linkId: string) => {
        if (cyInstance.current) {
          cyInstance.current.edges().removeClass('port-highlighted');
          const edge = cyInstance.current.getElementById(linkId);
          if (edge) {
            edge.addClass('port-highlighted');
          }
        }
      },
      clearPortHighlight: () => {
        if (cyInstance.current) {
          cyInstance.current.edges().removeClass('port-highlighted');
        }
      },
    }));

    useEffect(() => {
      if (!cyRef.current || cyInstance.current) return;
      const cy = cytoscape({
        container: cyRef.current,
        elements: [],
        style: [
          {
            selector: 'node',
            css: {
              'background-color': (ele: any) =>
                ele.data('is_up') ? '#4CAF50' : '#F44336',
              'border-width': 0.5,
              'border-color': '#ccc',
              width: (ele: any) => (ele.data('type') === 'switch' ? 80 : 40),
              height: (ele: any) => (ele.data('type') === 'switch' ? 80 : 40),
              shape: (ele: any) =>
                ele.data('type') === 'switch' ? 'ellipse' : 'rectangle',
              label: 'data(name)',
              'font-size': (ele: any) =>
                ele.data('type') === 'switch' ? 36 : 12,
              color: '#222',
              'text-valign': 'center',
              'text-halign': 'center',
              'text-wrap': 'wrap',
              'text-max-width': 60,
              'z-index': 10,
              'transition-property':
                'background-color, border-color, border-width',
              'transition-duration': '0.2s',
            },
          },
          {
            selector: 'node:parent',
            css: {
              'text-valign': 'bottom',
              'text-margin-y': 10,
              label: 'data(ip)',
              'font-size': 10,
              color: '#555',
            },
          },
          {
            selector: 'edge',
            css: {
              width: 12,
              'curve-style': 'bezier',
              'target-arrow-shape': 'triangle',
              'arrow-scale': 2.5,
              'target-arrow-color': (ele: any) => {
                const usage = ele.data('bandwidth_usage_percent') ?? 0;
                return getEdgeColorByUsage(usage);
              },
              'source-arrow-shape': 'none',
              opacity: 0.9,
              'line-color': (ele: any) => {
                const usage = ele.data('bandwidth_usage_percent') ?? 0;
                return getEdgeColorByUsage(usage);
              },
              'transition-property':
                'width, line-color, opacity, target-arrow-color',
              'transition-duration': '0.2s',
            },
          },
          {
            selector: 'edge.highlighted',
            css: {
              'line-color': '#9C27B0',
              'target-arrow-color': '#9C27B0',
              width: 18,
              opacity: 1,
              'z-index': 999,
            },
          },
          {
            selector: 'edge.port-highlighted',
            css: {
              'line-color': '#44ff00',
              'target-arrow-color': '#44ff00',
              width: 20,
              opacity: 1,
              'z-index': 1000,
              'line-style': 'solid',
            },
          },
          {
            selector: 'core',
            css: {
              'active-bg-opacity': 0, // press icon without focus
            },
          },
          {
            selector: 'node.highlighted',
            css: {
              'border-width': 4,
              'border-color': '#1976d2',
              'background-color': '#90caf9',
              'z-index': 999,
            },
          },
        ] as any,
        layout: { name: 'preset' },
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: false,
        autoungrabify: false,
      });
      cyInstance.current = cy;

      // grid guide
      // @ts-ignore
      if (cy.gridGuide) {
        // @ts-ignore
        cy.gridGuide({
          drawGrid: true,
          gridSize: 2,
          gridStackOrder: -1,
          gridColor: '#ccc',

          snapToGrid: true,
          snapToGridOnRelease: true,
          snapToGridDuringDrag: true,
          zoomDash: true,
          panGrid: true,

          drawGuideLines: true,
          guideLineStackOrder: 4,
          guideLineColor: '#0073ff',
          guideLineOpacity: 0.65,
          snapToAlignmentLocationOnRelease: true,
          snapToAlignmentLocationDuringDrag: true,
          distributionGuideLinesStackOrder: 4,
          distributionGuideLinesColor: '#ff0000',
          distributionGuideLinesOpacity: 0.65,
          snapToDistributionLocationOnRelease: false,
          snapToDistributionLocationDuringDrag: false,
          lineWidth: 1,
        });
      }

      let didFit = false;
      cy.on('render', () => {
        if (!didFit) {
          cy.fit(undefined, 40);
          didFit = true;
        }
      });

      cy.on('tap', 'node', event => {
        const nodeId = event.target.id();
        if (onNodeSelect) onNodeSelect(nodeId);
        if (onEdgeSelect) onEdgeSelect(null);
        setHighlightedNodes(prev => {
          if (multiSelectMode) {
            if (prev.includes(nodeId)) return prev;
            return [...prev, nodeId];
          } else {
            return [nodeId];
          }
        });
      });
      cy.on('tap', 'edge', event => {
        const edgeData = event.target.data();
        const src = edgeData.source;
        const dst = edgeData.target;
        // Determine direction: if edge ID is "src-dst", direction is src2dst
        // Convert node IDs to numbers if they are numeric strings (dpid), otherwise keep as strings
        const srcNum =
          typeof src === 'string' && !isNaN(Number(src)) ? Number(src) : src;
        const dstNum =
          typeof dst === 'string' && !isNaN(Number(dst)) ? Number(dst) : dst;
        if (onEdgeSelect)
          onEdgeSelect({
            src: srcNum,
            dst: dstNum,
            direction: 'src2dst', // The edge clicked is always in src->dst direction
          });
        if (onNodeSelect) onNodeSelect(null);
        const edgeId = event.target.id();
        setHighlightedEdges(prev => {
          if (prev.includes(edgeId)) return prev;
          return [...prev, edgeId];
        });
      });
      cy.on('position', 'node', event => {
        const node = event.target;
        manualNodePositions.current[node.id()] = {
          x: node.position('x'),
          y: node.position('y'),
        };
      });
    }, []);

    useEffect(() => {
      if (!cyInstance.current) return;
      const cy = cyInstance.current;
      const newNodeIds = new Set<string>();
      const newEdgeIds = new Set<string>();
      const allGraphNodes = graphData.nodes || [];
      const allGraphEdges = graphData.edges || {};

      const processedNodes = new Map<string, any>();

      allGraphNodes.forEach(n => {
        // For switches, use dpid as identifier
        if (n.vertex_type === 0) {
          const id = String(n.dpid);
          if (!processedNodes.has(id)) {
            processedNodes.set(id, {
              ...n,
              original_node: n,
            });
          }
        } else {
          // For hosts, use device_name as identifier to avoid creating multiple nodes for IP alias
          const id = n.device_name;
          if (!processedNodes.has(id)) {
            processedNodes.set(id, {
              ...n,
              original_node: n,
            });
          }
        }
      });

      // Handle edges and create virtual nodes for any missing nodes
      allGraphEdges.forEach(edge => {
        const srcIps = Array.isArray(edge.src_ip) ? edge.src_ip : [edge.src_ip];
        const dstIps = Array.isArray(edge.dst_ip) ? edge.dst_ip : [edge.dst_ip];

        // For source nodes
        if (edge.src_dpid && edge.src_dpid !== 0) {
          // This is a switch, use dpid
          const srcId = String(edge.src_dpid);
          if (!processedNodes.has(srcId)) {
            processedNodes.set(srcId, {
              device_name: `Switch_${edge.src_dpid}`,
              dpid: edge.src_dpid,
              ip: srcIps,
              is_enabled: true,
              is_up: true,
              mac: 0,
              vertex_type: 0,
              brand_name: '',
              device_layer: 1,
              original_node: null,
            });
          }
        } else {
          // This is a host, we need to find which host this IP belongs to
          srcIps.forEach((srcIp: any) => {
            // Find the host that contains this IP
            const hostNode = allGraphNodes.find(
              n =>
                n.vertex_type === 1 &&
                Array.isArray(n.ip) &&
                n.ip.includes(srcIp)
            );
            if (hostNode && !processedNodes.has(hostNode.device_name)) {
              processedNodes.set(hostNode.device_name, {
                ...hostNode,
                original_node: hostNode,
              });
            }
          });
        }

        // For destination nodes
        if (edge.dst_dpid && edge.dst_dpid !== 0) {
          // This is a switch, use dpid
          const dstId = String(edge.dst_dpid);
          if (!processedNodes.has(dstId)) {
            processedNodes.set(dstId, {
              device_name: `Switch_${edge.dst_dpid}`,
              dpid: edge.dst_dpid,
              ip: dstIps,
              is_enabled: true,
              is_up: true,
              mac: 0,
              vertex_type: 0,
              brand_name: '',
              device_layer: 1,
              original_node: null,
            });
          }
        } else {
          // This is a host, we need to find which host this IP belongs to
          dstIps.forEach((dstIp: any) => {
            // Find the host that contains this IP
            const hostNode = allGraphNodes.find(
              n =>
                n.vertex_type === 1 &&
                Array.isArray(n.ip) &&
                n.ip.includes(dstIp)
            );
            if (hostNode && !processedNodes.has(hostNode.device_name)) {
              processedNodes.set(hostNode.device_name, {
                ...hostNode,
                original_node: hostNode,
              });
            }
          });
        }
      });

      const fatTreePositions = getFatTreePositions(graphData, processedNodes);

      processedNodes.forEach((n, id) => {
        newNodeIds.add(id);
        // position priority: manual > SQL > fatTree > random
        const pos = manualNodePositions.current[id] ||
          fatTreePositions[id] || {
            x: Math.random() * 1000,
            y: Math.random() * 1000,
          };
        // console.log(`Node ${id} position:`, pos);

        // For hosts, show all IPs in the label
        const label =
          n.vertex_type === 0
            ? `${n.device_name}\n${getIpString(n.ip[0])}`
            : `${n.device_name}\n${n.ip.map((ip: any) => getIpString(ip)).join(', ')}`;

        if (!cy.getElementById(id).length) {
          cy.add({
            group: 'nodes',
            data: {
              name: n.device_name,
              id: id,
              label: label,
              type: n.vertex_type === 0 ? 'switch' : 'host',
              ip:
                n.vertex_type === 0
                  ? getIpString(n.ip[0])
                  : n.ip.map((ip: any) => getIpString(ip)).join(', '),
              is_up: n.is_up,
              is_enabled: n.is_enabled,
              icon: n.vertex_type === 0 ? 'switch' : 'host',
              // Store the original node data for device information
              original_node: n.original_node || n,
            },
            position: pos,
            selectable: true,
            grabbable: true,
          });
        } else {
          const node = cy.getElementById(id);
          node.data({
            name: n.device_name,
            label: label,
            type: n.vertex_type === 0 ? 'switch' : 'host',
            ip:
              n.vertex_type === 0
                ? getIpString(n.ip[0])
                : n.ip.map((ip: any) => getIpString(ip)).join(', '),
            is_up: n.is_up,
            is_enabled: n.is_enabled,
            icon: n.vertex_type === 0 ? 'switch' : 'host',
            // Store the original node data for device information
            original_node: n.original_node || n,
          });
        }
      });

      // Create directional edges - each API edge becomes one directional cytoscape edge
      const edgeSet = new Set<string>();
      for (const e in allGraphEdges) {
        const edge = allGraphEdges[e];
        const srcIps = Array.isArray(edge.src_ip) ? edge.src_ip : [edge.src_ip];
        const dstIps = Array.isArray(edge.dst_ip) ? edge.dst_ip : [edge.dst_ip];

        srcIps.forEach(srcIp => {
          dstIps.forEach(dstIp => {
            // For switches, use dpid; for hosts, find the host name
            let nodeA: string;
            if (edge.src_dpid && edge.src_dpid !== 0) {
              nodeA = String(edge.src_dpid);
            } else {
              const hostNode = allGraphNodes.find(
                n =>
                  n.vertex_type === 1 &&
                  Array.isArray(n.ip) &&
                  n.ip.includes(srcIp)
              );
              nodeA = hostNode ? hostNode.device_name : String(srcIp);
            }

            let nodeB: string;
            if (edge.dst_dpid && edge.dst_dpid !== 0) {
              nodeB = String(edge.dst_dpid);
            } else {
              const hostNode = allGraphNodes.find(
                n =>
                  n.vertex_type === 1 &&
                  Array.isArray(n.ip) &&
                  n.ip.includes(dstIp)
              );
              nodeB = hostNode ? hostNode.device_name : String(dstIp);
            }

            // Use directional edge identifier (not sorted) to distinguish direction
            const edgeIdentifier = `${nodeA}-${nodeB}`;

            if (!newNodeIds.has(nodeA) || !newNodeIds.has(nodeB)) {
              console.warn(
                `Skipping edge ${edgeIdentifier}: nodes ${nodeA} or ${nodeB} do not exist`
              );
              return;
            }

            if (edgeSet.has(edgeIdentifier)) return;
            edgeSet.add(edgeIdentifier);
            newEdgeIds.add(edgeIdentifier);

            // Use the edge's own bandwidth utilization percent (not aggregated)
            const usage = edge.link_bandwidth_utilization_percent ?? 0;

            if (!cy.getElementById(edgeIdentifier).length) {
              cy.add({
                group: 'edges',
                data: {
                  id: edgeIdentifier,
                  label: `${getIpString(srcIp)} → ${getIpString(dstIp)}`,
                  source: nodeA,
                  target: nodeB,
                  flow: edge.flow_set[0] || 'default',
                  bandwidth_usage_percent: usage,
                  // Store original edge data for reference
                  original_edge: edge,
                },
              });
            } else {
              const edgeEle = cy.getElementById(edgeIdentifier);
              edgeEle.data({
                label: `${getIpString(srcIp)} → ${getIpString(dstIp)}`,
                flow: edge.flow_set[0] || 'default',
                bandwidth_usage_percent: usage,
                original_edge: edge,
              });
            }
          });
        });
      }

      cy.nodes().forEach(node => {
        if (!newNodeIds.has(node.id())) {
          node.remove();
          delete manualNodePositions.current[node.id()];
        }
      });
      cy.edges().forEach(edge => {
        if (!newEdgeIds.has(edge.id())) {
          edge.remove();
        }
      });
      cy.nodes().removeClass('highlighted');
      cy.edges().removeClass('highlighted');

      highlightedNodes.forEach(nodeId => {
        const node = cy.getElementById(nodeId);
        if (node) node.addClass('highlighted');
      });
      highlightedEdges.forEach(edgeId => {
        const edge = cy.getElementById(edgeId);
        if (edge) edge.addClass('highlighted');
      });
    }, [graphData, highlightedEdges, highlightedNodes]);

    useEffect(() => {
      if (cyInstance.current && !hasFit && graphData.nodes.length > 0) {
        cyInstance.current.fit(undefined, 40);
        setHasFit(true);
      }
    }, [graphData, hasFit]);

    useEffect(() => {
      if (polling.data) {
        setGraphData(polling.data);
        setLastUpdated(new Date());
        setError(null);
      }
      if (polling.error) {
        setError(
          polling.error.message ||
            'Failed to fetch graph data. Please try again later.'
        );
      }
    }, [polling.data, polling.error]);

    useEffect(() => {
      if (!cyInstance.current) return;
      const cy = cyInstance.current;
      cy.nodes().removeClass('highlighted');
      if (multiSelectMode) {
        highlightedNodes.forEach(nodeId => {
          const node = cy.getElementById(nodeId);
          if (node) node.addClass('highlighted');
        });
      } else if (selectedNodeId) {
        const node = cy.getElementById(selectedNodeId);
        if (node) node.addClass('highlighted');
      }
    }, [selectedNodeId, highlightedNodes, multiSelectMode]);

    const handleRefresh = () => {
      polling.manualRefresh();
    };

    const getAllNodePositions = () => {
      if (!cyInstance.current) return [];
      return cyInstance.current.nodes().map((node: any) => {
        const data = node.data();
        const pos = node.position();
        return {
          id: data.id,
          x: pos.x,
          y: pos.y,
          type: data.type,
        };
      });
    };

    const handleSave = async () => {
      setSaving(true);
      try {
        const nodes = getAllNodePositions();
        await apiService.saveNodePositions(nodes);
        alert('Node positions saved!');
      } catch (error) {
        // Error saving node positions - handled by error boundary
        alert('Failed to save node positions');
      } finally {
        setSaving(false);
      }
    };

    useEffect(() => {
      const loadPositions = async () => {
        try {
          const res = await apiService.getNodePositions();
          if (res.success && res.nodes) {
            // Store positions in manualNodePositions for use when graph data updates
            res.nodes.forEach((n: any) => {
              manualNodePositions.current[n.node_id] = { x: n.x, y: n.y };
            });

            // If Cytoscape is already initialized, apply positions immediately
            if (cyInstance.current) {
              res.nodes.forEach((n: any) => {
                const node = cyInstance.current!.getElementById(n.node_id);
                if (node) {
                  node.position({ x: n.x, y: n.y });
                }
              });
            }
          }
        } catch (e) {
          // ignore if not logged in or no positions
          console.log(
            'No saved node positions found or error loading positions:',
            e
          );
        }
      };
      loadPositions();
    }, []);

    return (
      <div
        className={`flex flex-col overflow-hidden rounded-lg border-4 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] shadow-lg ${className || ''}`}
        style={{
          width: width || '100%',
          height: height || '100%',
          position: 'relative',
          ...style,
        }}
      >
        {error && (
          <div className="absolute left-0 right-0 top-0 bg-red-500 py-1 text-center text-sm text-white">
            {error}
          </div>
        )}
        <div ref={cyRef} className="h-full w-full flex-grow" />
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-100 px-2 py-2 text-xs text-gray-500">
          <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-gray-600">
              Link utilization:
            </span>
            <div className="flex flex-col items-center">
              <div
                className="h-3 w-24 rounded md:w-32"
                style={{
                  background:
                    'linear-gradient(to right, #2196F3 0%, #4CAF50 33%, #FFEB3B 66%, #F44336 100%)',
                }}
              />
              <div className="mt-0.5 flex w-24 justify-between text-[10px] md:w-32">
                <span>0%</span>
                <span>33%</span>
                <span>66%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
          <div className="flex items-center">
            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefresh}
                className="rounded-full p-1.5 transition-colors duration-200 hover:bg-[#9c9c9c]"
                title="Refresh"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 ${polling.loading ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
            <span>Auto Updating:</span>
            <select
              value={refreshInterval}
              onChange={e => setRefreshInterval(Number(e.target.value))}
              className="ml-1 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs"
            >
              <option value={1}>1 seconds</option>
              <option value={10}>10 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>1 minutes</option>
              <option value={300}>5 minutes</option>
            </select>
            <button
              onClick={handleSave}
              disabled={saving}
              className="ml-2 rounded bg-blue-500 px-3 py-1 text-xs font-semibold text-white shadow-md transition-colors duration-200 hover:bg-blue-600 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }
);

export default Topology;
