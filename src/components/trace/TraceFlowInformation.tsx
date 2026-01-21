import React, { useState, useRef, useMemo } from 'react';
import Draggable from 'react-draggable';
import { useTranslation } from 'react-i18next';
import { getIpString, formatTime } from '../../utils/formatters';
import FilterPanel from '../FilterPanel';
import { NETWORK_CONSTANTS } from '../../utils/constants';
import BandwidthDisplay from '../common/BandwidthDisplay';
import type { TraceFlowData } from './TraceDataManager';

interface TraceFlowInformationProps {
  flowData: TraceFlowData[];
  currentTime: string;
  onClose: () => void;
}

// Types
interface FilterRule {
  id: string;
  field:
    | 'src_ip'
    | 'dst_ip'
    | 'src_port'
    | 'dst_port'
    | 'protocol'
    | 'rate'
    | 'time';
  operator:
    | 'equals'
    | 'contains'
    | 'starts_with'
    | 'ends_with'
    | 'greater_than'
    | 'less_than'
    | 'in_range';
  value: string;
  enabled: boolean;
}

interface FilterGroup {
  id: string;
  name: string;
  rules: FilterRule[];
  operator: 'AND' | 'OR';
  enabled: boolean;
  parentGroupId?: string;
}

interface FilterCriteria {
  groups: FilterGroup[];
  expressionFilter: string;
  useExpression: boolean;
  filterMode: 'gui' | 'expression';
}

type SortField = 'start_time' | 'end_time' | 'sending_rate' | null;
type SortDirection = 'asc' | 'desc';

const commonPorts = NETWORK_CONSTANTS.COMMON_PORTS;

const formatRate = (bps: number) => <BandwidthDisplay bps={bps} />;

const protocolMap: Record<number, string> = {
  6: 'TCP',
  17: 'UDP',
  1: 'ICMP',
};

// Protocol style configuration
const protocolStyles: Record<number, string> = {
  6: 'border-blue-200 bg-blue-100 text-[#1976d2]', // TCP
  17: 'border-green-200 bg-green-100 text-green-800', // UDP
  53: 'bg-purple-100 text-purple-800', // DNS
  67: 'bg-yellow-100 text-yellow-800', // DHCP
  68: 'bg-yellow-100 text-yellow-800', // DHCP
  80: 'bg-blue-200 text-blue-900', // HTTP
  161: 'bg-teal-100 text-teal-800', // SNMP
  389: 'bg-pink-100 text-pink-800', // LDAP
  443: 'bg-indigo-100 text-indigo-800', // HTTPS
  3306: 'bg-green-200 text-green-900', // MYSQL
  5432: 'bg-red-100 text-red-800', // POSTGRESQL
  27017: 'bg-orange-200 text-orange-600', // MONGODB
};

// Get protocol style class based on protocol ID
const getProtocolStyle = (protocolId: number): string => {
  return (
    protocolStyles[protocolId] ||
    'border-orange-200 bg-orange-100 text-orange-800'
  );
};

// Get table header style class based on sort field
const getHeaderStyle = (
  field: SortField,
  currentSortField: SortField | null
): string => {
  const baseStyle =
    'cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]';

  if (currentSortField === field) {
    return `${baseStyle} bg-[#e3e9f3] text-[#ff5722]`;
  }

  return baseStyle;
};

// Get filter panel button title
const getFilterButtonTitle = (isVisible: boolean): string => {
  if (isVisible) {
    return 'Hide Filters';
  }
  return 'Show Filters';
};

// Get source port from flow data
const getSourcePort = (flow: TraceFlowData): string | number => {
  if (flow.src_port !== undefined) {
    return flow.src_port;
  }

  if (flow.path && flow.path[0] && typeof flow.path[0].interface === 'number') {
    return flow.path[0].interface;
  }

  return 'N/A';
};

// Get destination port from flow data
const getDestinationPort = (flow: TraceFlowData): string | number => {
  if (flow.dst_port !== undefined) {
    return flow.dst_port;
  }

  if (flow.path && flow.path.length > 0) {
    const lastPathNode = flow.path[flow.path.length - 1];
    if (lastPathNode && typeof lastPathNode.interface === 'number') {
      return lastPathNode.interface;
    }
  }

  return 'N/A';
};

const TraceFlowInformation: React.FC<TraceFlowInformationProps> = ({
  flowData,
  currentTime,
  onClose,
}) => {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);

  // Get flows for the current time
  const currentFlows = useMemo(() => {
    if (!flowData || flowData.length === 0) return [];

    // Use more flexible time matching to handle timestamp discrepancies
    const currentTimeMs = new Date(currentTime).getTime();

    return flowData
      .filter(flow => {
        const flowTimeMs = new Date(flow.timestamp).getTime();
        // Allow 1 second tolerance for timestamp matching
        return Math.abs(flowTimeMs - currentTimeMs) <= 1000;
      })
      .map(flow => ({
        ...flow,
        estimated_flow_sending_rate_bps_in_the_last_sec:
          flow.estimated_flow_sending_rate_bps_in_the_proceeding_1sec_timeslot,
        first_sampled_time: flow.first_sampled_time,
        latest_sampled_time: flow.latest_sampled_time || flow.timestamp,
      }));
  }, [flowData, currentTime]);

  const [filterCriteria, setFilterCriteria] = useState<FilterCriteria>({
    groups: [],
    expressionFilter: '',
    useExpression: false,
    filterMode: 'gui',
  });
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showPortTable, setShowPortTable] = useState(false);

  // Filter flows based on criteria
  const filteredFlows = useMemo(() => {
    if (
      filterCriteria.filterMode === 'expression' &&
      filterCriteria.expressionFilter.trim()
    ) {
      return currentFlows.filter(flow => {
        try {
          const expression = filterCriteria.expressionFilter;

          const evaluateCondition = (condition: string): boolean => {
            const match = condition.match(
              /(\w+)\s*([=<>!]+)\s*(?:["']([^"']*)["']|(\S+))/
            );
            if (!match) return false;

            const [, field, operator, quotedValue, unquotedValue] = match;
            const value = quotedValue || unquotedValue;

            switch (field) {
              case 'src_ip': {
                const srcIp = getIpString(flow.src_ip);
                if (operator === '==') return srcIp === value;
                else if (operator === 'contains') return srcIp.includes(value);
                else if (operator === 'starts_with')
                  return srcIp.startsWith(value);
                else if (operator === 'ends_with') return srcIp.endsWith(value);
                break;
              }
              case 'dst_ip': {
                const dstIp = getIpString(flow.dst_ip);
                if (operator === '==') return dstIp === value;
                else if (operator === 'contains') return dstIp.includes(value);
                else if (operator === 'starts_with')
                  return dstIp.startsWith(value);
                else if (operator === 'ends_with') return dstIp.endsWith(value);
                break;
              }
              case 'src_port': {
                const srcPort = flow.path[0]?.interface?.toString() || '';
                if (operator === '==') return srcPort === value;
                else if (operator === 'contains')
                  return srcPort.includes(value);
                else if (operator === 'starts_with')
                  return srcPort.startsWith(value);
                else if (operator === 'ends_with')
                  return srcPort.endsWith(value);
                else if (operator === '>')
                  return parseInt(srcPort) > parseInt(value);
                else if (operator === '<')
                  return parseInt(srcPort) < parseInt(value);
                break;
              }
              case 'dst_port': {
                const dstPort =
                  flow.path[flow.path.length - 1]?.interface?.toString() || '';
                if (operator === '==') return dstPort === value;
                else if (operator === 'contains')
                  return dstPort.includes(value);
                else if (operator === 'starts_with')
                  return dstPort.startsWith(value);
                else if (operator === 'ends_with')
                  return dstPort.endsWith(value);
                else if (operator === '>')
                  return parseInt(dstPort) > parseInt(value);
                else if (operator === '<')
                  return parseInt(dstPort) < parseInt(value);
                break;
              }
              case 'protocol': {
                const protocol = (
                  protocolMap[flow.protocol_id] || flow.protocol_id.toString()
                ).toLowerCase();
                if (operator === '==') return protocol === value.toLowerCase();
                else if (operator === 'contains')
                  return protocol.includes(value.toLowerCase());
                else if (operator === 'starts_with')
                  return protocol.startsWith(value.toLowerCase());
                else if (operator === 'ends_with')
                  return protocol.endsWith(value.toLowerCase());
                break;
              }
              case 'rate': {
                const rate =
                  parseFloat(
                    flow.estimated_flow_sending_rate_bps_in_the_last_sec
                  ) || 0;
                const rateValue = parseFloat(value);
                if (operator === '>') return rate > rateValue;
                else if (operator === '<') return rate < rateValue;
                else if (operator === '==') return rate === rateValue;
                else if (operator === 'greater_than') return rate > rateValue;
                else if (operator === 'less_than') return rate < rateValue;
                else if (operator === 'equals') return rate === rateValue;
                break;
              }
            }
            return false;
          };

          const parseExpression = (expr: string): boolean => {
            expr = expr.replace(/\s+/g, ' ').trim();

            while (expr.includes('(')) {
              const start = expr.lastIndexOf('(');
              const end = expr.indexOf(')', start);
              if (end === -1) break;

              const innerExpr = expr.substring(start + 1, end);
              const innerResult = parseExpression(innerExpr);

              const replacement = innerResult ? 'TRUE' : 'FALSE';
              expr =
                expr.substring(0, start) +
                replacement +
                expr.substring(end + 1);
            }

            const andParts = expr.split(/\s+AND\s+/i);
            if (andParts.length > 1) {
              return andParts.every(part => {
                const trimmedPart = part.trim();
                if (trimmedPart === 'TRUE') return true;
                if (trimmedPart === 'FALSE') return false;
                return evaluateCondition(trimmedPart);
              });
            }

            const orParts = expr.split(/\s+OR\s+/i);
            if (orParts.length > 1) {
              return orParts.some(part => {
                const trimmedPart = part.trim();
                if (trimmedPart === 'TRUE') return true;
                if (trimmedPart === 'FALSE') return false;
                return evaluateCondition(trimmedPart);
              });
            }

            const trimmedExpr = expr.trim();
            if (trimmedExpr === 'TRUE') return true;
            if (trimmedExpr === 'FALSE') return false;
            return evaluateCondition(trimmedExpr);
          };

          return parseExpression(expression);
        } catch (error) {
          console.error('Error parsing expression filter:', error);
          return true;
        }
      });
    } else {
      if (filterCriteria.groups.length === 0) {
        return currentFlows;
      }

      return currentFlows.filter(flow => {
        const evaluateGroup = (group: FilterGroup): boolean => {
          if (!group.enabled) return true;

          const ruleResults = group.rules
            .filter(rule => rule.enabled)
            .map(rule => {
              switch (rule.field) {
                case 'src_ip': {
                  const srcIp = getIpString(flow.src_ip);
                  switch (rule.operator) {
                    case 'equals':
                      return srcIp === rule.value;
                    case 'contains':
                      return srcIp.includes(rule.value);
                    case 'starts_with':
                      return srcIp.startsWith(rule.value);
                    case 'ends_with':
                      return srcIp.endsWith(rule.value);
                    default:
                      return srcIp.includes(rule.value);
                  }
                }
                case 'dst_ip': {
                  const dstIp = getIpString(flow.dst_ip);
                  switch (rule.operator) {
                    case 'equals':
                      return dstIp === rule.value;
                    case 'contains':
                      return dstIp.includes(rule.value);
                    case 'starts_with':
                      return dstIp.startsWith(rule.value);
                    case 'ends_with':
                      return dstIp.endsWith(rule.value);
                    default:
                      return dstIp.includes(rule.value);
                  }
                }
                case 'src_port': {
                  const srcPort = flow.path[0]?.interface?.toString() || '';
                  switch (rule.operator) {
                    case 'equals':
                      return srcPort === rule.value;
                    case 'contains':
                      return srcPort.includes(rule.value);
                    case 'starts_with':
                      return srcPort.startsWith(rule.value);
                    case 'ends_with':
                      return srcPort.endsWith(rule.value);
                    case 'greater_than':
                      return parseInt(srcPort) > parseInt(rule.value);
                    case 'less_than':
                      return parseInt(srcPort) < parseInt(rule.value);
                    default:
                      return srcPort.includes(rule.value);
                  }
                }
                case 'dst_port': {
                  const dstPort =
                    flow.path[flow.path.length - 1]?.interface?.toString() ||
                    '';
                  switch (rule.operator) {
                    case 'equals':
                      return dstPort === rule.value;
                    case 'contains':
                      return dstPort.includes(rule.value);
                    case 'starts_with':
                      return dstPort.startsWith(rule.value);
                    case 'ends_with':
                      return dstPort.endsWith(rule.value);
                    case 'greater_than':
                      return parseInt(dstPort) > parseInt(rule.value);
                    case 'less_than':
                      return parseInt(dstPort) < parseInt(rule.value);
                    default:
                      return dstPort.includes(rule.value);
                  }
                }
                case 'protocol': {
                  const protocol = (
                    protocolMap[flow.protocol_id] || flow.protocol_id.toString()
                  ).toLowerCase();
                  switch (rule.operator) {
                    case 'equals':
                      return protocol === rule.value.toLowerCase();
                    case 'contains':
                      return protocol.includes(rule.value.toLowerCase());
                    case 'starts_with':
                      return protocol.startsWith(rule.value.toLowerCase());
                    case 'ends_with':
                      return protocol.endsWith(rule.value.toLowerCase());
                    default:
                      return protocol.includes(rule.value.toLowerCase());
                  }
                }
                case 'rate': {
                  const rate =
                    parseFloat(
                      flow.estimated_flow_sending_rate_bps_in_the_last_sec
                    ) || 0;
                  const rateValue = parseFloat(rule.value);
                  switch (rule.operator) {
                    case 'equals':
                      return rate === rateValue;
                    case 'greater_than':
                      return rate > rateValue;
                    case 'less_than':
                      return rate < rateValue;
                    default:
                      return rate > rateValue;
                  }
                }
                case 'time': {
                  const time = parseFloat(flow.first_sampled_time) || 0;
                  const timeValue = parseFloat(rule.value);
                  switch (rule.operator) {
                    case 'equals':
                      return time === timeValue;
                    case 'greater_than':
                      return time > timeValue;
                    case 'less_than':
                      return time < timeValue;
                    default:
                      return time > timeValue;
                  }
                }
                default:
                  return true;
              }
            });

          const subGroups = filterCriteria.groups.filter(
            g => g.parentGroupId === group.id
          );
          const subGroupResults = subGroups.map(subGroup =>
            evaluateGroup(subGroup)
          );

          const allResults = [...ruleResults, ...subGroupResults];

          if (group.operator === 'AND') {
            return allResults.every(result => result);
          } else {
            return allResults.some(result => result);
          }
        };

        const topLevelGroups = filterCriteria.groups.filter(
          group => !group.parentGroupId
        );
        return topLevelGroups.every(group => evaluateGroup(group));
      });
    }
  }, [currentFlows, filterCriteria]);

  // Sort flows
  const sortedFlows = useMemo(() => {
    if (!sortField) return filteredFlows;

    return [...filteredFlows].sort((a, b) => {
      let aValue: number, bValue: number;

      if (sortField === 'start_time') {
        aValue = parseFloat(a.first_sampled_time) || 0;
        bValue = parseFloat(b.first_sampled_time) || 0;
      } else if (sortField === 'end_time') {
        aValue = parseFloat(a.latest_sampled_time) || 0;
        bValue = parseFloat(b.latest_sampled_time) || 0;
      } else if (sortField === 'sending_rate') {
        aValue =
          parseFloat(a.estimated_flow_sending_rate_bps_in_the_last_sec) || 0;
        bValue =
          parseFloat(b.estimated_flow_sending_rate_bps_in_the_last_sec) || 0;
      } else return 0;

      if (sortDirection === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });
  }, [filteredFlows, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '⭥';
    return sortDirection === 'asc' ? '⭡' : '⭣';
  };

  const clearFilters = () => {
    setFilterCriteria({
      groups: [],
      expressionFilter: '',
      useExpression: false,
      filterMode: 'gui',
    });
  };

  return (
    <>
      {/* Port Reference Table Modal */}
      {showPortTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="max-h-[80vh] w-11/12 max-w-4xl overflow-hidden rounded-lg border-4 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] shadow-lg">
            <div className="border-b border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] px-6 py-4">
              <div className="flex items-center justify-between">
                <h3
                  className="text-xl font-bold tracking-tight"
                  style={{ color: '#1976d2' }}
                >
                  {t('flow.portReference')}
                </h3>
                <button
                  onClick={() => setShowPortTable(false)}
                  className="rounded-md border border-[#e0e0e0] bg-[#fff] p-2 transition-all duration-200 hover:bg-[#e3e9f3]"
                  title={t('common.close')}
                >
                  <svg
                    className="h-5 w-5"
                    style={{ color: '#1976d2' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto bg-[#fff]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-[#e0e0e0] bg-[#f8fafc]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-[#1976d2]">
                      {t('flow.port')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-[#1976d2]">
                      {t('flow.protocol')}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-[#1976d2]">
                      {t('flow.description')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-[#fff]">
                  {commonPorts.map((item, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-[#e0e0e0] transition-colors hover:bg-[#f8fafc]"
                    >
                      <td className="px-4 py-3 font-mono font-medium text-[#222]">
                        {item.port}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-lg border border-blue-200 bg-blue-100 px-2 py-1 text-xs font-medium text-[#1976d2]">
                          {item.protocol}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#222]">
                        {item.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Main Flow Information Panel */}
      {/* @ts-expect-error - Draggable component type issue */}
      <Draggable nodeRef={nodeRef} handle=".drag-handle">
        <div
          ref={nodeRef}
          className="fixed bottom-6 right-4 w-11/12 max-w-7xl overflow-hidden rounded-lg border-4 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] shadow-lg"
        >
          <div className="drag-handle cursor-move border-b border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <h2
                  className="text-xl font-bold tracking-tight"
                  style={{ color: '#1976d2' }}
                >
                  {t('flow.title')} - Availability status
                </h2>
                <span className="rounded-lg border border-[#e0e0e0] bg-[#fff] px-2 py-1 text-sm font-medium text-[#1976d2]">
                  {sortedFlows.length} {t('flow.flows')}
                </span>
                <p className="text-xs text-gray-500">
                  Time: {new Date(currentTime).toLocaleString()}
                </p>
                {currentFlows.length === 0 && (
                  <p className="text-xs text-orange-600 font-medium">
                    ⚠️ No flow data available for this timestamp
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowPortTable(true)}
                  className="rounded-md border border-[#e0e0e0] bg-[#fff] p-2 transition-all duration-200 hover:bg-[#e3e9f3]"
                  title={t('flow.portReference')}
                >
                  <svg
                    className="h-5 w-5"
                    style={{ color: '#1976d2' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setShowFilterPanel(!showFilterPanel)}
                  className="rounded-md border border-[#e0e0e0] bg-[#fff] p-2 transition-all duration-200 hover:bg-[#e3e9f3]"
                  title={getFilterButtonTitle(showFilterPanel)}
                >
                  <svg
                    className="h-5 w-5"
                    style={{ color: '#1976d2' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z"
                    />
                  </svg>
                </button>
                <button
                  onClick={clearFilters}
                  className="rounded-md border border-[#e0e0e0] bg-[#fff] p-2 transition-all duration-200 hover:bg-[#e3e9f3]"
                  title={t('common.close')}
                >
                  <svg
                    className="h-5 w-5"
                    style={{ color: '#1976d2' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
                <button
                  onClick={onClose}
                  className="rounded-md border border-[#e0e0e0] bg-[#fff] p-2 transition-all duration-200 hover:bg-[#e3e9f3]"
                  title="Close"
                >
                  <svg
                    className="h-5 w-5"
                    style={{ color: '#FF7F50' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Filter Panel */}
          {showFilterPanel && (
            <FilterPanel
              filterCriteria={filterCriteria}
              setFilterCriteria={setFilterCriteria}
            />
          )}
          {/* Table */}
          <div className="max-h-96 overflow-x-auto bg-[#fff]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-[#e0e0e0] bg-[#f8fafc]">
                <tr>
                  <th
                    className="cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]"
                    onClick={() => handleSort(null)}
                  >
                    {t('flow.srcIp')}
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]"
                    onClick={() => handleSort(null)}
                  >
                    {t('flow.dstIp')}
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]"
                    onClick={() => handleSort(null)}
                  >
                    {t('flow.srcPort')}
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]"
                    onClick={() => handleSort(null)}
                  >
                    {t('flow.dstPort')}
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]"
                    onClick={() => handleSort(null)}
                  >
                    {t('flow.protocol')}
                  </th>
                  <th
                    className={getHeaderStyle('sending_rate', sortField)}
                    onClick={() => handleSort('sending_rate')}
                  >
                    {t('flow.sendingRate')} {getSortIcon('sending_rate')}
                  </th>
                  <th
                    className={getHeaderStyle('start_time', sortField)}
                    onClick={() => handleSort('start_time')}
                  >
                    {t('flow.firstSampleTime')} {getSortIcon('start_time')}
                  </th>
                  <th
                    className={getHeaderStyle('end_time', sortField)}
                    onClick={() => handleSort('end_time')}
                  >
                    {t('flow.latestSampleTime')} {getSortIcon('end_time')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#fff]">
                {sortedFlows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8">
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                      <p className="mt-2 text-gray-500">
                        {t('flow.noFlowsFound')}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        This may indicate missing data for the current timestamp
                      </p>
                    </td>
                  </tr>
                ) : (
                  sortedFlows.map((flow, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-[#e0e0e0] transition-colors hover:bg-[#f8fafc]"
                    >
                      <td className="px-4 py-3 font-mono text-[#222]">
                        {getIpString(flow.src_ip)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#222]">
                        {getIpString(flow.dst_ip)}
                      </td>
                      <td className="px-4 py-3 text-[#222]">
                        <span className="font-mono">{getSourcePort(flow)}</span>
                      </td>
                      <td className="px-4 py-3 text-[#222]">
                        <span className="font-mono">
                          {getDestinationPort(flow)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-lg border px-2 py-1 text-xs font-medium ${getProtocolStyle(flow.protocol_id)}`}
                        >
                          {protocolMap[flow.protocol_id] || flow.protocol_id}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[#222]">
                        {formatRate(
                          parseFloat(
                            flow.estimated_flow_sending_rate_bps_in_the_last_sec
                          ) || 0
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#222]">
                        {flow.first_sampled_time || 'N/A'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#222]">
                        {flow.latest_sampled_time || 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="drag-handle cursor-move border-t border-[#e0e0e0] bg-[#f8fafc] px-6 py-3">
            <div className="flex items-center justify-between text-sm text-[#9c9c9c]">
              <span>
                {t('flow.showing')} {sortedFlows.length} {t('flow.of')}{' '}
                {currentFlows.length} {t('flow.flows')}
              </span>
              <span>
                {t('flow.lastUpdated')}: {new Date().toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      </Draggable>
    </>
  );
};

export default TraceFlowInformation;
