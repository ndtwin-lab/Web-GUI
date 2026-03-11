import React, { useState, useRef, useMemo, useEffect } from 'react';
import Draggable from 'react-draggable';
import { useTranslation } from 'react-i18next';
import { apiService } from '../api/apiService';
import { usePolling } from '../hooks/usePolling';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { getIpString } from '../utils/formatters';
import FilterPanel from './FilterPanel';
import type { FlowDataType } from '../types';

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

import { NETWORK_CONSTANTS } from '../utils/constants';

const commonPorts = NETWORK_CONSTANTS.COMMON_PORTS;

import BandwidthDisplay from './common/BandwidthDisplay';

const formatRate = (bps: number) => <BandwidthDisplay bps={bps} />;

const protocolMap: Record<number, string> = {
  6: 'TCP',
  17: 'UDP',
  1: 'ICMP',
};

// Protocol badge styling configuration
const getProtocolBadge = (protocolId: number) => {
  const getProtocolStyle = (protocolId: number): string => {
    switch (protocolId) {
      case 6: // TCP
        return 'border-blue-200 bg-blue-100 text-[#1976d2]';
      case 17: // UDP
        return 'border-green-200 bg-green-100 text-green-800';
      case 53: // DNS
        return 'bg-purple-100 text-purple-800';
      case 67: // DHCP
      case 68: // DHCP
        return 'bg-yellow-100 text-yellow-800';
      case 80: // HTTP
        return 'bg-blue-200 text-blue-900';
      case 161: // SNMP
        return 'bg-teal-100 text-teal-800';
      case 389: // LDAP
        return 'bg-pink-100 text-pink-800';
      case 443: // HTTPS
        return 'bg-indigo-100 text-indigo-800';
      case 3306: // MYSQL
        return 'bg-green-200 text-green-900';
      case 5432: // POSTGRESQL
        return 'bg-red-100 text-red-800';
      case 27017: // MONGODB
        return 'bg-orange-200 text-orange-600';
      default:
        return 'border-orange-200 bg-orange-100 text-orange-800';
    }
  };

  const protocolName = protocolMap[protocolId] || protocolId.toString();
  const styleClass = getProtocolStyle(protocolId);

  return (
    <span
      className={`rounded-lg border px-2 py-1 text-xs font-medium ${styleClass}`}
    >
      {protocolName}
    </span>
  );
};

interface FlowInformationProps {
  onClose?: () => void;
}

const FlowInformation: React.FC<FlowInformationProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [flows, setFlows] = useState<FlowDataType[]>([]);
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
  
  // Top-K and Interval settings with localStorage persistence
  const [displayMode, setDisplayMode] = useLocalStorage<'top-k' | 'show-all'>(
    'flowInfo_displayMode',
    'show-all'
  );
  const [kValue, setKValue] = useLocalStorage<number>('flowInfo_kValue', 50);
  const [intervalValue, setIntervalValue] = useLocalStorage<number>(
    'flowInfo_intervalValue',
    1000
  );
  const [showTopKModal, setShowTopKModal] = useState(false);
  const [showIntervalModal, setShowIntervalModal] = useState(false);
  const [tempKValue, setTempKValue] = useState<number>(kValue);
  const [tempIntervalValue, setTempIntervalValue] = useState<number>(intervalValue);

  // Sync temp values when modal opens or kValue/intervalValue changes
  useEffect(() => {
    setTempKValue(kValue);
  }, [kValue]);

  useEffect(() => {
    setTempIntervalValue(intervalValue);
  }, [intervalValue]);

  // Create fetcher based on display mode
  const fetcher = React.useCallback(async () => {
    if (displayMode === 'top-k') {
      return await apiService.getTopKFlowTableData(kValue);
    } else {
      return await apiService.getFlowTableData();
    }
  }, [displayMode, kValue]);

  const polling = usePolling<FlowDataType[]>({
    fetcher,
    interval: intervalValue,
    autoStart: true,
    dependencies: [fetcher, intervalValue],
  });

  useEffect(() => {
    if (polling.data) setFlows(polling.data);
  }, [polling.data]);

  // Filter flows based on criteria
  const filteredFlows = useMemo(() => {
    if (
      filterCriteria.filterMode === 'expression' &&
      filterCriteria.expressionFilter.trim()
    ) {
      return flows.filter(flow => {
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
                  flow.estimated_flow_sending_rate_bps_in_the_last_sec;
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
        return flows;
      }

      return flows.filter(flow => {
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
                    flow.estimated_flow_sending_rate_bps_in_the_last_sec;
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
                  const parseTimeToTimestamp = (val: string | number | undefined): number => {
                    if (!val) return 0;
                    if (typeof val === 'number') return val;
                    if (typeof val === 'string') {
                      // "2025-09-12 00:13:37"
                      const [datePart, timePart] = val.split(' ');
                      if (datePart && timePart) {
                        const [y, m, d] = datePart.split('-').map(n => parseInt(n, 10));
                        const [hh, mm, ss] = timePart.split(':').map(n => parseInt(n, 10));
                        if (
                          !Number.isNaN(y) &&
                          !Number.isNaN(m) &&
                          !Number.isNaN(d) &&
                          !Number.isNaN(hh) &&
                          !Number.isNaN(mm) &&
                          !Number.isNaN(ss)
                        ) {
                          return new Date(y, m - 1, d, hh, mm, ss).getTime();
                        }
                      }
                      const parsed = Date.parse(val);
                      return Number.isNaN(parsed) ? 0 : parsed;
                    }
                    return 0;
                  };
                  
                  const time = parseTimeToTimestamp(flow.first_sampled_time);
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
  }, [flows, filterCriteria]);

  // Sort flows
  const sortedFlows = useMemo(() => {
    if (!sortField) return filteredFlows;

    return [...filteredFlows].sort((a, b) => {
      const parseToEpoch = (val: any): number => {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          const [datePart, timePart] = val.split(' ');
          if (datePart && timePart) {
            const [y, m, d] = datePart.split('-').map(n => parseInt(n, 10));
            const [hh, mm, ss] = timePart.split(':').map(n => parseInt(n, 10));
            if (
              !Number.isNaN(y) &&
              !Number.isNaN(m) &&
              !Number.isNaN(d) &&
              !Number.isNaN(hh) &&
              !Number.isNaN(mm) &&
              !Number.isNaN(ss)
            ) {
              return new Date(y, m - 1, d, hh, mm, ss).getTime();
            }
          }
          const t = Date.parse(val);
          return Number.isNaN(t) ? 0 : t;
        }
        return 0;
      };

      let aValue: number, bValue: number;

      if (sortField === 'start_time') {
        aValue = parseToEpoch(a.first_sampled_time);
        bValue = parseToEpoch(b.first_sampled_time);
      } else if (sortField === 'end_time') {
        aValue = parseToEpoch(a.latest_sampled_time);
        bValue = parseToEpoch(b.latest_sampled_time);
      } else if (sortField === 'sending_rate') {
        aValue = a.estimated_flow_sending_rate_bps_in_the_last_sec ?? 0;
        bValue = b.estimated_flow_sending_rate_bps_in_the_last_sec ?? 0;
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
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
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

  const handleTopKApply = () => {
    if (tempKValue > 0) {
      setKValue(tempKValue);
      setDisplayMode('top-k');
      setShowTopKModal(false);
    }
  };

  const handleTopKCancel = () => {
    // Reset temp value to current saved value
    setTempKValue(kValue);
    setShowTopKModal(false);
  };

  const handleShowAll = () => {
    setDisplayMode('show-all');
    setShowTopKModal(false);
  };

  const handleIntervalApply = () => {
    if (tempIntervalValue >= 100) {
      setIntervalValue(tempIntervalValue);
      setShowIntervalModal(false);
    }
  };

  const handleIntervalCancel = () => {
    // Reset temp value to current saved value
    setTempIntervalValue(intervalValue);
    setShowIntervalModal(false);
  };

  return (
    <>
      {/* Top-K Flow Modal */}
      {showTopKModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-11/12 max-w-md overflow-hidden rounded-lg border-4 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] shadow-lg">
            <div className="border-b border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] px-6 py-4">
              <div className="flex items-center justify-between">
                <h3
                  className="text-xl font-bold tracking-tight"
                  style={{ color: '#1976d2' }}
                >
                  Display only top-k flow information
                </h3>
                <button
                  onClick={handleTopKCancel}
                  className="rounded-md border border-[#e0e0e0] bg-[#fff] p-2 transition-all duration-200 hover:bg-[#e3e9f3]"
                  title="Close"
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
            <div className="bg-[#fff] px-6 py-4">
              <div className="mb-4">
                <p className="mb-2 text-sm text-[#666]">
                  Current mode:{' '}
                  <span
                    className={`font-semibold ${
                      displayMode === 'top-k'
                        ? 'text-[#1976d2]'
                        : 'text-[#ff5722]'
                    }`}
                  >
                    {displayMode === 'top-k'
                      ? `Top-K (K=${kValue})`
                      : 'Show All'}
                  </span>
                </p>
                <label
                  htmlFor="k-value"
                  className="mb-2 block text-sm font-medium text-[#1976d2]"
                >
                  K value:
                </label>
                <input
                  id="k-value"
                  type="number"
                  min="1"
                  value={tempKValue}
                  onChange={e => setTempKValue(parseInt(e.target.value) || 1)}
                  className="w-full rounded-md border border-[#e0e0e0] px-3 py-2 text-[#222] focus:border-[#1976d2] focus:outline-none focus:ring-2 focus:ring-[#1976d2]"
                />
              </div>
              <div className="flex items-center justify-end space-x-2">
                <button
                  onClick={handleTopKCancel}
                  className="rounded-md border border-[#e0e0e0] bg-[#fff] px-4 py-2 text-sm font-medium text-[#1976d2] transition-all duration-200 hover:bg-[#e3e9f3]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleShowAll}
                  className="rounded-md border border-[#e0e0e0] bg-[#fff] px-4 py-2 text-sm font-medium text-[#1976d2] transition-all duration-200 hover:bg-[#e3e9f3]"
                >
                  Show All
                </button>
                <button
                  onClick={handleTopKApply}
                  className="rounded-md bg-[#1976d2] px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-[#1565c0]"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Interval Modal */}
      {showIntervalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-11/12 max-w-md overflow-hidden rounded-lg border-4 border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] shadow-lg">
            <div className="border-b border-[#e0e0e0] bg-gradient-to-b from-[#f8fafc] to-[#e3e9f3] px-6 py-4">
              <div className="flex items-center justify-between">
                <h3
                  className="text-xl font-bold tracking-tight"
                  style={{ color: '#1976d2' }}
                >
                  Interval between updating flow information
                </h3>
                <button
                  onClick={handleIntervalCancel}
                  className="rounded-md border border-[#e0e0e0] bg-[#fff] p-2 transition-all duration-200 hover:bg-[#e3e9f3]"
                  title="Close"
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
            <div className="bg-[#fff] px-6 py-4">
              <div className="mb-4">
                <p className="mb-2 text-sm text-[#666]">
                  Current interval:{' '}
                  <span className="font-semibold text-[#1976d2]">
                    {intervalValue}ms ({intervalValue / 1000}s)
                  </span>
                </p>
                <label
                  htmlFor="interval-value"
                  className="mb-2 block text-sm font-medium text-[#1976d2]"
                >
                  Update interval (milliseconds):
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    id="interval-value"
                    type="number"
                    min="100"
                    step="100"
                    value={tempIntervalValue}
                    onChange={e =>
                      setTempIntervalValue(parseInt(e.target.value) || 1000)
                    }
                    className="w-full rounded-md border border-[#e0e0e0] px-3 py-2 text-[#222] focus:border-[#1976d2] focus:outline-none focus:ring-2 focus:ring-[#1976d2]"
                  />
                  <span className="text-sm text-[#666]">ms</span>
                </div>
                <p className="mt-1 text-xs text-[#999]">
                  Minimum: 100ms (0.1s)
                </p>
              </div>
              <div className="flex items-center justify-end space-x-2">
                <button
                  onClick={handleIntervalCancel}
                  className="rounded-md border border-[#e0e0e0] bg-[#fff] px-4 py-2 text-sm font-medium text-[#1976d2] transition-all duration-200 hover:bg-[#e3e9f3]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleIntervalApply}
                  className="rounded-md bg-[#1976d2] px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-[#1565c0]"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  {t('flow.title')}
                </h2>
                <span className="rounded-lg border border-[#e0e0e0] bg-[#fff] px-2 py-1 text-sm font-medium text-[#1976d2]">
                  {sortedFlows.length} {t('flow.flows')}
                </span>
                {displayMode === 'top-k' && (
                  <span className="rounded-lg border border-[#1976d2] bg-[#1976d2] px-2 py-1 text-sm font-medium text-white">
                    Top-K (K={kValue})
                  </span>
                )}
                {displayMode === 'show-all' && (
                  <span className="rounded-lg border border-[#ff5722] bg-[#ff5722] px-2 py-1 text-sm font-medium text-white">
                    Show All
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() =>
                    polling.isPolling ? polling.stop() : polling.start()
                  }
                  className="rounded-md border border-[#e0e0e0] bg-[#fff] p-2 transition-all duration-200 hover:bg-[#e3e9f3]"
                  title={polling.isPolling ? t('flow.stop') : t('flow.start')}
                >
                  {polling.isPolling ? (
                    <svg
                      className="h-5 w-5"
                      style={{ color: '#FF0000' }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 6h12v12H6z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-5 w-5"
                      style={{ color: '#00FF00' }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 3l14 9-14 9V3z"
                      />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => {
                    setTempKValue(kValue);
                    setShowTopKModal(true);
                  }}
                  className={`rounded-md border border-[#e0e0e0] p-2 transition-all duration-200 ${
                    displayMode === 'top-k'
                      ? 'bg-[#1976d2] text-white hover:bg-[#1565c0]'
                      : 'bg-[#fff] hover:bg-[#e3e9f3]'
                  }`}
                  title={
                    displayMode === 'top-k'
                      ? `Top-K Flow (K=${kValue})`
                      : 'Top-K Flow'
                  }
                >
                  <svg
                    className="h-5 w-5"
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
                </button>
                <button
                  onClick={() => {
                    setTempIntervalValue(intervalValue);
                    setShowIntervalModal(true);
                  }}
                  className="rounded-md border border-[#e0e0e0] bg-[#fff] p-2 transition-all duration-200 hover:bg-[#e3e9f3]"
                  title={`Update Interval (${intervalValue}ms)`}
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
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </button>
                {polling.error && (
                  <span className="ml-2 text-xs text-red-500">Error</span>
                )}
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
                  title={showFilterPanel ? 'Hide Filters' : 'Show Filters'}
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
                {onClose && (
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
                )}
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
                    className={`cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3] 
                      ${sortField === 'sending_rate' ? 'bg-[#e3e9f3] text-[#ff5722]' : 'text-[#1976d2]'}`}
                    onClick={() => handleSort('sending_rate')}
                  >
                    {t('flow.sendingRate')} {getSortIcon('sending_rate')}
                  </th>
                  <th
                    className={`cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]
                      ${sortField === 'start_time' ? 'bg-[#e3e9f3] text-[#ff5722]' : 'text-[#1976d2]'}`}
                    onClick={() => handleSort('start_time')}
                  >
                    {t('flow.firstSampleTime')} {getSortIcon('start_time')}
                  </th>
                  <th
                    className={`cursor-pointer px-4 py-3 text-left font-semibold text-[#1976d2] transition-colors hover:bg-[#e3e9f3]
                      ${sortField === 'end_time' ? 'bg-[#e3e9f3] text-[#ff5722]' : 'text-[#1976d2]'}`}
                    onClick={() => handleSort('end_time')}
                  >
                    {t('flow.latestSampleTime')} {getSortIcon('end_time')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#fff]">
                {sortedFlows.map((flow, idx) => (
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
                      <span className="font-mono">
                        {flow.src_port || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#222]">
                      <span className="font-mono">
                        {flow.dst_port || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {getProtocolBadge(flow.protocol_id)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#222]">
                      {formatRate(
                        flow.estimated_flow_sending_rate_bps_in_the_last_sec
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#222]">
                      {/* {formatTime(flow.first_sampled_time)} */}
                      {flow.first_sampled_time}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#222]">
                      {/* {formatTime(flow.latest_sampled_time)} */}
                      {flow.latest_sampled_time}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="drag-handle cursor-move border-t border-[#e0e0e0] bg-[#f8fafc] px-6 py-3">
            <div className="flex items-center justify-between text-sm text-[#9c9c9c]">
              <span>
                {t('flow.showing')} {sortedFlows.length} {t('flow.of')}{' '}
                {flows.length} {t('flow.flows')}
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

export default FlowInformation;
