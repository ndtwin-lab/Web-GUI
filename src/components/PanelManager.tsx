import React from 'react';
import DeviceInformation from './DeviceInformation';
import LinkFlowInformation from './LinkFlowInformation';
import LinkInformation from './LinkInformation';
import PerLinkFlowGraph from './PerLinkFlowGraph';
import FlowStackedGraph from './FlowStackedGraph';
import SwitchPortPanel from './SwitchPortPanel';
import FlowInformation from './FlowInformation';
import AvailabilityDeviceInformation from './trace/AvailabilityDeviceInformation';
import AvailabilityLinkInformation from './trace/AvailabilityLinkInformation';
import AvailabilityLinkInformationAll from './trace/AvailabilityLinkInformationAll';
import AvailabilityFlowInformation from './trace/AvailabilityFlowInformation';
import AvailabilityLinkFlowInformation from './trace/AvailabilityLinkFlowInformation';
import AvailabilityPerLinkFlowGraph from './trace/AvailabilityPerLinkFlowGraph';
import AvailabilityFlowStackedGraph from './trace/AvailabilityFlowStackedGraph';
import AvailabilitySwitchPortPanel from './trace/AvailabilitySwitchPortPanel';

export interface Panel {
  id: string;
  type:
    | 'device'
    | 'link'
    | 'flow'
    | 'historyFlow'
    | 'linkFlow'
    | 'historyLinkFlow'
    | 'linkInfo'
    | 'perLinkFlow'
    | 'flowStacked'
    | 'switchPort'
    | 'historyLinkInfo'
    | 'historyPerLinkFlow'
    | 'historyFlowStacked'
    | 'historySwitchPort'
    | 'historyBulkChart'
    | 'historyBulkStackedChart'
    | 'traceFlow'
    | 'traceLinkFlow'
    | 'traceLinkInfo'
    | 'traceLinkInfoAll'
    | 'tracePerLinkFlow'
    | 'traceFlowStacked'
    | 'traceSwitchPort'
    | 'traceBulkChart'
    | 'traceBulkStackedChart';
  data: any;
  position?: { x: number; y: number };
  zIndex: number;
  isVisible: boolean;
}

interface PanelManagerProps {
  panels: Panel[];
  onPanelClose: (panelId: string) => void;
  onPanelClick: (panelId: string) => void;
  onShowSwitchPorts?: (deviceId: string | number) => void;
  onHighlightPortLink?: (linkId: string) => void;
  onClearPortHighlight?: () => void;
  onClearEdgeHighlight?: (edgeId: string) => void;
  onAddPanel?: (
    type:
      | 'linkInfo'
      | 'perLinkFlow'
      | 'flowStacked'
      | 'traceLinkFlow'
      | 'traceLinkInfo'
      | 'traceLinkInfoAll'
      | 'tracePerLinkFlow'
      | 'traceFlowStacked'
      | 'traceSwitchPort'
      | 'traceBulkChart'
      | 'traceBulkStackedChart',
    data: any
  ) => void;
  onUpdatePanelData?: (
    type:
      | 'perLinkFlow'
      | 'flowStacked'
      | 'tracePerLinkFlow'
      | 'traceFlowStacked',
    data: any
  ) => void;
  // Trace data props
  traceFlowData?: any[];
  traceGraphData?: any;
  currentTime?: string;
  isLoading?: boolean;
  totalTimePoints?: number;
  getNearestDataAtTime?: (time: string) => {
    flowData: any[];
    graphData: any;
    actualTime: string;
  };
}

const PanelManager: React.FC<PanelManagerProps> = ({
  panels,
  onPanelClose,
  onPanelClick,
  onShowSwitchPorts,
  onHighlightPortLink,
  onClearPortHighlight,
  onClearEdgeHighlight,
  onAddPanel,
  onUpdatePanelData,
  traceFlowData,
  traceGraphData,
  currentTime,
  isLoading = false,
  totalTimePoints = 0,
  getNearestDataAtTime,
}) => {
  const renderPanel = (panel: Panel) => {
    if (!panel.isVisible) return null;

    const commonProps = {
      style: {
        zIndex: panel.zIndex,
        position: 'fixed' as const,
        ...panel.position,
      },
      onMouseDown: () => onPanelClick(panel.id),
    };

    switch (panel.type) {
      case 'device':
        // Use trace version if we have trace data
        if (traceFlowData && traceGraphData && currentTime) {
          return (
            <div key={panel.id} {...commonProps}>
              <AvailabilityDeviceInformation
                data={panel.data}
                flowData={traceFlowData}
                graphData={traceGraphData}
                currentTime={currentTime}
                onClose={() => onPanelClose(panel.id)}
                onShowSwitchPorts={
                  onShowSwitchPorts
                    ? () => onShowSwitchPorts(panel.data)
                    : undefined
                }
                isSwitchPortsVisible={panels.some(
                  p =>
                    (p.type === 'switchPort' || p.type === 'traceSwitchPort') &&
                    (p.data === panel.data ||
                      String(p.data) === String(panel.data)) &&
                    p.isVisible
                )}
              />
            </div>
          );
        }
        // Use regular version for non-trace context
        return (
          <div key={panel.id} {...commonProps}>
            <DeviceInformation
              data={panel.data}
              onClose={() => onPanelClose(panel.id)}
              onShowSwitchPorts={
                onShowSwitchPorts
                  ? () => onShowSwitchPorts(panel.data)
                  : undefined
              }
              isSwitchPortsVisible={panels.some(
                p =>
                  (p.type === 'switchPort' || p.type === 'traceSwitchPort') &&
                  (p.data === panel.data ||
                    String(p.data) === String(panel.data)) &&
                  p.isVisible
              )}
            />
          </div>
        );

      case 'linkFlow':
        // Use trace version if we have trace data
        if (traceFlowData && traceGraphData && currentTime) {
          return (
            <div key={panel.id} {...commonProps}>
              <AvailabilityLinkFlowInformation
                data={panel.data}
                flowData={traceFlowData}
                graphData={traceGraphData}
                currentTime={currentTime}
                onClose={() => onPanelClose(panel.id)}
                onAddPanel={onAddPanel}
                onUpdatePanelData={onUpdatePanelData}
              />
            </div>
          );
        } else {
          return (
            <div key={panel.id} {...commonProps}>
              <LinkFlowInformation
                data={panel.data}
                onClose={() => onPanelClose(panel.id)}
                onAddPanel={onAddPanel}
                onUpdatePanelData={onUpdatePanelData}
              />
            </div>
          );
        }

      case 'linkInfo':
        return (
          <div key={panel.id} {...commonProps}>
            <LinkInformation
              data={panel.data}
              onClose={() => onPanelClose(panel.id)}
            />
          </div>
        );

      case 'perLinkFlow':
        return (
          <div key={panel.id} {...commonProps}>
            <PerLinkFlowGraph
              selectedFlows={panel.data}
              onClose={() => onPanelClose(panel.id)}
            />
          </div>
        );

      case 'flowStacked':
        return (
          <div key={panel.id} {...commonProps}>
            <FlowStackedGraph
              selectedFlows={panel.data}
              onClose={() => onPanelClose(panel.id)}
            />
          </div>
        );

      case 'flow':
        return (
          <div key={panel.id} {...commonProps}>
            <FlowInformation onClose={() => onPanelClose(panel.id)} />
          </div>
        );

      case 'traceFlow':
        return (
          <div key={panel.id} {...commonProps}>
            <AvailabilityFlowInformation
              flowData={panel.data.flowData}
              currentTime={panel.data.currentTime}
              onClose={() => onPanelClose(panel.id)}
            />
          </div>
        );

      case 'switchPort':
        return onHighlightPortLink && onClearPortHighlight ? (
          <div key={panel.id} {...commonProps}>
            <SwitchPortPanel
              deviceId={panel.data}
              onClose={() => onPanelClose(panel.id)}
              onHighlightLink={onHighlightPortLink}
              onClearHighlight={onClearPortHighlight}
            />
          </div>
        ) : null;

      case 'traceLinkFlow':
        return traceFlowData && traceGraphData && currentTime ? (
          <div key={panel.id} {...commonProps}>
            <AvailabilityLinkFlowInformation
              data={panel.data}
              flowData={traceFlowData}
              graphData={traceGraphData}
              currentTime={currentTime}
              onClose={() => onPanelClose(panel.id)}
              onAddPanel={onAddPanel}
              onUpdatePanelData={onUpdatePanelData}
              onClearHighlight={() => {
                if (onClearEdgeHighlight) {
                  const edgeId = `${panel.data.src}-${panel.data.dst}`;
                  onClearEdgeHighlight(edgeId);
                }
              }}
            />
          </div>
        ) : null;

      case 'traceLinkInfo':
        return traceFlowData && traceGraphData && currentTime ? (
          <div key={panel.id} {...commonProps}>
            <AvailabilityLinkInformation
              data={panel.data}
              flowData={traceFlowData}
              graphData={traceGraphData}
              currentTime={currentTime}
              onClose={() => onPanelClose(panel.id)}
              isLoading={isLoading}
              totalTimePoints={totalTimePoints}
            />
          </div>
        ) : null;

      case 'traceLinkInfoAll':
        return traceFlowData && traceGraphData && currentTime ? (
          <div key={panel.id} {...commonProps}>
            <AvailabilityLinkInformationAll
              data={panel.data}
              flowData={traceFlowData}
              graphData={traceGraphData}
              currentTime={currentTime}
              onClose={() => onPanelClose(panel.id)}
              isLoading={isLoading}
              totalTimePoints={totalTimePoints}
            />
          </div>
        ) : null;

      case 'tracePerLinkFlow':
        return traceFlowData && currentTime ? (
          <div key={panel.id} {...commonProps}>
            <AvailabilityPerLinkFlowGraph
              selectedFlows={panel.data}
              flowData={traceFlowData}
              currentTime={currentTime}
              onClose={() => onPanelClose(panel.id)}
              isLoading={isLoading}
              totalTimePoints={totalTimePoints}
            />
          </div>
        ) : null;

      case 'traceFlowStacked':
        return traceFlowData && currentTime ? (
          <div key={panel.id} {...commonProps}>
            <AvailabilityFlowStackedGraph
              selectedFlows={panel.data}
              flowData={traceFlowData}
              currentTime={currentTime}
              onClose={() => onPanelClose(panel.id)}
              isLoading={isLoading}
              totalTimePoints={totalTimePoints}
            />
          </div>
        ) : null;

      case 'traceSwitchPort':
        return traceFlowData &&
          currentTime &&
          onHighlightPortLink &&
          onClearPortHighlight ? (
          <div key={panel.id} {...commonProps}>
            <AvailabilitySwitchPortPanel
              deviceId={panel.data}
              flowData={traceFlowData}
              graphData={traceGraphData}
              currentTime={currentTime}
              onClose={() => onPanelClose(panel.id)}
              onHighlightLink={onHighlightPortLink}
              onClearHighlight={onClearPortHighlight}
            />
          </div>
        ) : null;
      default:
        return null;
    }
  };

  return <>{panels.map(renderPanel)}</>;
};

export default PanelManager;
