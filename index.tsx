
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Mic, 
  Upload, 
  FileText, 
  ChevronRight, 
  ChevronLeft, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  RotateCcw,
  Languages,
  Loader2,
  Trash2,
  Plus
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types & Constants ---

type Language = 'en' | 'zh';

interface AnalysisResult {
  score: number;
  dnaComparison: { dna: string; jd: string }[];
  pros: string[];
  cons: string[];
  conclusion: 'Go for it' | 'Stretch goal' | 'Pivot needed' | '大胆冲' | '够一够' | '需要转行';
  alternatives: string[];
}

interface Critique {
  level: 'fatal' | 'important' | 'minor';
  text: string;
  suggestion: string;
}

// --- AI System Prompts ---

const SYSTEM_PROMPT_BASE = `
ROLE: You are a result-oriented recruiting expert and resume analysis system.
OBJECTIVE: Maximize resume success (ATS + Human review).
STRICT RULES:
- Never fabricate, hallucinate, or exaggerate.
- No flattery or filler language.
- Stay objective and technical.
- If data is missing, mark as [MISSING].
- Strictly output in the user's requested language.
- Final resume must fit one A4 page.
`;

// --- Components ---

const App = () => {
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<Language>('zh');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  
  // Step 1 State
  const [rawText, setRawText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [experienceDoc, setExperienceDoc] = useState<string>('');
  
  // Step 2 State
  const [jd, setJd] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  
  // Step 3 State
  const [resumeDraft, setResumeDraft] = useState<string>('');
  const [critiques, setCritiques] = useState<Critique[]>([]);
  
  // Step 4 State
  const [finalResume, setFinalResume] = useState<string>('');

  const recognitionRef = useRef<any>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // --- Voice Input Logic ---

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = lang === 'en' ? 'en-US' : 'zh-CN';

      recognitionRef.current.onresult = (event: any) => {
        let finalForThisBlock = '';
        let currentInterim = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalForThisBlock += transcript;
          } else {
            currentInterim += transcript;
          }
        }
        
        if (finalForThisBlock) {
          setRawText(prev => prev + finalForThisBlock + ' ');
        }
        setInterimText(currentInterim);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsRecording(false);
      };
      
      recognitionRef.current.onend = () => {
        if (isRecording) recognitionRef.current.start();
      };
    }
  }, [lang, isRecording]);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      setInterimText('');
    } else {
      setInterimText('');
      recognitionRef.current?.start();
      setIsRecording(true);
    }
  };

  // --- AI Workflow Logic ---

  const handleProcessBrainstorm = async () => {
    if (!rawText.trim()) return;
    setLoading(true);
    setLoadingMsg(lang === 'zh' ? '正在提取核心经历...' : 'Extracting core experience...');
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Process this raw input into a structured "Experience Document". 
        Remove fillers, oral artifacts, repetitive phrases, and non-essential noise. 
        Focus on facts: what was done, tools used, and results achieved.
        Language: ${lang === 'en' ? 'English' : 'Chinese'}.
        
        Raw Input:
        ${rawText}`,
        config: { systemInstruction: SYSTEM_PROMPT_BASE }
      });
      setExperienceDoc(response.text || '');
      setStep(1);
    } catch (e) {
      console.error(e);
      alert('AI processing failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFitCheck = async () => {
    if (!jd.trim()) return;
    setLoading(true);
    setLoadingMsg(lang === 'zh' ? '正在进行岗位匹配度检查...' : 'Running Fit Check...');
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Perform a "Fit Check" between this Experience Document and Job Description.
        Compare "Professional DNA" vs "JD Requirements".
        Return JSON format.
        Language: ${lang === 'en' ? 'English' : 'Chinese'}.

        Experience:
        ${experienceDoc}

        Job Description:
        ${jd}`,
        config: {
          systemInstruction: SYSTEM_PROMPT_BASE,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              dnaComparison: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    dna: { type: Type.STRING },
                    jd: { type: Type.STRING }
                  },
                  required: ['dna', 'jd']
                }
              },
              pros: { type: Type.ARRAY, items: { type: Type.STRING } },
              cons: { type: Type.ARRAY, items: { type: Type.STRING } },
              conclusion: { type: Type.STRING },
              alternatives: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['score', 'dnaComparison', 'pros', 'cons', 'conclusion', 'alternatives']
          }
        }
      });
      setAnalysis(JSON.parse(response.text || '{}'));
      setStep(2);
    } catch (e) {
      console.error(e);
      alert('Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDraft = async () => {
    setLoading(true);
    setLoadingMsg(lang === 'zh' ? '正在为您撰写简历并进行自我诊断...' : 'Drafting resume and self-diagnosing...');
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Generate a single-page A4 resume draft and provide 5 brutal but actionable critiques.
        The resume must be ATS-friendly, quantified, and highlight both hard and soft skills found in the JD.
        Language: ${lang === 'en' ? 'English' : 'Chinese'}.

        Experience:
        ${experienceDoc}

        Job Description:
        ${jd}`,
        config: {
          systemInstruction: SYSTEM_PROMPT_BASE,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              resumeMarkdown: { type: Type.STRING },
              critiques: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    level: { type: Type.STRING, enum: ['fatal', 'important', 'minor'] },
                    text: { type: Type.STRING },
                    suggestion: { type: Type.STRING }
                  },
                  required: ['level', 'text', 'suggestion']
                }
              }
            },
            required: ['resumeMarkdown', 'critiques']
          }
        }
      });
      const data = JSON.parse(response.text || '{}');
      setResumeDraft(data.resumeMarkdown);
      setCritiques(data.critiques);
      setStep(3);
    } catch (e) {
      console.error(e);
      alert('Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalPolish = async (additionalInfo: string = "") => {
    setLoading(true);
    setLoadingMsg(lang === 'zh' ? '正在进行最后一次 ATS 抛光...' : 'Final ATS Polishing...');
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Perform final ATS polishing. Ensure all outcomes are quantified.
        Strictly stick to verified facts. No fabrication.
        If information is missing for a key JD requirement, mark it as [MISSING DATA].
        Fit to single A4 page.
        Language: ${lang === 'en' ? 'English' : 'Chinese'}.
        
        Current Draft:
        ${resumeDraft}
        
        Additional Context/Corrections:
        ${additionalInfo}`,
        config: { systemInstruction: SYSTEM_PROMPT_BASE }
      });
      setFinalResume(response.text || '');
      setStep(4);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLoadingMsg(lang === 'zh' ? `正在解析 ${file.name}...` : `Parsing ${file.name}...`);
    
    try {
      const reader = new FileReader();
      
      // 处理 PDF 和 图片 的逻辑
      if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          try {
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [
                { inlineData: { data: base64, mimeType: file.type } },
                { text: `Extract and structure all professional experiences from this ${file.type === 'application/pdf' ? 'PDF' : 'image'} into text. Keep it factual and detailed. Language: ${lang === 'en' ? 'English' : 'Chinese'}.` }
              ],
              config: { systemInstruction: SYSTEM_PROMPT_BASE }
            });
            setRawText(prev => prev + '\n' + (response.text || ''));
          } catch (apiErr) {
            console.error("AI extraction failed:", apiErr);
            alert(lang === 'zh' ? "AI 无法解析该文件，请尝试手动输入。" : "AI could not parse this file, please try manual input.");
          }
          setLoading(false);
        };
        reader.readAsDataURL(file);
      } else {
        // 普通文本文件
        reader.onload = (re) => {
          setRawText(prev => prev + '\n' + (re.target?.result as string));
          setLoading(false);
        };
        reader.readAsText(file);
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  // --- UI Render Helpers ---

  const renderProgress = () => (
    <div className="flex justify-between mb-8 max-w-2xl mx-auto px-4 no-print">
      {['Brainstorm', 'Fit Check', 'Diagnosis', 'Polish'].map((label, i) => (
        <div key={label} className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mb-1 
            ${step >= i ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            {i + 1}
          </div>
          <span className={`text-xs ${step >= i ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
            {lang === 'zh' ? ['头脑风暴', '匹配检查', '简历诊断', '最终打磨'][i] : label}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex justify-between items-center mb-12 no-print">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 text-white p-2 rounded-lg">
            <FileText size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            {lang === 'zh' ? "Don't Start From JD" : "Don't Start From JD"}
          </h1>
        </div>
        <button 
          onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm hover:bg-gray-50 transition-colors"
        >
          <Languages size={16} />
          {lang === 'en' ? '中文' : 'English'}
        </button>
      </header>

      {renderProgress()}

      <main className="relative">
        {loading && (
          <div className="fixed inset-0 bg-white/70 backdrop-blur-md z-[100] flex flex-col items-center justify-center">
            <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm text-center border border-blue-50">
              <Loader2 className="animate-spin text-blue-600 mb-6" size={56} />
              <p className="text-gray-900 font-bold text-lg mb-2">
                {lang === 'zh' ? 'AI 正在全力以赴...' : 'AI is working hard...'}
              </p>
              <p className="text-gray-500 text-sm">
                {loadingMsg}
              </p>
            </div>
          </div>
        )}

        {/* Step 0: Brainstorming */}
        {step === 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-10 border border-gray-100">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {lang === 'zh' ? '第一步：头脑风暴' : 'Step 1: Brainstorming'}
              </h2>
              <p className="text-gray-500">
                {lang === 'zh' 
                  ? '讲讲你的过往经历，或者上传现有简历（PDF/图片）。AI 会自动为您整理。' 
                  : 'Talk about your past experiences or upload an existing resume (PDF/Image).'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="relative group">
                  <textarea
                    className="w-full h-72 p-6 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-gray-50 text-gray-800 transition-all font-medium leading-relaxed"
                    placeholder={lang === 'zh' ? "点击下方麦克风开启语音输入，或直接在这里记录..." : "Click microphone below to start voice input, or type here..."}
                    value={rawText + (interimText ? ` (${interimText}...)` : '')}
                    onChange={(e) => setRawText(e.target.value)}
                  />
                </div>
                
                <div className="flex flex-wrap gap-4">
                  <button
                    onClick={toggleRecording}
                    className={`flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl font-bold transition-all shadow-lg ${
                      isRecording 
                        ? 'bg-red-500 text-white animate-pulse' 
                        : 'bg-gray-900 text-white hover:bg-blue-600'
                    }`}
                  >
                    <Mic size={20} />
                    {isRecording ? (lang === 'zh' ? '停止聆听' : 'Stop Listening') : (lang === 'zh' ? '开启语音输入' : 'Voice Input')}
                  </button>
                  
                  <label className="flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl font-bold bg-white border-2 border-dashed border-gray-300 text-gray-600 cursor-pointer hover:border-blue-600 hover:text-blue-600 hover:bg-blue-50 transition-all group">
                    <Upload size={20} className="group-hover:bounce" />
                    {lang === 'zh' ? '上传简历 (PDF/图)' : 'Upload Resume'}
                    <input type="file" className="hidden" onChange={handleFileUpload} accept=".txt,.md,.pdf,.png,.jpg,.jpeg" />
                  </label>
                </div>
              </div>

              <div className="bg-blue-50/50 rounded-2xl p-8 border border-blue-100">
                <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2 text-lg">
                  <AlertCircle size={22} />
                  {lang === 'zh' ? '头脑风暴建议：' : 'Brainstorming Tips:'}
                </h3>
                <ul className="space-y-4 text-sm text-blue-800 leading-relaxed">
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center text-[10px] font-bold">1</span>
                    {lang === 'zh' ? '不要在乎语病，尽管把你能想到的项目细节、职责都说出来。' : "Don't worry about grammar, just list every project detail you remember."}
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
                    {lang === 'zh' ? '如果有现有简历，直接上传，我们可以从中提取数据作为基础。' : 'Upload your existing resume to use its data as a foundation.'}
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-200 rounded-full flex items-center justify-center text-[10px] font-bold">3</span>
                    {lang === 'zh' ? '多说具体的数字（如：销售额、活跃用户、节省的时间）。' : 'Use specific numbers (e.g., sales, active users, time saved).'}
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-10 flex justify-end">
              <button
                disabled={!rawText.trim()}
                onClick={handleProcessBrainstorm}
                className="group flex items-center gap-2 px-10 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-blue-200"
              >
                {lang === 'zh' ? '整理并生成文档' : 'Organize Experience'}
                <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Display Experience Doc & Get JD */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-10 border border-gray-100">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={() => setStep(0)} className="p-3 hover:bg-gray-100 rounded-full transition-colors">
                <ChevronLeft size={24} />
              </button>
              <h2 className="text-2xl font-bold text-gray-900">
                {lang === 'zh' ? '第二步：职位对比' : 'Step 2: Fit Check'}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-3 uppercase tracking-widest">
                  {lang === 'zh' ? '已生成的经历文档' : 'Experience Document'}
                </label>
                <div className="p-6 bg-gray-50 border border-gray-200 rounded-2xl whitespace-pre-wrap text-sm text-gray-700 h-[400px] overflow-y-auto leading-relaxed shadow-inner">
                  {experienceDoc}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-3 uppercase tracking-widest">
                  {lang === 'zh' ? '粘贴目标职位描述 (JD)' : 'Paste Target JD'}
                </label>
                <textarea
                  className="w-full h-[400px] p-6 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white text-sm leading-relaxed"
                  placeholder={lang === 'zh' ? "将你心仪岗位的 JD 粘贴到这里..." : "Paste the job description here..."}
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                disabled={!jd.trim()}
                onClick={handleFitCheck}
                className="flex items-center gap-2 px-10 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-blue-200"
              >
                {lang === 'zh' ? '运行匹配度检查' : 'Run Fit Check'}
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Fit Check Result */}
        {step === 2 && analysis && (
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-10 border border-gray-100">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={() => setStep(1)} className="p-3 hover:bg-gray-100 rounded-full">
                <ChevronLeft size={24} />
              </button>
              <h2 className="text-2xl font-bold text-gray-900">
                {lang === 'zh' ? '匹配度分析' : 'Fit Check Analysis'}
              </h2>
            </div>

            <div className="flex flex-col md:flex-row gap-12">
              <div className="flex-shrink-0 flex flex-col items-center justify-center p-10 bg-gray-50 rounded-3xl border border-gray-200 w-full md:w-72 shadow-sm">
                <div className="relative w-40 h-40 flex items-center justify-center mb-6">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-gray-200" />
                    <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="10" fill="transparent" strokeDasharray={440} strokeDashoffset={440 - (440 * analysis.score) / 100} className="text-blue-600 transition-all duration-1000" strokeLinecap="round" />
                  </svg>
                  <span className="absolute text-4xl font-extrabold text-gray-900">{analysis.score}</span>
                </div>
                <div className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest ${
                  analysis.score > 75 ? 'bg-green-100 text-green-700' : analysis.score > 50 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                }`}>
                  {analysis.conclusion}
                </div>
              </div>

              <div className="flex-1 space-y-8">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-4">{lang === 'zh' ? '核心竞争力对比' : 'Competency Gap'}</h3>
                  <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="p-4 font-bold text-gray-600 w-1/2 uppercase tracking-tighter">{lang === 'zh' ? '你的 DNA' : 'Your DNA'}</th>
                          <th className="p-4 font-bold text-gray-600 w-1/2 uppercase tracking-tighter">{lang === 'zh' ? 'JD 要求' : 'JD Requirement'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {analysis.dnaComparison.map((item, i) => (
                          <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                            <td className="p-4 text-gray-700">{item.dna}</td>
                            <td className="p-4 text-gray-700 font-semibold">{item.jd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-green-50/50 rounded-2xl border border-green-100">
                    <h4 className="font-black text-green-800 text-xs mb-3 uppercase tracking-widest">{lang === 'zh' ? '核心优势' : 'Strengths'}</h4>
                    <ul className="text-sm text-green-700 space-y-2">
                      {analysis.pros.map((p, i) => <li key={i} className="flex gap-2 font-medium"><span>✓</span> {p}</li>)}
                    </ul>
                  </div>
                  <div className="p-6 bg-red-50/50 rounded-2xl border border-red-100">
                    <h4 className="font-black text-red-800 text-xs mb-3 uppercase tracking-widest">{lang === 'zh' ? '待补齐差距' : 'Weaknesses'}</h4>
                    <ul className="text-sm text-red-700 space-y-2">
                      {analysis.cons.map((c, i) => <li key={i} className="flex gap-2 font-medium"><span>!</span> {c}</li>)}
                    </ul>
                  </div>
                </div>

                {analysis.score < 60 && (
                  <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100">
                    <h4 className="font-black text-blue-800 text-xs mb-3 uppercase tracking-widest">{lang === 'zh' ? '推荐替代路径' : 'Alternative Paths'}</h4>
                    <div className="flex flex-wrap gap-2">
                      {analysis.alternatives.map((alt, i) => (
                        <span key={i} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">
                          {alt}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-12 flex justify-end gap-4">
              <button
                onClick={() => setStep(1)}
                className="px-8 py-3 border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-all"
              >
                {lang === 'zh' ? '修改职位信息' : 'Modify JD'}
              </button>
              <button
                onClick={handleGenerateDraft}
                className="flex items-center gap-2 px-10 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-200"
              >
                {lang === 'zh' ? '生成简历初稿' : 'Draft Resume'}
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Diagnosis & Draft */}
        {step === 3 && (
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1 bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
              <div className="flex justify-between items-center mb-6 no-print">
                <h2 className="text-xl font-bold text-gray-900">{lang === 'zh' ? '简历预览 (A4)' : 'Resume Preview (A4)'}</h2>
                <span className="text-[10px] bg-black text-white px-2 py-1 rounded font-black tracking-widest">DRAFT v1.0</span>
              </div>
              <div className="a4-container whitespace-pre-wrap text-[12px] text-gray-900 border border-gray-100 rounded shadow-2xl p-16 font-serif leading-relaxed">
                {resumeDraft}
              </div>
            </div>

            <div className="w-full lg:w-96 space-y-6 no-print">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
                  <AlertCircle size={22} className="text-orange-500" />
                  {lang === 'zh' ? '专家级诊断' : 'Brutal Diagnosis'}
                </h3>
                <div className="space-y-4">
                  {critiques.map((c, i) => (
                    <div key={i} className="p-4 rounded-xl border border-gray-100 bg-gray-50 text-sm relative hover:bg-white transition-colors cursor-default">
                      <span className={`absolute top-4 right-4 text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                        c.level === 'fatal' ? 'bg-red-600 text-white' : c.level === 'important' ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'
                      }`}>
                        {c.level === 'fatal' ? (lang === 'zh' ? '致命' : 'Fatal') : c.level === 'important' ? (lang === 'zh' ? '重要' : 'Important') : (lang === 'zh' ? '微瑕' : 'Minor')}
                      </span>
                      <p className="font-bold text-gray-900 mb-2 pr-12 leading-snug">{c.text}</p>
                      <div className="p-2.5 bg-white rounded-lg border border-gray-100 text-xs text-blue-800 flex gap-2">
                        <span className="font-bold">FIX:</span>
                        <span>{c.suggestion}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-900 rounded-2xl shadow-xl p-6 text-white space-y-4">
                <h4 className="font-bold mb-1">{lang === 'zh' ? '迭代与打磨' : 'Polish & Iterate'}</h4>
                <div className="space-y-4">
                  <div className="text-xs text-gray-400">
                    {lang === 'zh' ? '补充信息（如具体数字、缺失技能的证明）：' : 'Provide more evidence or specific numbers:'}
                  </div>
                  <textarea 
                    id="extra-info"
                    className="w-full h-28 p-4 text-sm rounded-xl border-none bg-white/10 text-white focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-gray-500"
                    placeholder={lang === 'zh' ? "在此补充..." : "Type here..."}
                  ></textarea>
                  <button 
                    onClick={() => {
                      const val = (document.getElementById('extra-info') as HTMLTextAreaElement).value;
                      handleFinalPolish(val);
                    }}
                    className="w-full flex items-center justify-center gap-2 p-4 bg-white text-gray-900 rounded-xl font-black hover:bg-blue-500 hover:text-white transition-all text-sm uppercase tracking-widest"
                  >
                    <RotateCcw size={16} />
                    {lang === 'zh' ? '应用反馈并重新生成' : 'Apply & Regenerate'}
                  </button>
                  <button 
                    onClick={() => handleFinalPolish()}
                    className="w-full flex items-center justify-center gap-2 p-4 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition-all text-sm uppercase tracking-widest shadow-lg shadow-blue-900/50"
                  >
                    <CheckCircle2 size={16} />
                    {lang === 'zh' ? '执行最终 ATS 抛光' : 'Final ATS Polish'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Final Output */}
        {step === 4 && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 max-w-5xl mx-auto">
            <div className="flex flex-wrap justify-between items-center mb-8 gap-4 no-print">
              <div className="flex items-center gap-4">
                <button onClick={() => setStep(3)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <ChevronLeft />
                </button>
                <h2 className="text-2xl font-bold text-gray-900">{lang === 'zh' ? '最终简历' : 'Polished Resume'}</h2>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl text-sm font-black hover:bg-gray-800 shadow-xl transition-all"
                >
                  <Download size={16} />
                  PDF (Print A4)
                </button>
                <button 
                  onClick={() => {
                    const blob = new Blob([finalResume], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'resume.txt';
                    a.click();
                  }}
                  className="flex items-center gap-2 px-6 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all"
                >
                  Markdown
                </button>
              </div>
            </div>

            <div className="a4-container whitespace-pre-wrap text-[13px] text-gray-900 font-serif leading-relaxed border border-gray-100 shadow-2xl p-20 bg-white">
              {finalResume}
            </div>

            <div className="mt-16 p-10 bg-blue-50 rounded-3xl border border-blue-100 text-center no-print">
              <h3 className="font-black text-blue-900 mb-3 text-xl">{lang === 'zh' ? '这就是你的完美简历！' : 'Your Perfect Resume!'}</h3>
              <p className="text-sm text-blue-700 mb-8 max-w-lg mx-auto leading-relaxed">
                {lang === 'zh' 
                  ? '我们已经基于岗位需求进行了深度量化和 ATS 关键词匹配。祝你面试顺利，斩获心仪 Offer！' 
                  : 'We optimized your resume based on JD needs and ATS keywords. Good luck!'}
              </p>
              <button 
                onClick={() => {
                  setStep(0);
                  setRawText('');
                  setJd('');
                  setExperienceDoc('');
                }}
                className="px-8 py-3 bg-white border-2 border-blue-200 text-blue-600 rounded-xl font-black hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all"
              >
                {lang === 'zh' ? '重新制作一份' : 'Start Over'}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-20 py-10 border-t border-gray-100 text-center no-print">
        <p className="text-gray-400 text-xs font-medium uppercase tracking-widest">
          © 2025 DON'T START FROM JD • POWERED BY GEMINI 3 FLASH
        </p>
      </footer>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
