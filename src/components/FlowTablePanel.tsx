import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getDeviceNameFromDPID } from '../utils/utility';
import type { GraphDataType, FlowEntryType } from '../types';

interface SelectedFlow {
  dpid: number;
  flow: FlowEntryType['flows'][string][0];
  index: number;
}

interface FlowTablePanelProps {
  flowData: FlowEntryType[];
  graphData: GraphDataType | null;
  loading: boolean;
  error?: string;
  onAdd: () => void;
  onEdit: (flow: SelectedFlow) => void;
  onDelete: (flow: SelectedFlow) => void;
  selectedSwitchDpid?: string | null;
  initialSearchValue?: string;
}

const MATCH_LABELS: Record<string, string> = {
  ipv4_dst: 'IP Dst',
  nw_dst: 'IP Dst',
  ipv4_src: 'IP Src',
  nw_src: 'IP Src',
  dl_dst: 'MAC Dst',
  eth_dst: 'MAC Dst',
  dl_src: 'MAC Src',
  eth_src: 'MAC Src',
  in_port: 'In Port',
  eth_type: 'Eth Type',
  dl_type: 'Eth Type',
};

function matchKeyLabel(key: string) {
  return (
    MATCH_LABELS[key] ||
    key.replace(/_/g, ' ').replace(/\b([a-z])/g, m => m.toUpperCase())
  );
}

function formatActions(actions: string[]) {
  if (!actions || actions.length === 0) return 'DROP';
  return actions.join(', ');
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Sub-components
const SearchBar: React.FC<{ search: string; onSearchChange: (value: string) => void; onAdd: () => void }> = ({
  search,
  onSearchChange,
  onAdd,
}) => {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex items-center gap-2">
      <input
        type="text"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder={t('flow.searchPlaceholder') || 'Search by Switch name'}
        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
      />
      <button
        onClick={onAdd}
        className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white shadow transition-colors duration-200 hover:bg-blue-600"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {t('flow.addEntry') || 'Add Entry'}
      </button>
    </div>
  );
};

const ErrorState: React.FC<{ error: string }> = ({ error }) => (
  <div className="flex flex-1 flex-col items-center justify-center text-red-500">
    <span className="mb-2">{error}</span>
  </div>
);

const EmptyState: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
      <svg className="mb-2 h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 17v-2a4 4 0 018 0v2M9 17H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4m-6 0v2a2 2 0 002 2h4a2 2 0 002-2v-2"
        />
      </svg>
      {t('flow.noFlowsFound') || 'No flows found.'}
    </div>
  );
};

const MatchFields: React.FC<{ match: Record<string, unknown> | undefined }> = ({ match }) => {
  const hasMatch = match && Object.keys(match).length > 0;
  return (
    <div className="flex flex-wrap gap-1">
      {hasMatch &&
        Object.entries(match).map(([k, v]) => (
          <span
            key={k}
            className="inline-block rounded border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
          >
            {matchKeyLabel(k)}: {String(v)}
          </span>
        ))}
      {!hasMatch && (
        <span className="inline-block rounded border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
          (All others)
        </span>
      )}
    </div>
  );
};

const ActionButtons: React.FC<{
  dpid: number;
  flow: FlowEntryType['flows'][string][0];
  index: number;
  onEdit: (flow: SelectedFlow) => void;
  onDelete: (flow: SelectedFlow) => void;
}> = ({ dpid, flow, index, onEdit, onDelete }) => {
  const { t } = useTranslation();
  return (
    <>
      <button
        title={t('common.edit') || 'Modify'}
        onClick={() => onEdit({ dpid, flow, index })}
        className="rounded p-1 text-blue-600 transition hover:bg-blue-100"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.232 5.232l3.536 3.536M9 13h3l8-8a2.828 2.828 0 00-4-4l-8 8v3z"
          />
        </svg>
      </button>
      <button
        title={t('common.delete') || 'Delete'}
        onClick={() => onDelete({ dpid, flow, index })}
        className="ml-1 rounded p-1 text-red-600 transition hover:bg-red-100"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </>
  );
};

const FlowTableHeader: React.FC = () => (
  <thead className="sticky top-[8px] z-10 border-b border-gray-200 bg-white">
    <tr>
      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wider text-gray-700">{'Match Fields'}</th>
      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wider text-gray-700">{'Priority'}</th>
      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wider text-gray-700">{'Action'}</th>
      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wider text-gray-700">{'Packet Count'}</th>
      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wider text-gray-700">{'Byte Count'}</th>
      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wider text-gray-700">{'Duration'}</th>
      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wider text-gray-700"></th>
    </tr>
  </thead>
);

interface FlowRowProps {
  flow: FlowEntryType['flows'][string][0];
  dpid: number;
  index: number;
  onEdit: (flow: SelectedFlow) => void;
  onDelete: (flow: SelectedFlow) => void;
}

const FlowRow: React.FC<FlowRowProps> = ({ flow, dpid, index, onEdit, onDelete }) => (
  <tr className="group border-b border-gray-100 transition last:border-b-0 hover:bg-blue-50">
    <td className="px-3 py-2">
      <MatchFields match={flow.match} />
    </td>
    <td className="px-3 py-2">{flow.priority}</td>
    <td className="px-3 py-2">
      <span className="inline-block rounded bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
        {formatActions(flow.actions)}
      </span>
    </td>
    <td className="px-3 py-2">{flow.packet_count != null ? flow.packet_count.toLocaleString() : '0'}</td>
    <td className="px-3 py-2">{flow.byte_count != null ? flow.byte_count.toLocaleString() : '0'}</td>
    <td className="px-3 py-2">{flow.duration_sec != null ? formatDuration(flow.duration_sec) : '00:00:00'}</td>
    <td className="px-3 py-2">
      <ActionButtons dpid={dpid} flow={flow} index={index} onEdit={onEdit} onDelete={onDelete} />
    </td>
  </tr>
);

interface SwitchHeaderProps {
  switchName: string;
  dpid: number;
  flowCount: number;
}

const SwitchHeader: React.FC<SwitchHeaderProps> = ({ switchName, dpid, flowCount }) => {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 rounded-t-xl border-b border-blue-200 bg-blue-100 px-4 py-2 shadow">
      <span className="inline-block rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow">
        {'Switch Name'}: {switchName}, {'Switch DPID'}: {dpid}
      </span>
      <span className="text-xs text-gray-500">
        ({flowCount} {t('flow.flows') || 'flows'})
      </span>
    </div>
  );
};

interface FlowTableProps {
  flows: FlowEntryType['flows'][string][0][];
  dpid: number;
  onEdit: (flow: SelectedFlow) => void;
  onDelete: (flow: SelectedFlow) => void;
}

const FlowTable: React.FC<FlowTableProps> = ({ flows, dpid, onEdit, onDelete }) => (
  <div className="overflow-x-auto rounded-b-xl border border-t-0 border-blue-100 bg-white shadow">
    <table className="min-w-full text-left text-sm">
      <FlowTableHeader />
      <tbody>
        {flows.map((flow, idx) => (
          <FlowRow key={idx} flow={flow} dpid={dpid} index={idx} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </tbody>
    </table>
  </div>
);

interface SwitchFlowSectionProps {
  switchData: FlowEntryType;
  graphData: GraphDataType | null;
  switchRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  onEdit: (flow: SelectedFlow) => void;
  onDelete: (flow: SelectedFlow) => void;
}

const SwitchFlowSection: React.FC<SwitchFlowSectionProps> = ({
  switchData,
  graphData,
  switchRefs,
  onEdit,
  onDelete,
}) => {
  const flows = Object.values(switchData.flows).flat();
  const switchName = graphData ? getDeviceNameFromDPID(switchData.dpid, graphData.nodes) : 'Unknown';

  return (
    <div
      className="mb-8"
      ref={el => {
        switchRefs.current[switchData.dpid] = el;
      }}
    >
      <SwitchHeader switchName={switchName} dpid={switchData.dpid} flowCount={flows.length} />
      <FlowTable flows={flows} dpid={switchData.dpid} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
};

const FlowTablePanel: React.FC<FlowTablePanelProps> = React.memo(
  ({
    flowData,
    graphData,
    error,
    onAdd,
    onEdit,
    onDelete,
    selectedSwitchDpid,
    initialSearchValue = '',
  }) => {
    const [search, setSearch] = useState(initialSearchValue);
    const switchRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

    // Update search when initialSearchValue changes
    React.useEffect(() => {
      if (initialSearchValue) {
        setSearch(initialSearchValue);
      }
    }, [initialSearchValue]);

    React.useEffect(() => {
      if (selectedSwitchDpid && switchRefs.current[selectedSwitchDpid]) {
        switchRefs.current[selectedSwitchDpid]?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    }, [selectedSwitchDpid]);

    const filteredData = useMemo(() => {
      if (!search.trim() || !graphData) return flowData;

      const lower = search.trim().toLowerCase();
      return flowData.filter(sw => {
        const switchName =
          getDeviceNameFromDPID(sw.dpid, graphData.nodes) || '';
        return switchName.toLowerCase().includes(lower);
      });
    }, [flowData, search, graphData]);

    const renderContent = () => {
      if (error) {
        return <ErrorState error={error} />;
      }

      if (filteredData.length === 0) {
        return <EmptyState />;
      }

      return (
        <div className="flex-1 overflow-y-auto pr-2">
          {filteredData.map(sw => (
            <SwitchFlowSection
              key={sw.dpid}
              switchData={sw}
              graphData={graphData}
              switchRefs={switchRefs}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      );
    };

    return (
      <div className="flex h-full flex-col">
        <SearchBar search={search} onSearchChange={setSearch} onAdd={onAdd} />
        {renderContent()}
      </div>
    );
  }
);

export default FlowTablePanel;
