import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Draggable from 'react-draggable';
import { callChatWidgetLLM, callNDTLLM } from './LLM';
import GetTopKCongestedLinks from './GetTopKCongestedLinks';
import TopKFlowsPanel from './TopKFlowsPanel';

interface Message {
  id: number;
  sender: 'user' | 'ndtwin';
  text: string;
}

const ChatWidget: React.FC = () => {
  const navigate = useNavigate();
  const getInitialMessages = (): Message[] => [
    {
      id: 1,
      sender: 'ndtwin',
      text: 'Hello, I am NDTwin assistant. How can I assist you?',
    },
  ];

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(getInitialMessages());
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(
    () => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
  const [llmResponse, setLlmResponse] = useState<any>(null);
  const [showResponsePanel, setShowResponsePanel] = useState(false);
  const [flowsResult, setFlowsResult] = useState<{
    result: string;
    explanation?: string;
  } | null>(null);
  const [showFlowsPanel, setShowFlowsPanel] = useState(false);
  const size = { width: 360, height: 480 };
  const nodeRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now(),
      sender: 'user',
      text: input,
    };
    setMessages(msgs => [...msgs, userMessage]);

    // Clear input and set loading
    const userInput = input;
    setInput('');
    setIsLoading(true);

    try {
      // Try NDT LLM API first
      const ndtResponse = await callNDTLLM(userInput, sessionId);

      if (
        ndtResponse &&
        ndtResponse.state === 'answer' &&
        ndtResponse.tasks &&
        ndtResponse.tasks.length > 0
      ) {
        // Check if it's a supported task type
        const task = ndtResponse.tasks[0];
        if (task.type === 'GetTopKCongestedLinks') {
          // Show the response panel with data
          setLlmResponse(ndtResponse);
          setShowResponsePanel(true);

          const assistantMessage: Message = {
            id: Date.now() + 1,
            sender: 'ndtwin',
            text:
              ndtResponse.explanation ||
              'Data retrieved successfully. Check the panel for details.',
          };
          setMessages(msgs => [...msgs, assistantMessage]);
        } else if (task.type === 'GetTopKFlows') {
          // Open flows panel
          setFlowsResult({
            result: task.result,
            explanation: ndtResponse.explanation,
          });
          setShowFlowsPanel(true);

          const assistantMessage: Message = {
            id: Date.now() + 1,
            sender: 'ndtwin',
            text:
              ndtResponse.explanation ||
              'Flows retrieved successfully. Check the panel for details.',
          };
          setMessages(msgs => [...msgs, assistantMessage]);
        } else if (task.type === 'RequestUIForm') {
          // Navigate to SwitchFlowTable page with parameters
          const params = task.parameters || {};
          const deviceName = params.device_name || '';
          const formType = params.form_type || '';

          // Build URL with search params
          const searchParams = new URLSearchParams();
          if (deviceName) {
            searchParams.set('device_name', deviceName);
          }
          if (formType) {
            searchParams.set('form_type', formType);
          }

          const url = `/SwitchFlowTable${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
          navigate(url);

          const assistantMessage: Message = {
            id: Date.now() + 1,
            sender: 'ndtwin',
            text:
              ndtResponse.explanation ||
              'Opening flow entry form. Please check the Switch Flow Table page.',
          };
          setMessages(msgs => [...msgs, assistantMessage]);
        } else {
          // Fallback to regular chat
          const assistantMessage: Message = {
            id: Date.now() + 1,
            sender: 'ndtwin',
            text:
              ndtResponse.explanation ||
              'I received your request but cannot process this type of query.',
          };
          setMessages(msgs => [...msgs, assistantMessage]);
        }
      } else {
        // Fallback to regular chat widget LLM
        const response = await callChatWidgetLLM(userInput);
        const assistantMessage: Message = {
          id: Date.now() + 1,
          sender: 'ndtwin',
          text:
            response ||
            'Error: Unable to get response from LLM. Please try again later.',
        };
        setMessages(msgs => [...msgs, assistantMessage]);
      }
    } catch (error) {
      console.error('Error getting LLM response:', error);

      // Try fallback to regular chat widget LLM
      try {
        const response = await callChatWidgetLLM(userInput);
        const assistantMessage: Message = {
          id: Date.now() + 1,
          sender: 'ndtwin',
          text:
            response ||
            'Error: Unable to get response from LLM. Please try again later.',
        };
        setMessages(msgs => [...msgs, assistantMessage]);
      } catch (fallbackError) {
        console.error('Fallback LLM also failed:', fallbackError);
        const errorMessage: Message = {
          id: Date.now() + 1,
          sender: 'ndtwin',
          text: 'Error: Unable to get response from LLM. Please try again later.',
        };
        setMessages(msgs => [...msgs, errorMessage]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSend();
    }
  };

  // Get message alignment class based on sender
  const getMessageAlignment = (sender: 'user' | 'ndtwin'): string => {
    return sender === 'user' ? 'justify-end' : 'justify-start';
  };

  // Get message bubble classes based on sender
  const getMessageBubbleClasses = (sender: 'user' | 'ndtwin'): string => {
    const baseClasses =
      'max-w-[80%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm shadow-sm';

    if (sender === 'user') {
      return `${baseClasses} rounded-br-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white`;
    }

    return `${baseClasses} rounded-bl-lg border border-gray-200 bg-white text-gray-800`;
  };

  // Render send button content
  const renderSendButtonContent = () => {
    if (isLoading) {
      return (
        <span className="inline-flex items-center justify-center">
          <svg
            className="-ml-1 mr-2 h-4 w-4 animate-spin text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span className="text-sm">Thinking...</span>
        </span>
      );
    }

    return 'Send';
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) {
    return (
      <div
        className="group fixed bottom-14 right-4 z-50"
        style={{ cursor: 'pointer' }}
        onClick={() => setOpen(true)}
      >
        <div className="flex h-16 w-16 transform items-center justify-center rounded-full bg-gradient-to-br from-gray-700 to-gray-900 shadow-lg transition-transform duration-200 group-hover:scale-110">
          <svg
            className="h-8 w-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* LLM Response Panel */}
      {showResponsePanel && llmResponse && (
        <GetTopKCongestedLinks
          data={llmResponse}
          onClose={() => setShowResponsePanel(false)}
        />
      )}
      {showFlowsPanel && flowsResult && (
        <TopKFlowsPanel
          result={flowsResult.result}
          explanation={flowsResult.explanation}
          onClose={() => setShowFlowsPanel(false)}
        />
      )}

      <Draggable nodeRef={nodeRef as any} handle=".drag-handle">
        <div
          ref={nodeRef}
          className="fixed z-50 flex flex-col rounded-2xl border border-gray-200/80 bg-gray-100 shadow-2xl"
          style={{
            width: size.width,
            height: size.height,
            bottom: 32,
            right: 32,
            minWidth: 280,
            minHeight: 320,
            maxWidth: 'calc(100vw - 64px)',
            maxHeight: 'calc(100vh - 64px)',
            boxSizing: 'border-box',
          }}
        >
          <div className="drag-handle flex cursor-move select-none items-center justify-between rounded-t-2xl bg-gray-800 px-4 py-3">
            <div className="flex items-center space-x-3">
              <div className="h-3 w-3 rounded-full bg-green-400"></div>
              <span className="text-sm font-semibold text-white">
                NDTwin Assistant
              </span>
            </div>
            <button
              className="rounded-full p-1 text-gray-400 hover:bg-white/10 hover:text-white"
              onClick={() => setOpen(false)}
              title="Close"
            >
              <svg
                width="20"
                height="20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
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
          <div
            className="flex-1 overflow-y-auto bg-gray-100 px-4 py-4"
            style={{ minHeight: 0 }}
          >
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`mb-4 flex ${getMessageAlignment(msg.sender)}`}
              >
                <div className={getMessageBubbleClasses(msg.sender)}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="rounded-b-2xl border-t border-gray-200/80 bg-white/50 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center rounded-lg border border-gray-300 bg-white shadow-sm transition-shadow duration-200 focus-within:ring-2 focus-within:ring-blue-400">
              <textarea
                className="flex-1 resize-none rounded-lg bg-transparent px-3 py-2 text-sm focus:outline-none"
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message here..."
                style={{ maxHeight: 80 }}
              />
              <button
                className="m-1 rounded-md bg-gradient-to-br from-blue-500 to-blue-600 px-3 py-1 font-semibold text-white shadow-sm transition-all hover:from-blue-600 hover:to-blue-700 disabled:opacity-60 disabled:shadow-none disabled:saturate-50"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
              >
                {renderSendButtonContent()}
              </button>
            </div>
          </div>
        </div>
      </Draggable>
    </>
  );
};

export default ChatWidget;
