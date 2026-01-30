
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, Role, SpeechState, EvaluationResult } from './types';
import { getGeminiChatResponse, evaluateSpeaking } from './geminiService';

// Speech Recognition Type Definition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: Role.ASSISTANT,
      content: "Hi! I'm LinguaBot. I'm here to help you practice your English. Ready to start talking?",
      timestamp: Date.now()
    }
  ]);
  const [speechState, setSpeechState] = useState<SpeechState>({
    isListening: false,
    transcript: '',
    isProcessing: false,
    error: null
  });
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setSpeechState(prev => ({ ...prev, transcript: currentTranscript }));
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error event:', event.error);
        let userFriendlyError = "An error occurred with speech recognition.";
        
        if (event.error === 'not-allowed') {
          userFriendlyError = "Microphone access is blocked. Please check your browser's site settings and 'Allow' microphone access for this site.";
        } else if (event.error === 'no-speech') {
          userFriendlyError = "No speech was detected. Please try speaking clearly.";
        } else if (event.error === 'network') {
          userFriendlyError = "A network error occurred. Please check your internet connection.";
        } else if (event.error === 'audio-capture') {
          userFriendlyError = "No microphone was found. Please ensure your microphone is plugged in.";
        }

        setSpeechState(prev => ({ 
          ...prev, 
          error: userFriendlyError, 
          isListening: false 
        }));
      };

      recognition.onend = () => {
        setSpeechState(prev => ({ ...prev, isListening: false }));
      };

      recognitionRef.current = recognition;
    } else {
      setSpeechState(prev => ({ ...prev, error: "Web Speech API is not supported in this browser. Please use a modern browser like Chrome or Edge." }));
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, speechState.transcript]);

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || voices.find(v => v.lang.startsWith('en'));
      if (englishVoice) utterance.voice = englishVoice;

      window.speechSynthesis.speak(utterance);
    }
  };

  const startListening = async () => {
    setSpeechState(prev => ({ ...prev, error: null, transcript: '' }));
    
    try {
      // Step 1: Request permission via MediaDevices API for better browser prompt handling
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Step 2: If successful, start the SpeechRecognition
      if (recognitionRef.current) {
        setSpeechState(prev => ({ ...prev, isListening: true }));
        recognitionRef.current.start();
      }
    } catch (err: any) {
      console.error('Microphone Permission Denied:', err);
      let errMsg = "Microphone permission denied. Please allow microphone access in your browser settings to continue.";
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errMsg = "Microphone access is blocked. Click the 'lock' or 'camera/mic' icon in your browser's address bar to reset permissions.";
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errMsg = "No microphone found. Please connect a microphone and try again.";
      }
      
      setSpeechState(prev => ({ 
        ...prev, 
        error: errMsg,
        isListening: false 
      }));
    }
  };

  const stopListeningAndSend = async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setSpeechState(prev => ({ ...prev, isListening: false }));

      const finalTranscript = speechState.transcript.trim();
      if (!finalTranscript) {
        setSpeechState(prev => ({ ...prev, error: "I didn't hear anything. Try clicking 'Start Talking' again." }));
        return;
      }

      const userMessage: Message = {
        role: Role.USER,
        content: finalTranscript,
        timestamp: Date.now()
      };

      const newHistory = [...messages, userMessage];
      setMessages(newHistory);
      setSpeechState(prev => ({ ...prev, isProcessing: true, transcript: '' }));
      setEvaluation(null);

      try {
        const aiResponse = await getGeminiChatResponse(newHistory);
        const aiMessage: Message = {
          role: Role.ASSISTANT,
          content: aiResponse,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, aiMessage]);
        speakText(aiResponse);
      } catch (err) {
        setSpeechState(prev => ({ ...prev, error: "Failed to connect to LinguaBot service. Please check your connection." }));
      } finally {
        setSpeechState(prev => ({ ...prev, isProcessing: false }));
      }
    }
  };

  const handleEvaluate = async () => {
    const lastUserMessage = [...messages].reverse().find(m => m.role === Role.USER);
    if (!lastUserMessage) {
      setSpeechState(prev => ({ ...prev, error: "You haven't spoken yet! Say something first." }));
      return;
    }

    setIsEvaluating(true);
    setSpeechState(prev => ({ ...prev, error: null }));
    try {
      const result = await evaluateSpeaking(lastUserMessage.content);
      setEvaluation(result);
      setTimeout(() => {
        document.getElementById('evaluation-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      setSpeechState(prev => ({ ...prev, error: "Could not evaluate your speaking at this time." }));
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4 sm:px-6 bg-slate-50">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold text-slate-900 mb-2">
          LinguaBot <span className="text-blue-600">AI</span>
        </h1>
        <p className="text-slate-600 max-w-md mx-auto">
          Natural English practice with real-time feedback.
        </p>
      </div>

      {/* Main Chat Area */}
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 h-[600px] relative">
        {/* Messages List */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth"
        >
          {messages.map((msg, idx) => (
            <div 
              key={idx}
              className={`flex ${msg.role === Role.USER ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              <div 
                className={`max-w-[85%] px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  msg.role === Role.USER 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* Real-time transcript display */}
          {speechState.isListening && speechState.transcript && (
            <div className="flex justify-end">
              <div className="max-w-[85%] px-5 py-3 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 italic text-sm animate-pulse">
                {speechState.transcript}...
              </div>
            </div>
          )}

          {/* Processing Indicator */}
          {speechState.isProcessing && (
            <div className="flex justify-start">
              <div className="bg-slate-100 px-4 py-2 rounded-2xl flex items-center space-x-2 border border-slate-200 shadow-sm animate-pulse">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></div>
                <span className="text-xs text-slate-500 font-medium ml-2">LinguaBot is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="p-6 bg-slate-50 border-t border-slate-200">
          {speechState.error && (
            <div className="mb-4 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 p-4 rounded-2xl text-center flex flex-col items-center gap-2 animate-in zoom-in-95">
              <span className="bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center font-bold">!</span>
              {speechState.error}
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {!speechState.isListening ? (
              <button
                onClick={startListening}
                disabled={speechState.isProcessing || isEvaluating}
                className={`w-full sm:w-auto px-10 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-full shadow-lg shadow-blue-100 transition-all flex items-center justify-center space-x-3 group active:scale-95`}
              >
                <MicIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <span className="text-lg">Start Talking</span>
              </button>
            ) : (
              <button
                onClick={stopListeningAndSend}
                className="w-full sm:w-auto px-10 py-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-full shadow-lg shadow-red-100 transition-all flex items-center justify-center space-x-3 active:scale-95 animate-pulse"
              >
                <div className="w-4 h-4 bg-white rounded-sm"></div>
                <span className="text-lg">Stop & Send</span>
              </button>
            )}

            <button
              onClick={handleEvaluate}
              disabled={speechState.isListening || speechState.isProcessing || isEvaluating || messages.length < 2}
              className="w-full sm:w-auto px-6 py-4 bg-white hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-300 text-slate-700 font-semibold rounded-full border border-slate-200 transition-all shadow-sm flex items-center justify-center space-x-2 active:scale-95"
            >
              <ChartIcon className="w-5 h-5" />
              <span>{isEvaluating ? 'Analyzing...' : 'Performance Report'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Evaluation Results Section */}
      {evaluation && (
        <div id="evaluation-section" className="w-full max-w-2xl mt-12 mb-20 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="bg-white rounded-[2rem] border border-blue-100 shadow-2xl overflow-hidden">
            <div className="bg-blue-600 p-8 text-white flex flex-col sm:flex-row justify-between items-center gap-6">
              <div>
                <h2 className="text-2xl font-bold mb-1">Feedback Analysis</h2>
                <p className="text-blue-100 text-sm">Based on your recent spoken response</p>
              </div>
              <div className="flex flex-col items-center bg-white/10 px-8 py-3 rounded-2xl border border-white/20">
                <span className="text-[10px] uppercase font-bold tracking-widest opacity-80 mb-1">IELTS Estimated</span>
                <span className="text-5xl font-black">{evaluation.band_score}</span>
              </div>
            </div>

            <div className="p-8 space-y-10">
              {/* Feedback */}
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                  <StarIcon className="w-4 h-4 mr-2 text-yellow-500" />
                  Overall Assessment
                </h3>
                <p className="text-slate-700 leading-relaxed text-lg italic">
                  "{evaluation.feedback}"
                </p>
              </div>

              {/* Grammar Corrections */}
              {evaluation.grammar_corrections.length > 0 && (
                <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                    <CorrectionIcon className="w-4 h-4 mr-2 text-red-500" />
                    Better Ways to Say It
                  </h3>
                  <div className="space-y-4">
                    {evaluation.grammar_corrections.map((corr, idx) => (
                      <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-2 relative overflow-hidden group">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-100 group-hover:bg-green-100 transition-colors"></div>
                        <div className="flex items-start gap-3">
                          <span className="bg-red-50 text-red-500 text-[10px] px-2 py-0.5 rounded font-bold mt-1">SPOKEN</span>
                          <span className="text-slate-500 line-through text-sm">{corr.original}</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="bg-green-50 text-green-600 text-[10px] px-2 py-0.5 rounded font-bold mt-1">BETTER</span>
                          <span className="text-slate-900 font-bold text-base">{corr.corrected}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Improvement Tips */}
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                  <BulbIcon className="w-4 h-4 mr-2 text-blue-500" />
                  Actionable Tips
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {evaluation.tips.map((tip, idx) => (
                    <div key={idx} className="flex items-center gap-4 bg-blue-50/30 p-4 rounded-xl border border-blue-50">
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">{idx + 1}</div>
                      <p className="text-sm text-slate-700 font-medium">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50 p-8 border-t border-slate-100 text-center">
              <button 
                onClick={() => setEvaluation(null)}
                className="bg-slate-200 hover:bg-slate-300 px-6 py-2 rounded-full text-slate-600 text-sm font-bold transition-all"
              >
                Close Analysis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Icons ---

const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const ChartIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const StarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
);

const CorrectionIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const BulbIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

export default App;
