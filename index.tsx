
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

interface Experience {
  role: string;
  company: string;
  duration: string;
  details: string[];
}

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
  
  // Step 1 State
  const [rawText, setRawText] = useState('');
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
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = lang === 'en' ? 'en-US' : 'zh-CN';

      recognitionRef.current.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setRawText(prev => prev + ' ' + transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsRecording(false);
      };
    }
  }, [lang]);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
    setIsRecording(!isRecording);
  };

  // --- AI Workflow Logic ---

  const handleProcessBrainstorm = async () => {
    if (!rawText.trim()) return;
    setLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Process this raw input into a structured "Experience Document". 
        Remove fillers, oral artifacts, and non-essential noise. 
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
              resumeMarkdown: { type: Type.STRING, description: "Markdown formatted resume content optimized for A4" },
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
    try {
      // For images, we use Gemini's vision capability
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
              { inlineData: { data: base64, mimeType: file.type } },
              { text: "Extract and structure all professional experiences from this image into a text format." }
            ],
            config: { systemInstruction: SYSTEM_PROMPT_BASE }
          });
          setRawText(prev => prev + '\n' + response.text);
          setLoading(false);
        };
        reader.readAsDataURL(file);
      } else {
        // For text files
        const text = await file.text();
        setRawText(prev => prev + '\n' + text);
        setLoading(false);
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  // --- UI Render Helpers ---

  const renderProgress = () => (
    <div className="flex justify-between mb-8 max-w-2xl mx-auto px-4">
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
      <header className="flex justify-between items-center mb-12">
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
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center rounded-2xl">
            <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
            <p className="text-gray-600 font-medium">
              {lang === 'zh' ? '正在处理中，请稍候...' : 'Processing your request...'}
            </p>
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
                  ? '讲讲你的过往经历，或者上传现有简历。不要担心逻辑，尽管说。' 
                  : 'Talk about your past experiences or upload an existing resume. Don\'t worry about logic.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <textarea
                  className="w-full h-64 p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-gray-50"
                  placeholder={lang === 'zh' ? "点击麦克风说话，或者直接在这里输入你的项目、工作内容..." : "Click mic to speak, or type your projects and roles here..."}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                />
                
                <div className="flex flex-wrap gap-4">
                  <button
                    onClick={toggleRecording}
                    className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-xl font-semibold transition-all shadow-md ${
                      isRecording ? 'bg-red-500 text-white pulse' : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                  >
                    <Mic size={20} />
                    {isRecording ? (lang === 'zh' ? '正在聆听...' : 'Listening...') : (lang === 'zh' ? '语音输入' : 'Start Recording')}
                  </button>
                  
                  <label className="flex-1 flex items-center justify-center gap-2 p-4 rounded-xl font-semibold bg-white border-2 border-dashed border-gray-300 text-gray-600 cursor-pointer hover:border-blue-500 hover:text-blue-500 transition-all">
                    <Upload size={20} />
                    {lang === 'zh' ? '上传文件' : 'Upload File'}
                    <input type="file" className="hidden" onChange={handleFileUpload} accept=".txt,.md,.pdf,.png,.jpg,.jpeg" />
                  </label>
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-6">
                <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                  <AlertCircle size={18} />
                  {lang === 'zh' ? '建议输入内容：' : 'Tips for Input:'}
                </h3>
                <ul className="space-y-3 text-sm text-blue-800 list-disc list-inside">
                  <li>{lang === 'zh' ? '你做过的具体项目名称' : 'Specific project names'}</li>
                  <li>{lang === 'zh' ? '你使用的技术栈或工具' : 'Technology stack or tools used'}</li>
                  <li>{lang === 'zh' ? '你的具体产出（如：提升了20%效率）' : 'Quantifiable outputs (e.g., increased efficiency by 20%)'}</li>
                  <li>{lang === 'zh' ? '你的日常职责' : 'Daily responsibilities'}</li>
                </ul>
              </div>
            </div>

            <div className="mt-10 flex justify-end">
              <button
                disabled={!rawText.trim()}
                onClick={handleProcessBrainstorm}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {lang === 'zh' ? '整理经历' : 'Organize Experience'}
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Display Experience Doc & Get JD */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-10 border border-gray-100">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={() => setStep(0)} className="p-2 hover:bg-gray-100 rounded-full">
                <ChevronLeft />
              </button>
              <h2 className="text-2xl font-bold text-gray-900">
                {lang === 'zh' ? '第二步：职位对比' : 'Step 2: Fit Check'}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">
                  {lang === 'zh' ? '已生成的经历文档' : 'Your Experience Document'}
                </label>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl whitespace-pre-wrap text-sm text-gray-700 h-80 overflow-y-auto">
                  {experienceDoc}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">
                  {lang === 'zh' ? '粘贴目标职位描述 (JD)' : 'Paste Target Job Description (JD)'}
                </label>
                <textarea
                  className="w-full h-80 p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white"
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
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {lang === 'zh' ? '开始匹配度检查' : 'Run Fit Check'}
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Fit Check Result */}
        {step === 2 && analysis && (
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-10 border border-gray-100">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={() => setStep(1)} className="p-2 hover:bg-gray-100 rounded-full">
                <ChevronLeft />
              </button>
              <h2 className="text-2xl font-bold text-gray-900">
                {lang === 'zh' ? '匹配度分析' : 'Fit Check Analysis'}
              </h2>
            </div>

            <div className="flex flex-col md:flex-row gap-10">
              {/* Score & Conclusion */}
              <div className="flex-shrink-0 flex flex-col items-center justify-center p-8 bg-gray-50 rounded-2xl border border-gray-200 w-full md:w-64">
                <div className="relative w-32 h-32 flex items-center justify-center mb-4">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-200" />
                    <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={364} strokeDashoffset={364 - (364 * analysis.score) / 100} className="text-blue-600 transition-all duration-1000" />
                  </svg>
                  <span className="absolute text-3xl font-bold">{analysis.score}</span>
                </div>
                <div className={`px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wider ${
                  analysis.score > 75 ? 'bg-green-100 text-green-700' : analysis.score > 50 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                }`}>
                  {analysis.conclusion}
                </div>
              </div>

              <div className="flex-1 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-4">{lang === 'zh' ? '职业 DNA vs JD 要求' : 'DNA vs JD Match'}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="pb-2 font-semibold text-gray-600 w-1/2">{lang === 'zh' ? '你的 DNA' : 'Your DNA'}</th>
                          <th className="pb-2 font-semibold text-gray-600 w-1/2">{lang === 'zh' ? 'JD 要求' : 'JD Requirement'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {analysis.dnaComparison.map((item, i) => (
                          <tr key={i}>
                            <td className="py-3 pr-4 text-gray-700">{item.dna}</td>
                            <td className="py-3 text-gray-700 font-medium">{item.jd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                    <h4 className="font-bold text-green-800 text-sm mb-2 uppercase">{lang === 'zh' ? '为何匹配' : 'Why it matches'}</h4>
                    <ul className="text-sm text-green-700 space-y-1">
                      {analysis.pros.map((p, i) => <li key={i}>• {p}</li>)}
                    </ul>
                  </div>
                  <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                    <h4 className="font-bold text-red-800 text-sm mb-2 uppercase">{lang === 'zh' ? '差距在哪' : 'Gaps found'}</h4>
                    <ul className="text-sm text-red-700 space-y-1">
                      {analysis.cons.map((c, i) => <li key={i}>• {c}</li>)}
                    </ul>
                  </div>
                </div>

                {analysis.score < 60 && (
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <h4 className="font-bold text-blue-800 text-sm mb-2 uppercase">{lang === 'zh' ? '推荐替代职位' : 'Alternative Job Suggestions'}</h4>
                    <div className="flex flex-wrap gap-2">
                      {analysis.alternatives.map((alt, i) => (
                        <span key={i} className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                          {alt}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-10 flex justify-end gap-4">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3 border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-all"
              >
                {lang === 'zh' ? '重新输入 JD' : 'Adjust JD'}
              </button>
              <button
                onClick={handleGenerateDraft}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
              >
                {lang === 'zh' ? '生成简历初稿' : 'Generate First Draft'}
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Diagnosis & Draft */}
        {step === 3 && (
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1 bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">{lang === 'zh' ? '简历预览' : 'Resume Preview'}</h2>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded uppercase tracking-widest font-bold">A4 Draft</span>
              </div>
              <div className="a4-container whitespace-pre-wrap text-sm text-gray-800 border-2 border-gray-50 rounded shadow-inner p-10 font-serif">
                {resumeDraft}
              </div>
            </div>

            <div className="w-full lg:w-96 space-y-6">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <AlertCircle size={20} className="text-orange-500" />
                  {lang === 'zh' ? '残酷诊断' : 'Brutal Diagnosis'}
                </h3>
                <div className="space-y-4">
                  {critiques.map((c, i) => (
                    <div key={i} className="p-4 rounded-xl border border-gray-100 bg-gray-50 text-sm relative">
                      <span className={`absolute top-4 right-4 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        c.level === 'fatal' ? 'bg-red-100 text-red-700' : c.level === 'important' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {c.level === 'fatal' ? (lang === 'zh' ? '致命' : 'Fatal') : c.level === 'important' ? (lang === 'zh' ? '重要' : 'Important') : (lang === 'zh' ? '微瑕' : 'Minor')}
                      </span>
                      <p className="font-bold text-gray-800 mb-1 pr-12">{c.text}</p>
                      <p className="text-gray-600 text-xs italic">💡 {c.suggestion}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 space-y-3">
                <h4 className="font-bold text-gray-900 mb-2">{lang === 'zh' ? '下一步动作' : 'Next Action'}</h4>
                <div className="space-y-3">
                  <div className="text-xs text-gray-500 mb-2">
                    {lang === 'zh' ? '提供更多信息以修复致命问题：' : 'Provide more info to fix issues:'}
                  </div>
                  <textarea 
                    id="extra-info"
                    className="w-full h-24 p-3 text-sm rounded-lg border border-gray-200 mb-2"
                    placeholder={lang === 'zh' ? "在此补充具体的量化成果、缺少的技能经历等..." : "Add quantified results, missing skills..."}
                  ></textarea>
                  <button 
                    onClick={() => {
                      const val = (document.getElementById('extra-info') as HTMLTextAreaElement).value;
                      handleFinalPolish(val);
                    }}
                    className="w-full flex items-center justify-center gap-2 p-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all text-sm"
                  >
                    <RotateCcw size={16} />
                    {lang === 'zh' ? '应用反馈并迭代' : 'Apply Feedback & Iterate'}
                  </button>
                  <button 
                    onClick={() => handleFinalPolish()}
                    className="w-full flex items-center justify-center gap-2 p-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all text-sm shadow-lg shadow-blue-200"
                  >
                    <CheckCircle2 size={16} />
                    {lang === 'zh' ? '最终 ATS 抛光' : 'Final ATS Polish'}
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
                <button onClick={() => setStep(3)} className="p-2 hover:bg-gray-100 rounded-full">
                  <ChevronLeft />
                </button>
                <h2 className="text-2xl font-bold text-gray-900">{lang === 'zh' ? '最终简历' : 'Final Polished Resume'}</h2>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-gray-800"
                >
                  <Download size={16} />
                  PDF (Print)
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
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-50"
                >
                  Markdown
                </button>
              </div>
            </div>

            <div className="a4-container whitespace-pre-wrap text-sm text-gray-900 font-serif leading-relaxed">
              {finalResume}
            </div>

            <div className="mt-12 p-6 bg-gray-50 rounded-2xl border border-gray-200 text-center no-print">
              <h3 className="font-bold text-gray-900 mb-2">{lang === 'zh' ? '一切就绪！' : 'Ready to Apply!'}</h3>
              <p className="text-sm text-gray-500 mb-6">
                {lang === 'zh' 
                  ? '这份简历已针对 ATS 进行了优化。祝你面试顺利！' 
                  : 'This resume is optimized for ATS. Good luck with your application!'}
              </p>
              <button 
                onClick={() => {
                  setStep(0);
                  setRawText('');
                  setJd('');
                  setExperienceDoc('');
                }}
                className="px-6 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-50"
              >
                {lang === 'zh' ? '制作下一份' : 'Create Another'}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-20 py-10 border-t border-gray-200 text-center no-print">
        <p className="text-gray-400 text-xs">
          © 2025 Don't Start From JD. Built with Gemini AI.
        </p>
      </footer>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
