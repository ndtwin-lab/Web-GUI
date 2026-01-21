import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from 'react';
import { useTranslation } from 'react-i18next';
import TraceDataManager from '../components/trace/TraceDataManager';
import TraceFileOpen from '../components/trace/TraceFileOpen';
import TraceTopology, {
  type TraceTopologyRef,
} from '../components/trace/TraceTopology';
import TraceTimeline from '../components/trace/TraceTimeline';
import TimeRangeSelector from '../components/TimeRangeSelector';
import PanelManager from '../components/PanelManager';
import LargeFileLoadingIndicator from '../components/LargeFileLoadingIndicator';
import { usePanelManager } from '../hooks/usePanelManager';

interface EdgeProps {
  src: number | string;
  dst: number | string;
  direction?: 'src2dst' | 'dst2src';
}

interface TracePlaybackRef {
  addFlowPanel: () => void;
  closeAllPanels: () => void;
}

const TracePlayback = forwardRef<TracePlaybackRef, Record<string, never>>(
  (props, ref) => {
    const { t } = useTranslation();
    const {
      panels,
      addPanel,
      closePanel,
      bringToFront,
      closeAllPanels,
      updatePanelData,
      updatePanelDataByType,
    } = usePanelManager();

    // State for file management
    const [flowDataFile, setFlowDataFile] = useState<File | null>(null);
    const [graphDataFile, setGraphDataFile] = useState<File | null>(null);
    const [isOpenSectionExpanded, setIsOpenSectionExpanded] = useState(false);

    const traceTopologyRef = useRef<TraceTopologyRef>(null);

    const handleNodeSelect = (nodeId: string | null) => {
      if (nodeId) {
        addPanel('device', nodeId);
      }
    };

    const handleEdgeSelect = (edgeData: EdgeProps | null) => {
      if (edgeData) {
        addPanel('traceLinkFlow', edgeData);
      }
    };

    const handleClosePanel = (id: string) => {
      const panelToClose = panels.find(panel => panel.id === id);
      closePanel(id);
      if (traceTopologyRef.current && panelToClose) {
        if (
          (panelToClose.type === 'linkFlow' ||
            panelToClose.type === 'traceLinkFlow') &&
          panelToClose.data
        ) {
          const edgeId = `${panelToClose.data.src}-${panelToClose.data.dst}`;
          traceTopologyRef.current.clearHighlightedEdge(edgeId);
        }
        if (
          (panelToClose.type === 'device' ||
            panelToClose.type === 'traceSwitchPort') &&
          panelToClose.data
        ) {
          traceTopologyRef.current.clearHighlightedNode(panelToClose.data);
        }
      }
    };

    const handleCloseAllPanels = () => {
      closeAllPanels();
      if (traceTopologyRef.current) {
        traceTopologyRef.current.clearHighlights();
        traceTopologyRef.current.clearPortHighlight();
      }
    };

    const handleShowSwitchPorts = (deviceId: string | number) => {
      addPanel('traceSwitchPort', deviceId);
    };

    const handleHighlightPortLink = (linkId: string) => {
      if (traceTopologyRef.current) {
        traceTopologyRef.current.highlightPortLink(linkId);
      }
    };

    const handleClearPortHighlight = () => {
      if (traceTopologyRef.current) {
        traceTopologyRef.current.clearPortHighlight();
      }
    };

    const handleClearEdgeHighlight = (edgeId: string) => {
      if (traceTopologyRef.current) {
        traceTopologyRef.current.clearHighlightedEdge(edgeId);
      }
    };

    const handleAddChildPanel = (
      type:
        | 'traceLinkFlow'
        | 'linkInfo'
        | 'perLinkFlow'
        | 'flowStacked'
        | 'traceLinkInfo'
        | 'traceLinkInfoAll'
        | 'tracePerLinkFlow'
        | 'traceFlowStacked'
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

    const updateTraceFlowPanels = useCallback(
      (flowData: any[], currentTime: string) => {
        panels.forEach(panel => {
          if (panel.type === 'traceFlow') {
            updatePanelData(panel.id, {
              flowData,
              currentTime,
            });
          }
        });
      },
      [panels, updatePanelData]
    );

    // File open handlers
    const handleFlowDataOpen = async (file: File) => {
      setFlowDataFile(file);
    };

    const handleGraphDataOpen = async (file: File) => {
      setGraphDataFile(file);
    };

    const handleRemoveFlowData = () => {
      setFlowDataFile(null);
    };

    const handleRemoveGraphData = () => {
      setGraphDataFile(null);
    };

    useImperativeHandle(ref, () => ({
      addFlowPanel: () => {
        // This will be handled in the render prop
      },
      closeAllPanels: handleCloseAllPanels,
    }));

    return (
      <TraceDataManager>
        {({
          flowData,
          graphData,
          currentTime,
          timeRange,
          availableTimePoints,
          isPlaying,
          playbackSpeed,
          openProgress,
          isOpening,
          openFlowData,
          openGraphData,
          clearData,
          getCurrentFlowData,
          getCurrentGraphData,
          getAllFlowData,
          getAllFlowDataWithLoading,
          setCurrentTime,
          setTimeRange,
          getAvailableTimePoints,
          stepToNextTime,
          stepToPreviousTime,
          startPlayback,
          pausePlayback,
          stopPlayback,
          setPlaybackSpeed,
          getNearestDataAtTime,
          abortOpen,
        }) => {
          const hasData = flowData || graphData;
          const hasFlowData = !!flowData;
          const hasGraphData = !!graphData;
          const hasBothData = hasFlowData && hasGraphData;
          const currentFlowData = getCurrentFlowData();
          const currentGraphData = getCurrentGraphData();

          React.useEffect(() => {
            if (currentFlowData && currentTime) {
              updateTraceFlowPanels(currentFlowData, currentTime);
            }
          }, [currentFlowData, currentTime, updateTraceFlowPanels]);

          return (
            <div className="flex h-screen flex-col bg-gray-50">
              {/* Large File Loading Indicator */}
              <LargeFileLoadingIndicator
                progress={openProgress?.percentage || 0}
                message={openProgress?.message || 'Processing...'}
                isVisible={isOpening}
                onCancel={abortOpen}
              />

              {/* Header with Expand/Collapse */}
              <div className="border-b border-gray-200 bg-white shadow-sm">
                {/* Header Bar */}
                <div className="border-b border-gray-100 px-6 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <h1 className="text-2xl font-semibold text-gray-900">
                        {t('trace.playback', 'Availability status')}
                      </h1>
                      {hasData && (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                          {t('trace.dataLoaded', 'Data Loaded')}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        setIsOpenSectionExpanded(!isOpenSectionExpanded)
                      }
                      className="flex items-center space-x-2 rounded-md px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
                    >
                      <span>
                        {isOpenSectionExpanded
                          ? t('trace.collapse', 'Collapse')
                          : t('trace.expand', 'Expand')}
                      </span>
                      <svg
                        className={`h-4 w-4 transition-transform duration-200 ${
                          isOpenSectionExpanded ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Collapsible Content */}
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isOpenSectionExpanded
                      ? 'max-h-screen opacity-100'
                      : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="px-6 py-4">
                    {/* Description and Action Buttons */}
                    <div className="mb-6 flex items-center justify-between">
                      <div></div>
                      <div className="flex items-center space-x-4">
                        {hasFlowData && (
                          <button
                            onClick={() =>
                              addPanel('traceFlow', {
                                flowData: currentFlowData,
                                currentTime,
                              })
                            }
                            disabled={
                              !currentFlowData || currentFlowData.length === 0
                            }
                            className={`px-4 py-2 rounded-lg transition-colors ${
                              !currentFlowData || currentFlowData.length === 0
                                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                            title={
                              !currentFlowData || currentFlowData.length === 0
                                ? 'No flow data available'
                                : 'Add Flow Panel'
                            }
                          >
                            {t('trace.addFlow', 'Add Flow Panel')}
                          </button>
                        )}
                        <button
                          onClick={handleCloseAllPanels}
                          className="rounded-lg bg-gray-600 px-4 py-2 text-white transition-colors hover:bg-gray-700"
                        >
                          {t('trace.closeAll', 'Close All Panels')}
                        </button>
                      </div>
                    </div>

                    {/* File Open and Settings Grid */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                      {/* File Open */}
                      <div className="lg:col-span-1">
                        <TraceFileOpen
                          onFlowDataOpen={async file => {
                            await openFlowData(file);
                            handleFlowDataOpen(file);
                          }}
                          onGraphDataOpen={async file => {
                            await openGraphData(file);
                            handleGraphDataOpen(file);
                          }}
                          flowDataFile={flowDataFile}
                          graphDataFile={graphDataFile}
                          onRemoveFlowData={() => {
                            handleRemoveFlowData();
                            clearData();
                          }}
                          onRemoveGraphData={() => {
                            handleRemoveGraphData();
                            clearData();
                          }}
                          openProgress={openProgress}
                          isOpening={isOpening}
                          onAbortOpen={abortOpen}
                        />
                      </div>

                      {/* Time Range Selection */}
                      <div className="lg:col-span-2">
                        <TimeRangeSelector
                          startTime={timeRange.start}
                          endTime={timeRange.end}
                          onTimeRangeChange={() => {}} // No-op since we only display time
                          disabled={!hasData}
                        />

                        {/* Timeline Component */}
                        {hasData && (
                          <div className="mt-4">
                            <TraceTimeline
                              timeRange={timeRange}
                              currentTime={currentTime}
                              isPlaying={isPlaying}
                              onTimeChange={setCurrentTime}
                              onPlayPause={() => {
                                if (isPlaying) {
                                  pausePlayback();
                                } else {
                                  startPlayback();
                                }
                              }}
                              onStop={stopPlayback}
                              onStepForward={stepToNextTime}
                              onStepBackward={stepToPreviousTime}
                              playbackSpeed={playbackSpeed}
                              onSpeedChange={setPlaybackSpeed}
                              availableTimePoints={availableTimePoints}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Content */}
              <div className="flex min-h-0 flex-1 flex-col">
                {/* Content based on available data */}
                {!hasData && (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
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
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-gray-900">
                        {t('trace.noData', 'No Data Available')}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {t(
                          'trace.openDataHint',
                          'Open historical data files to start playback'
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {hasData && (
                  <div className="flex-1 flex flex-col p-4">
                    <div className="h-[calc(100vh-200px)] bg-white rounded-lg border border-gray-200 overflow-hidden">
                      {hasGraphData && (
                        <TraceTopology
                          ref={traceTopologyRef}
                          flowData={currentFlowData}
                          graphData={currentGraphData}
                          currentTime={currentTime}
                          onNodeSelect={handleNodeSelect}
                          onEdgeSelect={handleEdgeSelect}
                          multiSelectMode={true}
                          width="100%"
                          height="100%"
                          className="w-full h-full"
                        />
                      )}

                      {!hasGraphData && (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="text-center">
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
                                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                              />
                            </svg>
                            <h3 className="mt-2 text-sm font-medium text-gray-900">
                              {t(
                                'trace.noGraphData',
                                'No Graph Data Available'
                              )}
                            </h3>
                            <p className="mt-1 text-sm text-gray-500">
                              {t(
                                'trace.openGraphDataHint',
                                'Open graph data to view network topology'
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Panel Manager */}
                <PanelManager
                  panels={panels}
                  onPanelClose={handleClosePanel}
                  onPanelClick={bringToFront}
                  onShowSwitchPorts={handleShowSwitchPorts}
                  onHighlightPortLink={handleHighlightPortLink}
                  onClearPortHighlight={handleClearPortHighlight}
                  onClearEdgeHighlight={handleClearEdgeHighlight}
                  onAddPanel={handleAddChildPanel}
                  onUpdatePanelData={handleUpdatePanelData}
                  traceFlowData={getAllFlowDataWithLoading().data}
                  traceGraphData={currentGraphData}
                  currentTime={currentTime}
                  isLoading={getAllFlowDataWithLoading().isLoading}
                  totalTimePoints={getAllFlowDataWithLoading().totalTimePoints}
                  getNearestDataAtTime={getNearestDataAtTime}
                />
              </div>
            </div>
          );
        }}
      </TraceDataManager>
    );
  }
);

export default TracePlayback;
