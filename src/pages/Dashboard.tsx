import { useImperativeHandle, forwardRef, useRef } from 'react';
import Topology from '../components/Topology';
import type { TopologyRef } from '../components/Topology';
import PanelManager from '../components/PanelManager';
import { usePanelManager } from '../hooks/usePanelManager';
import ChatWidget from '../components/llm/ChatWidget';

interface EdgeProps {
  src: number | string;
  dst: number | string;
  direction?: 'src2dst' | 'dst2src';
}

const Dashboard = forwardRef((props, ref) => {
  const {
    panels,
    addPanel,
    closePanel,
    bringToFront,
    closeAllPanels,
    updatePanelDataByType,
  } = usePanelManager();
  const topologyRef = useRef<TopologyRef>(null);

  const handleNodeSelect = (nodeId: string | null) => {
    if (nodeId) {
      addPanel('device', nodeId);
    }
  };

  const handleEdgeSelect = (edgeData: EdgeProps | null) => {
    if (edgeData) {
      addPanel('linkFlow', edgeData);
    }
  };

  const handleAddFlowPanel = () => {
    addPanel('flow', null);
  };

  const generateEdgeId = (edgeData: EdgeProps): string => {
    const nodeA = String(edgeData.src);
    const nodeB = String(edgeData.dst);
    // Use directional edge ID (src-dst) to match Topology component
    return `${nodeA}-${nodeB}`;
  };

  const handleClosePanel = (id: string) => {
    const panelToClose = panels.find(panel => panel.id === id);
    closePanel(id);
    if (topologyRef.current && panelToClose) {
      if (panelToClose.type === 'linkFlow' && panelToClose.data) {
        const edgeId = generateEdgeId(panelToClose.data);
        topologyRef.current.clearHighlightedEdge(edgeId);
      }
      if (panelToClose.type === 'device' && panelToClose.data) {
        topologyRef.current.clearHighlightedNode(panelToClose.data);
      }
    }
  };

  const handleCloseAllPanels = () => {
    closeAllPanels();
    if (topologyRef.current) {
      topologyRef.current.clearHighlights();
      topologyRef.current.clearPortHighlight();
    }
  };

  const handleShowSwitchPorts = (deviceId: string | number) => {
    addPanel('switchPort', deviceId);
  };

  const handleHighlightPortLink = (linkId: string) => {
    if (topologyRef.current) {
      topologyRef.current.highlightPortLink(linkId);
    }
  };

  const handleClearPortHighlight = () => {
    if (topologyRef.current) {
      topologyRef.current.clearPortHighlight();
    }
  };

  const handleAddChildPanel = (
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
  };

  const handleUpdatePanelData = (
    type:
      | 'perLinkFlow'
      | 'flowStacked'
      | 'tracePerLinkFlow'
      | 'traceFlowStacked',
    data: any
  ) => {
    updatePanelDataByType(type, data);
  };

  useImperativeHandle(ref, () => ({
    addFlowPanel: handleAddFlowPanel,
    closeAllPanels: handleCloseAllPanels,
  }));

  return (
    <>
      <Topology
        ref={topologyRef}
        onNodeSelect={handleNodeSelect}
        onEdgeSelect={handleEdgeSelect}
        multiSelectMode={true}
      />
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
      <ChatWidget />
    </>
  );
});

export default Dashboard;
