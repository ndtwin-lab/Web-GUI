import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Topology from '../components/Topology';
import type { TopologyRef } from '../components/Topology';
import FlowTablePanel from '../components/FlowTablePanel';
import { apiService } from '../api/apiService';
import { usePolling } from '../hooks/usePolling';
import { useGraphData } from '../components/GraphDataManager';
import type { GraphDataType } from '../types/graph';
import type { FlowEntryType } from '../types/flow';
import PanelManager from '../components/PanelManager';
import { usePanelManager } from '../hooks/usePanelManager';

interface SelectedFlow {
  dpid: number;
  flow: FlowEntryType['flows'][string][0];
  index: number;
}

interface EdgeProps {
  src: number | string;
  dst: number | string;
  direction?: 'src2dst' | 'dst2src';
}

interface FormData {
  switchName: string;
  dpid: string;
  priority: string;
  matchFields: Array<{ field: string; value: string; mask: string }>;
  instructions: string;
  actions: Array<{ type: string; port: string }>;
}

interface DeleteDialog {
  open: boolean;
  flow: SelectedFlow | null;
}


// Match field options:
// - First, user selects protocol.
// - Then, depending on protocol, show corresponding fields:
//   TCP: tcp_src, tcp_dst
//   UDP: udp_src, udp_dst
//   ICMP: icmpv4_type, icmpv4_code
// Common fields (always allowed): eth_type, ipv4_src, ipv4_dst, protocol.
const MATCH_FIELD_OPTIONS = [
  { value: 'eth_type', label: 'Ethertype' },
  { value: 'ipv4_src', label: 'Src IP' },
  { value: 'ipv4_dst', label: 'Dst IP' },
  { value: 'protocol', label: 'Protocol' },
  { value: 'tcp_src', label: 'TCP Src Port' },
  { value: 'tcp_dst', label: 'TCP Dst Port' },
  { value: 'udp_src', label: 'UDP Src Port' },
  { value: 'udp_dst', label: 'UDP Dst Port' },
  { value: 'icmpv4_type', label: 'ICMPv4 Type' },
  { value: 'icmpv4_code', label: 'ICMPv4 Code' },
] as const;

const DEFAULT_FORM_DATA: FormData = {
  switchName: '',
  dpid: '',
  priority: '10',
  // Let user choose protocol first
  matchFields: [{ field: 'protocol', value: '', mask: '' }],
  instructions: 'Write-Actions',
  actions: [{ type: 'OUTPUT', port: '' }],
};

const IPV4_DEPENDENT_FIELDS = ['ipv4_src', 'ipv4_dst', 'protocol'];
const PORT_DEPENDENT_FIELDS = ['tcp_src', 'tcp_dst', 'udp_src', 'udp_dst'];
const DEFAULT_ETH_TYPE = '2048';
const DEFAULT_PROTOCOL = '6';

const generateEdgeId = (edgeData: EdgeProps): string => {
  return `${edgeData.src}-${edgeData.dst}`;
};

// Reverse protocol number to name mapping
const PROTOCOL_NUMBER_TO_NAME: Record<number, string> = {
  6: 'TCP',
  17: 'UDP',
  1: 'ICMP',
  132: 'SCTP',
};

const convertMatchToMatchFields = (match: any): Array<{ field: string; value: string; mask: string }> => {
  const matchFields: Array<{ field: string; value: string; mask: string }> = [];

  if (match.dl_type || match.eth_type) {
    matchFields.push({ field: 'eth_type', value: String(match.dl_type || match.eth_type), mask: '' });
  }
  if (match.nw_src || match.ipv4_src) {
    const value = match.nw_src || match.ipv4_src || '';
    const parts = value.split('/');
    matchFields.push({ field: 'ipv4_src', value: parts[0] || '', mask: parts[1] || '' });
  }
  if (match.nw_dst || match.ipv4_dst) {
    const value = match.nw_dst || match.ipv4_dst || '';
    const parts = value.split('/');
    matchFields.push({ field: 'ipv4_dst', value: parts[0] || '', mask: parts[1] || '' });
  }

  // Protocol: convert ip_proto to protocol field
  const protocolNumber = match.ip_proto !== undefined ? match.ip_proto : match.protocol;
  if (protocolNumber !== undefined) {
    const protocolName = PROTOCOL_NUMBER_TO_NAME[protocolNumber] || String(protocolNumber);
    matchFields.push({ field: 'protocol', value: protocolName, mask: '' });
  }

  // Ports: keep protocol-specific ports (tcp_src, udp_src, etc.)
  if (match.tcp_src !== undefined) {
    matchFields.push({ field: 'tcp_src', value: String(match.tcp_src), mask: '' });
  } else if (match.udp_src !== undefined) {
    matchFields.push({ field: 'udp_src', value: String(match.udp_src), mask: '' });
  } else if (match.sctp_src !== undefined) {
    matchFields.push({ field: 'src_port', value: String(match.sctp_src), mask: '' });
  } else if (match.src_port !== undefined) {
    matchFields.push({ field: 'src_port', value: String(match.src_port), mask: '' });
  }

  if (match.tcp_dst !== undefined) {
    matchFields.push({ field: 'tcp_dst', value: String(match.tcp_dst), mask: '' });
  } else if (match.udp_dst !== undefined) {
    matchFields.push({ field: 'udp_dst', value: String(match.udp_dst), mask: '' });
  } else if (match.sctp_dst !== undefined) {
    matchFields.push({ field: 'dst_port', value: String(match.sctp_dst), mask: '' });
  } else if (match.dst_port !== undefined) {
    matchFields.push({ field: 'dst_port', value: String(match.dst_port), mask: '' });
  }

  // ICMP fields
  if (match.icmpv4_type !== undefined) {
    matchFields.push({ field: 'icmpv4_type', value: String(match.icmpv4_type), mask: '' });
  }
  if (match.icmpv4_code !== undefined) {
    matchFields.push({ field: 'icmpv4_code', value: String(match.icmpv4_code), mask: '' });
  }

  // Default: start from protocol field so the user selects protocol first
  return matchFields.length > 0 ? matchFields : [{ field: 'protocol', value: '', mask: '' }];
};

// Protocol number to name mapping
const PROTOCOL_MAP: Record<string, number> = {
  'TCP': 6,
  'UDP': 17,
  'ICMP': 1,
  'SCTP': 132,
};

// Get protocol number from string (e.g., "TCP" -> 6, "6" -> 6)
const getProtocolNumber = (value: string): number | null => {
  const upperValue = value.toUpperCase().trim();
  if (PROTOCOL_MAP[upperValue]) {
    return PROTOCOL_MAP[upperValue];
  }
  const parsed = parseInt(value);
  return isNaN(parsed) ? null : parsed;
};

// Get port field name based on protocol (e.g., TCP -> tcp_src/tcp_dst, UDP -> udp_src/udp_dst)
const getPortFieldName = (protocol: number, portType: 'src' | 'dst'): string => {
  switch (protocol) {
    case 6: // TCP
      return `tcp_${portType}`;
    case 17: // UDP
      return `udp_${portType}`;
    case 1: // ICMP
      // ICMP doesn't have ports, but we keep this for consistency
      return `${portType}_port`;
    default:
      // For unknown protocols, use generic ipv4_*_port (though Ryu might not support this)
      return `${portType}_port`;
  }
};

const convertMatchFieldsToMatch = (matchFields: FormData['matchFields']): any => {
  const match: any = {};
  let protocolNumber: number | null = null;

  // First pass: find protocol number
  matchFields.forEach(field => {
    if (field.field === 'protocol' && field.value.trim() !== '') {
      protocolNumber = getProtocolNumber(field.value);
    }
  });

  // Second pass: convert fields
  matchFields.forEach(field => {
    if (field.value.trim() === '') return;

    if (field.field === 'eth_type') {
      match[field.field] = field.value.startsWith('0x') ? parseInt(field.value, 16) : parseInt(field.value);
    } else if (field.field === 'protocol') {
      // Convert protocol to ip_proto
      const protoNum = getProtocolNumber(field.value);
      if (protoNum !== null) {
        match['ip_proto'] = protoNum;
      }
    } else if (
      field.field === 'tcp_src' ||
      field.field === 'tcp_dst' ||
      field.field === 'udp_src' ||
      field.field === 'udp_dst' ||
      field.field === 'icmpv4_type' ||
      field.field === 'icmpv4_code'
    ) {
      match[field.field] = parseInt(field.value);
    } else if (['ipv4_src', 'ipv4_dst'].includes(field.field)) {
      match[field.field] = field.mask?.trim() ? `${field.value}/${field.mask}` : field.value;
    } else {
      match[field.field] = field.value;
    }
  });
  return match;
};

const convertActionsToApiFormat = (actions: FormData['actions']) => {
  return actions
    .filter(action => action.port || action.type === 'DROP')
    .map(action => {
      if (action.type === 'OUTPUT') {
        const portValue = action.port === 'CONTROLLER' || action.port === '' ? 0 : parseInt(action.port) || 0;
        return { type: 'OUTPUT', port: portValue };
      }
      return { type: action.type };
    });
};


interface MatchFieldInputProps {
  field: string;
  value: string;
  mask: string;
  index: number;
  onUpdate: (index: number, field: string, value: string, mask?: string) => void;
  disabled?: boolean;
}

const MatchFieldInput: React.FC<MatchFieldInputProps> = ({ field, value, mask, index, onUpdate, disabled = false }) => {
  const baseInputClass = `flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 ${
    disabled ? 'cursor-not-allowed bg-gray-100' : ''
  }`;

  if (['ipv4_dst', 'ipv4_src'].includes(field)) {
    return (
      <div className="flex flex-1 items-center gap-2">
        <input
          type="text"
          placeholder="IP"
          value={value}
          onChange={e => onUpdate(index, field, e.target.value, mask)}
          disabled={disabled}
          className={baseInputClass}
        />
        <span>/</span>
        <input
          type="number"
          placeholder="Mask"
          value={mask}
          onChange={e => onUpdate(index, field, value, e.target.value)}
          disabled={disabled}
          className={`w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 ${
            disabled ? 'cursor-not-allowed bg-gray-100' : ''
          }`}
        />
      </div>
    );
  }

  if (field === 'protocol') {
    return (
      <div className="relative flex-1">
        <input
          type="text"
          placeholder="Protocol (TCP, UDP, ICMP)"
          value={value}
          onChange={e => onUpdate(index, field, e.target.value, mask)}
          list="protocolOptions"
          disabled={disabled}
          className={baseInputClass}
        />
        <datalist id="protocolOptions">
          <option value="TCP" />
          <option value="UDP" />
          <option value="ICMP" />
        </datalist>
      </div>
    );
  }

  if (
    field === 'tcp_src' ||
    field === 'tcp_dst' ||
    field === 'udp_src' ||
    field === 'udp_dst'
  ) {
    const isSrc = field.endsWith('src');
    const protoLabel = field.startsWith('tcp') ? 'TCP' : 'UDP';
      return (
        <input
          type="number"
          placeholder={`${protoLabel} ${isSrc ? 'Src' : 'Dst'} Port`}
          value={value}
          onChange={e => onUpdate(index, field, e.target.value, mask)}
          disabled={disabled}
          className={baseInputClass}
        />
      );
    }

    if (field === 'icmpv4_type' || field === 'icmpv4_code') {
      return (
        <input
          type="number"
          placeholder={field === 'icmpv4_type' ? 'ICMPv4 Type (e.g., 8)' : 'ICMPv4 Code (e.g., 0)'}
          value={value}
          onChange={e => onUpdate(index, field, e.target.value, mask)}
          disabled={disabled}
          className={baseInputClass}
        />
      );
    }

  if (field === 'eth_type') {
    return (
      <div className="relative flex-1">
        <input
          type="text"
          placeholder="Ethertype"
          value={value}
          onChange={e => onUpdate(index, field, e.target.value, mask)}
          list="ethertypeOptions"
          disabled={disabled}
          className={baseInputClass}
        />
        <datalist id="ethertypeOptions">
          <option value="IP" />
          <option value="ARP" />
        </datalist>
      </div>
    );
  }

  // Default input for other fields
  const placeholder = MATCH_FIELD_OPTIONS.find(opt => opt.value === field)?.label || 'Value';
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={e => onUpdate(index, field, e.target.value, mask)}
      disabled={disabled}
      className={baseInputClass}
    />
  );
};

interface FlowEntryFormProps {
  formData: FormData;
  operationType: 'install' | 'modify';
  loading: boolean;
  switchOptions: Array<{ name: string; dpid: number }>;
  switchNameError: string | null;
  portError: string | null;
  onClose: () => void;
  onSwitchNameChange: (name: string) => void;
  onFormDataChange: (data: Partial<FormData>) => void;
  onMatchFieldUpdate: (index: number, field: string, value: string, mask?: string) => void;
  onMatchFieldAdd: () => void;
  onMatchFieldRemove: (index: number) => void;
  onActionAdd: () => void;
  onActionUpdate: (index: number, updates: Partial<FormData['actions'][0]>) => void;
  onActionRemove: (index: number) => void;
  onAvailableMatchFields: () => Array<{ value: string; label: string }>;
  onSubmit: () => void;
}

const FlowEntryForm: React.FC<FlowEntryFormProps> = ({
  formData,
  operationType,
  loading,
  switchOptions,
  switchNameError,
  portError,
  onClose,
  onSwitchNameChange,
  onFormDataChange,
  onMatchFieldUpdate,
  onMatchFieldAdd,
  onMatchFieldRemove,
  onActionAdd,
  onActionUpdate,
  onActionRemove,
  onAvailableMatchFields,
  onSubmit,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 p-4">
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-gray-200 bg-white p-8 shadow-xl">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 className="mb-4 text-xl font-semibold text-gray-800">
          {operationType === 'install' ? 'Add' : 'Modify'} Flow Entry
        </h3>

        <div className="space-y-4">
          {/* Switch Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Switch Name</label>
            <div className="relative">
              <input
                type="text"
                value={formData.switchName}
                onChange={e => onSwitchNameChange(e.target.value)}
                list="switchNameOptions"
                disabled={operationType === 'modify'}
                className={`w-full border px-3 py-2 ${
                  switchNameError ? 'border-red-500' : 'border-gray-300'
                } rounded-lg focus:border-transparent focus:ring-2 focus:ring-blue-500 ${
                  operationType === 'modify' ? 'cursor-not-allowed bg-gray-100' : ''
                }`}
                placeholder="Enter Switch Name"
              />
              <datalist id="switchNameOptions">
                {switchOptions.map(option => (
                  <option key={option.dpid} value={option.name} />
                ))}
              </datalist>
              {switchNameError && <p className="mt-1 text-xs text-red-500">{switchNameError}</p>}
            </div>
          </div>

          {/* Switch DPID */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-500">Switch DPID</label>
            <input
              type="text"
              value={formData.dpid}
              disabled
              className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-gray-500"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Priority</label>
            <input
              type="number"
              value={formData.priority}
              onChange={e => onFormDataChange({ priority: e.target.value })}
              disabled={operationType === 'modify'}
              className={`w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 ${
                operationType === 'modify' ? 'cursor-not-allowed bg-gray-100' : ''
              }`}
              placeholder="10"
            />
          </div>

          {/* Match Fields */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Match Fields</label>
              {operationType === 'install' && (
                <button
                  type="button"
                  onClick={onMatchFieldAdd}
                  disabled={onAvailableMatchFields().length === 0}
                  className="text-sm text-blue-500 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  + Add Match Field
                </button>
              )}
            </div>
            <div className="max-h-32 space-y-3 overflow-y-auto rounded-lg border border-gray-200 p-3">
              {formData.matchFields.map((matchField, index) => (
                <div key={index} className="flex items-start gap-2">
                  <select
                    value={matchField.field}
                    onChange={e => onMatchFieldUpdate(index, e.target.value, matchField.value, matchField.mask)}
                    disabled={operationType === 'modify'}
                    className={`flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 ${
                      operationType === 'modify' ? 'cursor-not-allowed bg-gray-100' : ''
                    }`}
                  >
                    {MATCH_FIELD_OPTIONS.map(option => {
                      const isSelected = formData.matchFields.some(
                        (field, i) => i !== index && field.field === option.value
                      );
                      return (
                        <option key={option.value} value={option.value} disabled={isSelected}>
                          {option.label} {isSelected ? '(Already selected)' : ''}
                        </option>
                      );
                    })}
                  </select>

                  {/* Match Field Input */}
                  <MatchFieldInput
                    field={matchField.field}
                    value={matchField.value}
                    mask={matchField.mask}
                    index={index}
                    onUpdate={onMatchFieldUpdate}
                    disabled={operationType === 'modify'}
                  />

                  {operationType === 'install' && (
                    <button
                      type="button"
                      onClick={() => onMatchFieldRemove(index)}
                      className="px-3 py-2 text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <datalist id="subnet-masks">
              <option value="16" />
              <option value="24" />
            </datalist>
          </div>

          {/* Instructions */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Instructions</label>
            <select
              value={formData.instructions}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            >
              <option value="Write-Actions">Write-Actions</option>
              <option value="Apply-Actions">Apply-Actions</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {formData.instructions === 'Write-Actions'
                ? 'Merges actions into the current action set. If an action of a given type already exists, it will be overwritten.'
                : 'Immediately applies actions to a packet without changing the existing Action Set.'}
            </p>
          </div>

          {/* Actions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Actions</label>
              <button
                type="button"
                onClick={onActionAdd}
                className="text-sm text-blue-500 hover:text-blue-700"
              >
                + Add Action
              </button>
            </div>
            <div className="max-h-32 space-y-3 overflow-y-auto rounded-lg border border-gray-200 p-3">
              {formData.actions.map((action, index) => (
                <div key={index} className="flex items-start gap-2">
                  <select
                    value={action.type}
                    onChange={e => onActionUpdate(index, { type: e.target.value })}
                    className="rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="OUTPUT">OUTPUT</option>
                    <option value="DROP">DROP</option>
                  </select>
                  {action.type === 'OUTPUT' && (
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={action.port}
                        onChange={e => onActionUpdate(index, { port: e.target.value })}
                        list="portOptions"
                        className={`w-full border px-3 py-2 ${
                          portError ? 'border-red-500' : 'border-gray-300'
                        } rounded-lg focus:border-transparent focus:ring-2 focus:ring-blue-500`}
                        placeholder="Enter Port"
                      />
                      <datalist id="portOptions">
                        <option value="CONTROLLER" />
                      </datalist>
                      {portError && <p className="mt-1 text-xs text-red-500">{portError}</p>}
                    </div>
                  )}
                  <button
                    onClick={() => onActionRemove(index)}
                    className="px-3 py-2 text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={onSubmit}
              disabled={loading || !formData.dpid}
              className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors duration-200 hover:bg-blue-600 disabled:bg-gray-400"
            >
              {loading ? 'Processing...' : operationType === 'install' ? 'Add Entry' : 'Modify Entry'}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors duration-200 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface DeleteDialogProps {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteDialog: React.FC<DeleteDialogProps> = ({ open, loading, onClose, onConfirm }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
      <div className="relative w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-800">Delete Flow Entry</h3>
        <div className="mb-4 text-sm text-gray-700">Are you sure you want to delete this entry?</div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors duration-200 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-lg bg-red-500 px-4 py-2 text-white transition-colors duration-200 hover:bg-red-600 disabled:bg-red-300"
          >
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

const SwitchFlowTable: React.FC = () => {
  // State Management
  const [searchParams, setSearchParams] = useSearchParams();
  const [flowData, setFlowData] = useState<FlowEntryType[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ src: number; dst: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [operationType, setOperationType] = useState<'install' | 'delete' | 'modify'>('install');
  const [initialSearchValue, setInitialSearchValue] = useState<string>('');
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSwitchDpid, setSelectedSwitchDpid] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [switchOptions, setSwitchOptions] = useState<Array<{ name: string; dpid: number }>>([]);
  const [switchNameError, setSwitchNameError] = useState<string | null>(null);
  const [portError, setPortError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog>({ open: false, flow: null });
  // Store original flow entry for modify operation
  const [originalFlowEntry, setOriginalFlowEntry] = useState<SelectedFlow | null>(null);

  // Refs & Hooks
  const topologyRef = useRef<TopologyRef>(null);
  const urlParamsProcessedRef = useRef<string>('');
  const { graphData } = useGraphData();
  const flowPolling = usePolling<FlowEntryType[]>({
    fetcher: apiService.getSwitchOpenflowTable,
    interval: 1000,
    autoStart: true,
    dependencies: [],
  });
  const {
    panels,
    addPanel,
    closePanel,
    bringToFront,
    updatePanelDataByType,
    getPanelByType,
  } = usePanelManager();

  const latestGraphData = graphData?.length ? graphData[graphData.length - 1] : null;

  // Effects
  useEffect(() => {
    if (flowPolling.data) setFlowData(flowPolling.data);
  }, [flowPolling.data]);

  useEffect(() => {
    if (graphData && graphData.length > 0) {
      const latestGraphData = graphData[graphData.length - 1];
      const switches = latestGraphData.nodes
        .filter(node => node.vertex_type === 0)
        .map(node => {
          const dpidNum = typeof node.dpid === 'number' ? node.dpid : Number(node.dpid);
          return { name: node.device_name, dpid: isNaN(dpidNum) ? 0 : dpidNum };
        });
      setSwitchOptions(switches);
    }
  }, [graphData]);

  // URL Parameter Handling
  useEffect(() => {
    const deviceName = searchParams.get('device_name');
    const formType = searchParams.get('form_type');
    const paramsKey = `${formType}-${deviceName || ''}`;

    if (!formType || urlParamsProcessedRef.current === paramsKey) return;

    if (formType && graphData && graphData.length > 0) {
      const latestGraphData = graphData[graphData.length - 1];
      urlParamsProcessedRef.current = paramsKey;

      if (deviceName) setInitialSearchValue(deviceName);

      const handleFormType = (type: string) => {
        setOperationType(type === 'install_flow' ? 'install' : 'modify');
        const matchedSwitch = deviceName
          ? latestGraphData.nodes.find(
              node => node.vertex_type === 0 && node.device_name.toLowerCase() === deviceName.toLowerCase()
            )
          : null;

        setFormData({
          ...DEFAULT_FORM_DATA,
          switchName: deviceName || '',
          dpid: matchedSwitch ? String(matchedSwitch.dpid) : '',
        });
        setSwitchNameError(matchedSwitch ? null : `Can not find switch named: "${deviceName}"`);
        setShowForm(true);
      };

      if (formType === 'install_flow' || formType === 'modify_flow') {
        handleFormType(formType);
      }

      setTimeout(() => {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('device_name');
        newParams.delete('form_type');
        setSearchParams(newParams, { replace: true });
        urlParamsProcessedRef.current = '';
      }, 100);
    }
  }, [searchParams, graphData, setSearchParams]);

  // Handlers
  const handleSwitchNameChange = useCallback(
    (name: string) => {
      setSwitchNameError(null);
      setFormData(prev => ({ ...prev, switchName: name, dpid: '' }));

      if (name.trim() === '') return;

      if (graphData && graphData.length > 0) {
        const latestGraphData = graphData[graphData.length - 1];
        const matchedSwitch = latestGraphData.nodes.find(
          node => node.vertex_type === 0 && node.device_name.toLowerCase() === name.toLowerCase()
        );

        if (matchedSwitch) {
          setFormData(prev => ({ ...prev, dpid: String(matchedSwitch.dpid) }));
        } else {
          setSwitchNameError(`Can not find switch named: "${name}"`);
        }
      }
    },
    [graphData]
  );

  const handleNodeSelect = useCallback(
    (nodeId: string | null) => {
      if (nodeId) {
        setSelectedSwitchDpid(nodeId);
        setSelectedNode(nodeId);
        setSelectedEdge(null);
        addPanel('device', nodeId);
      }
    },
    [addPanel]
  );

  const handleEdgeSelect = useCallback(
    (edgeData: EdgeProps | null) => {
      if (edgeData) {
        const srcNum = typeof edgeData.src === 'string' ? Number(edgeData.src) : edgeData.src;
        const dstNum = typeof edgeData.dst === 'string' ? Number(edgeData.dst) : edgeData.dst;
        setSelectedEdge({ src: srcNum, dst: dstNum });
        setSelectedNode(null);
        addPanel('linkFlow', edgeData);
      }
    },
    [addPanel]
  );

  const handleClosePanel = useCallback(
    (id: string) => {
      const panelToClose = panels.find(panel => panel.id === id);
      closePanel(id);
      if (topologyRef.current && panelToClose) {
        if (panelToClose.type === 'linkFlow' && panelToClose.data) {
          topologyRef.current.clearHighlightedEdge(generateEdgeId(panelToClose.data));
        }
        if (panelToClose.type === 'device' && panelToClose.data) {
          topologyRef.current.clearHighlightedNode(panelToClose.data);
        }
        topologyRef.current.clearHighlights();
      }
    },
    [panels, closePanel]
  );

  const handleShowSwitchPorts = useCallback(
    (deviceId: string | number) => {
      const existingPanel = getPanelByType('switchPort', deviceId);
      if (existingPanel) {
        closePanel(existingPanel.id);
      } else {
        addPanel('switchPort', deviceId);
      }
    },
    [addPanel, closePanel, getPanelByType]
  );

  const handleAddChildPanel = useCallback(
    (
      type:
        | 'linkInfo'
        | 'perLinkFlow'
        | 'flowStacked'
        | 'traceLinkInfo'
        | 'traceLinkInfoAll'
        | 'tracePerLinkFlow'
        | 'traceFlowStacked'
        | 'traceLinkFlow'
        | 'traceSwitchPort'
        | 'traceBulkChart'
        | 'traceBulkStackedChart',
      data: any
    ) => {
      addPanel(type, data);
    },
    [addPanel]
  );

  const handleUpdatePanelData = useCallback(
    (
      type: 'perLinkFlow' | 'flowStacked' | 'tracePerLinkFlow' | 'traceFlowStacked',
      data: any
    ) => {
      updatePanelDataByType(type, data);
    },
    [updatePanelDataByType]
  );

  const handleHighlightPortLink = useCallback((linkId: string) => {
    if (topologyRef.current) {
      topologyRef.current.highlightPortLink(linkId);
    }
  }, []);

  const handleClearPortHighlight = useCallback(() => {
    if (topologyRef.current) {
      topologyRef.current.clearPortHighlight();
    }
  }, []);

  const handleFlowOperation = useCallback(async () => {
    if (!formData.dpid) {
      setSwitchNameError('Please fill in required fields');
      return;
    }

    const hasValidMatch = formData.matchFields.some(field => field.value.trim() !== '');
    if (!hasValidMatch) {
      alert('Please fill in at least one match field');
      return;
    }

    const actions = convertActionsToApiFormat(formData.actions);
    
    let flowEntry: { dpid: number; priority?: number; match: object; actions: any[] };

    if (operationType === 'install') {
      const match = convertMatchFieldsToMatch(formData.matchFields);
      flowEntry = {
        dpid: parseInt(formData.dpid),
        match,
        actions,
      };

      const priorityValue = parseInt(formData.priority);
      if (!isNaN(priorityValue) && priorityValue > 0) {
        flowEntry.priority = priorityValue;
      }
    } else {
      // For modify, use original match and priority to match the existing entry
      if (!originalFlowEntry) {
        alert('Error: Original flow entry not found');
        return;
      }

      // Convert original match to the format needed for API
      const originalMatch = originalFlowEntry.flow.match;
      const standardMatch: any = {};

      // Include all match fields from original entry
      // Use only ipv4_* and ip_proto (not nw_*), and only eth_type (not dl_type)
      if (originalMatch.in_port !== undefined) standardMatch.in_port = originalMatch.in_port;
      if (originalMatch.dl_src !== undefined) standardMatch.dl_src = originalMatch.dl_src;
      if (originalMatch.dl_dst !== undefined) standardMatch.dl_dst = originalMatch.dl_dst;
      if (originalMatch.vlan_id !== undefined) standardMatch.vlan_id = originalMatch.vlan_id;
      // Use eth_type, fallback to dl_type if eth_type doesn't exist
      if (originalMatch.eth_type !== undefined) {
        standardMatch.eth_type = originalMatch.eth_type;
      } else if (originalMatch.dl_type !== undefined) {
        standardMatch.eth_type = originalMatch.dl_type;
      }
      // Use ipv4_src, fallback to nw_src if ipv4_src doesn't exist (convert nw_* to ipv4_*)
      if (originalMatch.ipv4_src !== undefined) {
        standardMatch.ipv4_src = originalMatch.ipv4_src;
      } else if (originalMatch.nw_src !== undefined) {
        standardMatch.ipv4_src = originalMatch.nw_src;
      }
      // Use ipv4_dst, fallback to nw_dst if ipv4_dst doesn't exist (convert nw_* to ipv4_*)
      if (originalMatch.ipv4_dst !== undefined) {
        standardMatch.ipv4_dst = originalMatch.ipv4_dst;
      } else if (originalMatch.nw_dst !== undefined) {
        standardMatch.ipv4_dst = originalMatch.nw_dst;
      }
      // Use ip_proto, fallback to nw_proto if ip_proto doesn't exist (convert nw_proto to ip_proto)
      if (originalMatch.ip_proto !== undefined) {
        standardMatch.ip_proto = originalMatch.ip_proto;
      } else if (originalMatch.nw_proto !== undefined) {
        standardMatch.ip_proto = originalMatch.nw_proto;
      }
      if (originalMatch.tcp_src !== undefined) standardMatch.tcp_src = originalMatch.tcp_src;
      if (originalMatch.tcp_dst !== undefined) standardMatch.tcp_dst = originalMatch.tcp_dst;
      if (originalMatch.udp_src !== undefined) standardMatch.udp_src = originalMatch.udp_src;
      if (originalMatch.udp_dst !== undefined) standardMatch.udp_dst = originalMatch.udp_dst;
      if (originalMatch.src_port !== undefined) standardMatch.src_port = originalMatch.src_port;
      if (originalMatch.dst_port !== undefined) standardMatch.dst_port = originalMatch.dst_port;
      if (originalMatch.icmpv4_type !== undefined) standardMatch.icmpv4_type = originalMatch.icmpv4_type;
      if (originalMatch.icmpv4_code !== undefined) standardMatch.icmpv4_code = originalMatch.icmpv4_code;

      flowEntry = {
        dpid: originalFlowEntry.dpid,
        match: standardMatch,
        actions,
        priority: originalFlowEntry.flow.priority !== undefined && originalFlowEntry.flow.priority !== null 
          ? originalFlowEntry.flow.priority 
          : 0,
      };
    }

    try {
      setLoading(true);
      if (operationType === 'install') {
        const payload = {
          install_flow_entries: [flowEntry],
          modify_flow_entries: [],
          delete_flow_entries: [],
        };
        console.log('Install flow entry payload:', JSON.stringify(payload, null, 2));
        await apiService.installModifyDeleteFlowEntries(payload);
        alert('Flow added successfully!');
      } else if (operationType === 'modify') {
        const payload = {
          install_flow_entries: [],
          modify_flow_entries: [flowEntry],
          delete_flow_entries: [],
        };
        console.log('Modify flow entry payload:', JSON.stringify(payload, null, 2));
        await apiService.installModifyDeleteFlowEntries(payload);
        alert('Flow modified successfully!');
      }
      setShowForm(false);
      setOriginalFlowEntry(null); // Clear original flow entry after successful operation
    } catch (error: any) {
      alert(`Error ${operationType === 'install' ? 'adding' : 'modifying'} flow: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [formData, operationType, originalFlowEntry]);

  const handleAddFlow = useCallback(() => {
    setShowForm(true);
    setOperationType('install');
    setFormData(DEFAULT_FORM_DATA);
    setSwitchNameError(null);
    setOriginalFlowEntry(null); // Clear original flow entry for install
  }, []);

  const handleEditFlow = useCallback(
    (flow: SelectedFlow) => {
      let switchName = '';
      if (latestGraphData) {
        const switchNode = latestGraphData.nodes.find(node => node.dpid === flow.dpid);
        if (switchNode) switchName = switchNode.device_name;
      }

      // Store original flow entry for modify operation
      setOriginalFlowEntry(flow);

      setFormData({
        switchName,
        dpid: String(flow.dpid),
        priority: String(flow.flow.priority),
        matchFields: convertMatchToMatchFields(flow.flow.match),
        instructions: 'Write-Actions',
        actions: flow.flow.actions.map(action => {
          if (action.startsWith('OUTPUT:')) {
            return { type: 'OUTPUT', port: action.split(':')[1] };
          }
          return { type: 'DROP', port: '' };
        }),
      });
      setSwitchNameError(null);
      setOperationType('modify');
      setShowForm(true);
    },
    [latestGraphData]
  );

  const handleDeleteFlow = useCallback((flow: SelectedFlow) => {
    setDeleteDialog({ open: true, flow });
  }, []);

  const confirmDeleteFlow = useCallback(async () => {
    if (!deleteDialog.flow) return;
    setLoading(true);
    setError(null);
    setDeleteLoading(true);

    try {
      const originalMatch = deleteDialog.flow.flow.match;
      const originalPriority = deleteDialog.flow.flow.priority;
      
      // console.log('Original flow data:', { 
      //   dpid: deleteDialog.flow.dpid,
      //   priority: originalPriority,
      //   match: originalMatch,
      // });

      const standardMatch: any = {};

      // Include ALL match fields from original entry to ensure exact match for deletion
      // Standard fields
      // Use only ipv4_* and ip_proto (not nw_*), and only eth_type (not dl_type)
      if (originalMatch.in_port !== undefined) standardMatch.in_port = originalMatch.in_port;
      if (originalMatch.dl_src !== undefined) standardMatch.dl_src = originalMatch.dl_src;
      if (originalMatch.dl_dst !== undefined) standardMatch.dl_dst = originalMatch.dl_dst;
      if (originalMatch.vlan_id !== undefined) standardMatch.vlan_id = originalMatch.vlan_id;
      // Use eth_type, fallback to dl_type if eth_type doesn't exist
      if (originalMatch.eth_type !== undefined) {
        standardMatch.eth_type = originalMatch.eth_type;
      } else if (originalMatch.dl_type !== undefined) {
        standardMatch.eth_type = originalMatch.dl_type;
      }
      // Use ipv4_src, fallback to nw_src if ipv4_src doesn't exist (convert nw_* to ipv4_*)
      if (originalMatch.ipv4_src !== undefined) {
        standardMatch.ipv4_src = originalMatch.ipv4_src;
      } else if (originalMatch.nw_src !== undefined) {
        standardMatch.ipv4_src = originalMatch.nw_src;
      }
      // Use ipv4_dst, fallback to nw_dst if ipv4_dst doesn't exist (convert nw_* to ipv4_*)
      if (originalMatch.ipv4_dst !== undefined) {
        standardMatch.ipv4_dst = originalMatch.ipv4_dst;
      } else if (originalMatch.nw_dst !== undefined) {
        standardMatch.ipv4_dst = originalMatch.nw_dst;
      }

      // Protocol: must include ip_proto if it exists (convert nw_proto to ip_proto)
      if (originalMatch.ip_proto !== undefined) {
        standardMatch.ip_proto = originalMatch.ip_proto;
      } else if (originalMatch.protocol !== undefined) {
        standardMatch.ip_proto = originalMatch.protocol;
      } else if (originalMatch.nw_proto !== undefined) {
        standardMatch.ip_proto = originalMatch.nw_proto;
      }

      // Ports: preserve all protocol-specific port fields
      if (originalMatch.tcp_src !== undefined) standardMatch.tcp_src = originalMatch.tcp_src;
      if (originalMatch.tcp_dst !== undefined) standardMatch.tcp_dst = originalMatch.tcp_dst;
      if (originalMatch.udp_src !== undefined) standardMatch.udp_src = originalMatch.udp_src;
      if (originalMatch.udp_dst !== undefined) standardMatch.udp_dst = originalMatch.udp_dst;
      // Fallback for generic port fields
      if (originalMatch.src_port !== undefined) standardMatch.src_port = originalMatch.src_port;
      if (originalMatch.dst_port !== undefined) standardMatch.dst_port = originalMatch.dst_port;

      // ICMP fields
      if (originalMatch.icmpv4_type !== undefined) standardMatch.icmpv4_type = originalMatch.icmpv4_type;
      if (originalMatch.icmpv4_code !== undefined) standardMatch.icmpv4_code = originalMatch.icmpv4_code;

      // Include any other fields that might exist in the original match
      const excludedFields = new Set(['nw_src', 'nw_dst', 'nw_proto', 'dl_type']);
      Object.keys(originalMatch).forEach(key => {
        if (!standardMatch.hasOwnProperty(key) && originalMatch[key] !== undefined && !excludedFields.has(key)) {
          standardMatch[key] = originalMatch[key];
        }
      });

      if (Object.keys(standardMatch).length === 0) {
        standardMatch.eth_type = 2048;
      }

      // Priority included
      const deleteEntry: { dpid: number; priority: number; match: object } = {
        dpid: deleteDialog.flow.dpid,
        priority: originalPriority !== undefined && originalPriority !== null ? originalPriority : 0,
        match: standardMatch,
      };

      console.log('Delete request payload:', JSON.stringify({
        install_flow_entries: [],
        modify_flow_entries: [],
        delete_flow_entries: [deleteEntry],
      }, null, 2));

      await apiService.installModifyDeleteFlowEntries({
        install_flow_entries: [],
        modify_flow_entries: [],
        delete_flow_entries: [deleteEntry],
      });

      setDeleteDialog({ open: false, flow: null });
      alert('Flow deleted successfully!');
    } catch (error: any) {
      setError(error?.message || 'Error deleting flow');
    } finally {
      setLoading(false);
      setDeleteLoading(false);
    }
  }, [deleteDialog.flow]);

  // Match Field Helpers
  const getAvailableMatchFields = useCallback(() => {
    const selectedFields = formData.matchFields.map(field => field.field);
    // Determine currently selected protocol (if any)
    const protocolField = formData.matchFields.find(mf => mf.field === 'protocol');
    const proto = protocolField?.value?.toUpperCase().trim();

    const baseAllowed = ['eth_type', 'ipv4_src', 'ipv4_dst', 'protocol'];
    let extraAllowed: string[] = [];

    if (proto === 'TCP') {
      extraAllowed = ['tcp_src', 'tcp_dst'];
    } else if (proto === 'UDP') {
      extraAllowed = ['udp_src', 'udp_dst'];
    } else if (proto === 'ICMP') {
      extraAllowed = ['icmpv4_type', 'icmpv4_code'];
    }

    const allowed = new Set([...baseAllowed, ...extraAllowed]);

    return MATCH_FIELD_OPTIONS.filter(
      option => allowed.has(option.value) && !selectedFields.includes(option.value)
    );
  }, [formData.matchFields]);

  const addDependentFields = useCallback(
    (newMatchFields: FormData['matchFields'], newField: string) => {
      const needsEthType =
        IPV4_DEPENDENT_FIELDS.includes(newField) || PORT_DEPENDENT_FIELDS.includes(newField);
      const needsProtocol = PORT_DEPENDENT_FIELDS.includes(newField);

      if (needsEthType && !newMatchFields.some(mf => mf.field === 'eth_type')) {
        newMatchFields.push({ field: 'eth_type', value: DEFAULT_ETH_TYPE, mask: '' });
      }
      if (needsProtocol && !newMatchFields.some(mf => mf.field === 'protocol')) {
        newMatchFields.push({ field: 'protocol', value: DEFAULT_PROTOCOL, mask: '' });
      }
    },
    []
  );

  const removeDependentFields = useCallback((remainingFields: FormData['matchFields'], removedField: string) => {
    const newMatchFields = [...remainingFields];

    if (removedField === 'eth_type') {
      const hasDependent = remainingFields.some(
        mf => IPV4_DEPENDENT_FIELDS.includes(mf.field) || PORT_DEPENDENT_FIELDS.includes(mf.field)
      );
      if (hasDependent) {
        newMatchFields.push({ field: 'eth_type', value: DEFAULT_ETH_TYPE, mask: '' });
      }
    }

    if (removedField === 'protocol') {
      const hasPortDependent = remainingFields.some(mf => PORT_DEPENDENT_FIELDS.includes(mf.field));
      if (hasPortDependent) {
        newMatchFields.push({ field: 'protocol', value: DEFAULT_PROTOCOL, mask: '' });
      }
    }

    return newMatchFields;
  }, []);

  const addMatchField = useCallback(() => {
    const availableFields = getAvailableMatchFields();
    if (availableFields.length > 0) {
      const newField = availableFields[0].value;
      setFormData(prev => {
        const newMatchFields = [...prev.matchFields, { field: newField, value: '', mask: '' }];
        addDependentFields(newMatchFields, newField);
        return { ...prev, matchFields: newMatchFields };
      });
    }
  }, [getAvailableMatchFields, addDependentFields]);

  const removeMatchField = useCallback(
    (index: number) => {
      setFormData(prev => {
        const fieldToRemove = prev.matchFields[index];
        const remainingFields = prev.matchFields.filter((_, i) => i !== index);
        const newMatchFields = removeDependentFields(remainingFields, fieldToRemove.field);
        return { ...prev, matchFields: newMatchFields };
      });
    },
    [removeDependentFields]
  );

  const updateMatchField = useCallback(
    (index: number, field: string, value: string, mask?: string) => {
      setFormData(prev => {
        const updatedMatchFields = prev.matchFields.map((item, i) =>
          i === index ? { ...item, field, value, mask: mask || item.mask } : item
        );
        const newMatchFields = [...updatedMatchFields];
        addDependentFields(newMatchFields, field);
        return { ...prev, matchFields: newMatchFields };
      });
    },
    [addDependentFields]
  );

  const handleActionAdd = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      actions: [...prev.actions, { type: 'OUTPUT', port: '' }],
    }));
  }, []);

  const handleActionUpdate = useCallback((index: number, updates: Partial<FormData['actions'][0]>) => {
    setFormData(prev => {
      const newActions = prev.actions.map((action, i) => (i === index ? { ...action, ...updates } : action));
      return { ...prev, actions: newActions };
    });
  }, []);

  const handleActionRemove = useCallback((index: number) => {
    setFormData(prev => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index),
    }));
  }, []);

  const filteredFlows = useMemo(() => flowData, [flowData]);

  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      <div className="flex h-full gap-6">
        {/* Left Side - Topology */}
        <div className="flex-1 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
          <div className="flex h-full flex-col">
            <div className="flex-1 p-4">
              <Topology
                ref={topologyRef}
                onNodeSelect={handleNodeSelect}
                onEdgeSelect={handleEdgeSelect}
                width="100%"
                height="100%"
                selectedNodeId={selectedSwitchDpid}
                selectedEdgeId={selectedEdge ? `${selectedEdge.src}-${selectedEdge.dst}` : null}
                multiSelectMode={true}
              />
            </div>
          </div>
        </div>

        {/* Right Side - Flow Table Panel */}
        <div className="w-2/5 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
          <FlowTablePanel
            flowData={filteredFlows}
            graphData={latestGraphData}
            loading={loading}
            error={error || undefined}
            onAdd={handleAddFlow}
            onEdit={handleEditFlow}
            onDelete={handleDeleteFlow}
            selectedSwitchDpid={selectedSwitchDpid}
            initialSearchValue={initialSearchValue}
          />
        </div>

        {/* Panel Manager */}
        <PanelManager
          panels={panels}
          onPanelClose={handleClosePanel}
          onPanelClick={bringToFront}
          onShowSwitchPorts={handleShowSwitchPorts}
          onHighlightPortLink={handleHighlightPortLink}
          onClearPortHighlight={handleClearPortHighlight}
          onAddPanel={handleAddChildPanel}
          onUpdatePanelData={handleUpdatePanelData}
        />

        {/* Flow Entry Form Modal */}
        {showForm && operationType !== 'delete' && (
          <FlowEntryForm
            formData={formData}
            operationType={operationType === 'install' ? 'install' : 'modify'}
            loading={loading}
            switchOptions={switchOptions}
            switchNameError={switchNameError}
            portError={portError}
            onClose={() => setShowForm(false)}
            onSwitchNameChange={handleSwitchNameChange}
            onFormDataChange={updates => setFormData(prev => ({ ...prev, ...updates }))}
            onMatchFieldUpdate={updateMatchField}
            onMatchFieldAdd={addMatchField}
            onMatchFieldRemove={removeMatchField}
            onActionAdd={handleActionAdd}
            onActionUpdate={handleActionUpdate}
            onActionRemove={handleActionRemove}
            onAvailableMatchFields={getAvailableMatchFields}
            onSubmit={handleFlowOperation}
          />
        )}

        {/* Delete Dialog */}
        <DeleteDialog
          open={deleteDialog.open}
          loading={deleteLoading}
          onClose={() => setDeleteDialog({ open: false, flow: null })}
          onConfirm={confirmDeleteFlow}
        />
      </div>
    </div>
  );
};

export default SwitchFlowTable;
