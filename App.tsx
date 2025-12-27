
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { FilterType, EnhancementConfig, ProcessingState } from './types';
import { FILTERS, RESOLUTIONS, ASPECT_RATIOS } from './constants';

// --- Global helper to check for AI Studio methods ---
// Define the interface for aistudio to match the platform's requirements.
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const App: React.FC = () => {
  const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);
  const [sourceVideo, setSourceVideo] = useState<File | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [config, setConfig] = useState<EnhancementConfig>({
    resolution: '1080p',
    aspectRatio: '9:16',
    filter: FilterType.HOLLYWOOD,
    prompt: ''
  });
  const [processing, setProcessing] = useState<ProcessingState>({
    status: 'idle',
    progress: 0
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkApiKey();
  }, []);

  // Check if an API key has already been selected in the AI Studio environment.
  const checkApiKey = async () => {
    try {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setApiKeySelected(!!selected);
      }
    } catch (e) {
      console.error("Error checking API key", e);
    }
  };

  // Trigger the API key selection dialog and immediately proceed to the app state.
  const handleSelectKey = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        // GUIDELINE: Assume the key selection was successful after triggering openSelectKey()
        setApiKeySelected(true);
      }
    } catch (e) {
      console.error("Error opening key selector", e);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSourceVideo(file);
      setSourcePreviewUrl(URL.createObjectURL(file));
      setProcessing({ status: 'idle', progress: 0 });
    }
  };

  // Utility to extract the first frame of the video for the Veo image-to-video prompt.
  const getFirstFrameAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.crossOrigin = "anonymous";
      video.currentTime = 0.1;
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl.split(',')[1]);
      };
    });
  };

  const runEnhancement = async () => {
    if (!sourceVideo) return;

    setProcessing({ status: 'preparing', progress: 10 });

    try {
      // GUIDELINE: Create a new GoogleGenAI instance right before making an API call to ensure it uses the most up-to-date key.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64Frame = await getFirstFrameAsBase64(sourceVideo);
      
      const activeFilter = FILTERS.find(f => f.id === config.filter);
      const is4K = config.resolution === '4k';
      
      // Select model based on quality requirements: veo-3.1-generate-preview is high quality, veo-3.1-fast-generate-preview is faster.
      const modelName = is4K ? 'veo-3.1-generate-preview' : 'veo-3.1-fast-generate-preview';
      
      // Inject super-resolution prompts for 4K simulation (since max API res is 1080p)
      const enhancementTags = is4K 
        ? 'ultra high definition 4k resolution, extreme detail enhancement, sharp textures, high frequency detail recovery, master quality'
        : 'high definition, sharp details';

      const combinedPrompt = `${activeFilter?.prompt || 'Cinematic enhancement'} ${config.prompt}. ${enhancementTags}. Professional video restoration quality.`;

      setProcessing(prev => ({ ...prev, status: 'processing', progress: 20 }));

      let operation;
      try {
        // GUIDELINE: Video generation can take a few minutes.
        operation = await ai.models.generateVideos({
          model: modelName,
          prompt: combinedPrompt,
          image: {
            imageBytes: base64Frame,
            mimeType: 'image/png'
          },
          config: {
            numberOfVideos: 1,
            // GUIDELINE: Resolution can be 720p or 1080p.
            resolution: is4K ? '1080p' : (config.resolution as '720p' | '1080p'),
            aspectRatio: config.aspectRatio as '16:9' | '9:16'
          }
        });
      } catch (err: any) {
        // GUIDELINE: If the request fails with "Requested entity was not found.", reset key state and prompt again.
        if (err.message?.includes("Requested entity was not found")) {
          setApiKeySelected(false);
          if (window.aistudio) await window.aistudio.openSelectKey();
          setProcessing({ status: 'idle', progress: 0 });
          return;
        }
        throw err;
      }

      // Poll for operation completion.
      let pollCount = 0;
      while (!operation.done) {
        pollCount++;
        setProcessing(prev => ({ 
          ...prev, 
          progress: Math.min(20 + pollCount * 5, 98) 
        }));
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        try {
          // GUIDELINE: Create a new instance for polling to ensure current API key is used.
          const aiPoll = new GoogleGenAI({ apiKey: process.env.API_KEY });
          operation = await aiPoll.operations.getVideosOperation({ operation: operation });
        } catch (err: any) {
          if (err.message?.includes("Requested entity was not found")) {
            setApiKeySelected(false);
            if (window.aistudio) await window.aistudio.openSelectKey();
            setProcessing({ status: 'idle', progress: 0 });
            return;
          }
          throw err;
        }
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) throw new Error("Video generation failed to return a valid result.");

      // GUIDELINE: You must append an API key when fetching from the download link.
      const fetchRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      if (!fetchRes.ok) throw new Error(`Failed to download video: ${fetchRes.statusText}`);
      
      const videoBlob = await fetchRes.blob();
      const enhancedUrl = URL.createObjectURL(videoBlob);

      setProcessing({
        status: 'completed',
        progress: 100,
        videoUrl: enhancedUrl
      });
    } catch (error: any) {
      console.error("Enhancement failed", error);
      setProcessing({
        status: 'failed',
        progress: 0,
        error: error.message || "An unexpected error occurred. Please check your project billing or try a lower resolution."
      });
    }
  };

  const handleInstagramUpload = () => {
    alert("In a production environment, this triggers the Meta Graph API flow for direct Instagram Reel/Story publishing. Your enhanced video is ready for download!");
  };

  if (!apiKeySelected) {
    return (
      <div className="min-h-screen cinematic-gradient flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-zinc-900/80 backdrop-blur-xl p-10 rounded-3xl border border-zinc-800 accent-glow">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <i className="fas fa-video text-4xl text-white"></i>
          </div>
          <h1 className="text-3xl font-bold mb-4">CineBoost AI</h1>
          <p className="text-zinc-400 mb-8 leading-relaxed">
            Professional cinematic enhancement requires a high-performance AI backend. 
            Please connect your Google AI Studio account with a <strong>paid GCP project</strong> to begin.
          </p>
          <a 
            href="https://ai.google.dev/gemini-api/docs/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 text-sm block mb-6 transition-colors"
          >
            Learn about Gemini API billing <i className="fas fa-external-link-alt ml-1"></i>
          </a>
          <button 
            onClick={handleSelectKey}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-3 shadow-lg shadow-blue-900/20"
          >
            <i className="fas fa-key"></i> Connect API Key
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen cinematic-gradient flex flex-col">
      <nav className="border-b border-zinc-800 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-magic text-sm"></i>
            </div>
            <span className="text-xl font-bold tracking-tight">CINEBOOST</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => { setSourceVideo(null); setProcessing({ status: 'idle', progress: 0 }); }}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              New Project
            </button>
            <div className="h-4 w-px bg-zinc-800"></div>
            <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">VEO 3.1 PRO</span>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden aspect-[16/10] relative flex items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/black-linen.png')]">
            {!sourceVideo && !processing.videoUrl ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group cursor-pointer text-center p-12 transition-all"
              >
                <div className="w-20 h-20 bg-zinc-800 group-hover:bg-blue-600/20 group-hover:scale-110 rounded-full flex items-center justify-center mx-auto mb-6 transition-all border border-zinc-700">
                  <i className="fas fa-cloud-upload-alt text-3xl text-zinc-400 group-hover:text-blue-400"></i>
                </div>
                <h3 className="text-xl font-semibold mb-2">Upload Source Video</h3>
                <p className="text-zinc-500 max-w-xs mx-auto text-sm">
                  Upload your raw footage. CineBoost will upscale and apply cinematic grading using Google Veo.
                </p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleVideoUpload} 
                  className="hidden" 
                  accept="video/*" 
                />
              </div>
            ) : processing.status === 'completed' && processing.videoUrl ? (
              <div className="w-full h-full relative group">
                <video src={processing.videoUrl} controls autoPlay loop className="w-full h-full object-contain" />
                <div className="absolute top-4 left-4 bg-blue-600 px-3 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-2">
                  <i className="fas fa-check-circle"></i> AI ENHANCED {config.resolution.toUpperCase()}
                </div>
              </div>
            ) : sourcePreviewUrl ? (
              <div className="w-full h-full relative group">
                <video src={sourcePreviewUrl} controls className="w-full h-full object-contain" />
                <div className="absolute top-4 left-4 bg-zinc-800 px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                  ORIGINAL SOURCE
                </div>
                {processing.status === 'processing' && (
                  <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
                    <h3 className="text-xl font-bold mb-2">Enhancing Your Vision...</h3>
                    <p className="text-zinc-400 mb-6 text-sm">
                      {config.resolution === '4k' ? 'Generating Ultra HD textures using High-Quality Veo model.' : 'Upscaling to High Definition.'}
                    </p>
                    <div className="w-full max-w-xs bg-zinc-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full transition-all duration-500 ease-out" style={{ width: `${processing.progress}%` }}></div>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">{processing.progress}% Complete</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
              <i className="fas fa-bolt text-yellow-500 mb-2"></i>
              <h4 className="text-sm font-bold">Smart Upscale</h4>
              <p className="text-xs text-zinc-500">Pixel-perfect reconstruction for any display.</p>
            </div>
            <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
              <i className="fas fa-sliders-h text-blue-500 mb-2"></i>
              <h4 className="text-sm font-bold">Dynamic Grade</h4>
              <p className="text-xs text-zinc-500">Professional cinematic color palettes.</p>
            </div>
            <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
              <i className="fas fa-share-alt text-purple-500 mb-2"></i>
              <h4 className="text-sm font-bold">Direct Share</h4>
              <p className="text-xs text-zinc-500">Optimized bitrates for Instagram.</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-6">
            <h2 className="text-xl font-bold border-b border-zinc-800 pb-4 flex items-center gap-2">
              <i className="fas fa-sliders-h text-blue-500"></i> Enhancement Studio
            </h2>

            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 block">Output Quality</label>
              <div className="grid grid-cols-3 gap-2">
                {RESOLUTIONS.map(res => (
                  <button
                    key={res.id}
                    onClick={() => setConfig(prev => ({ ...prev, resolution: res.id as any }))}
                    className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                      config.resolution === res.id 
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg' 
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {res.name}
                  </button>
                ))}
              </div>
              {config.resolution === '4k' && (
                <p className="text-[10px] text-blue-400 mt-2 italic flex items-center gap-1">
                  <i className="fas fa-info-circle"></i> Uses premium HQ model for maximum detail.
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 block">Frame Ratio</label>
              <div className="grid grid-cols-2 gap-3">
                {ASPECT_RATIOS.map(ar => (
                  <button
                    key={ar.id}
                    onClick={() => setConfig(prev => ({ ...prev, aspectRatio: ar.id as any }))}
                    className={`p-3 rounded-xl border text-sm transition-all ${
                      config.aspectRatio === ar.id 
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg' 
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {ar.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 block">Cinematic Filter</label>
              <div className="grid grid-cols-1 gap-2">
                {FILTERS.map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => setConfig(prev => ({ ...prev, filter: filter.id }))}
                    className={`p-4 rounded-xl border text-left flex items-center gap-4 transition-all ${
                      config.filter === filter.id 
                      ? 'bg-zinc-800 border-blue-500 ring-2 ring-blue-500/20' 
                      : 'bg-zinc-800/40 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                      config.filter === filter.id ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {filter.icon}
                    </div>
                    <div>
                      <div className={`text-sm font-bold ${config.filter === filter.id ? 'text-white' : 'text-zinc-300'}`}>
                        {filter.name}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">{filter.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 block">AI Art Direction (Optional)</label>
              <textarea 
                placeholder="E.g., more lens flares, emphasize deep shadows, add mist..."
                value={config.prompt}
                onChange={(e) => setConfig(prev => ({ ...prev, prompt: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none h-24"
              />
            </div>

            {processing.error && (
              <div className="bg-red-900/20 border border-red-500/50 p-4 rounded-xl text-red-400 text-sm flex gap-3 animate-pulse">
                <i className="fas fa-exclamation-circle mt-1"></i>
                <div>
                  <div className="font-bold">Error Detected</div>
                  {processing.error}
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3 sticky bottom-0 bg-zinc-900 py-4 border-t border-zinc-800">
              {processing.status === 'completed' ? (
                <>
                  <button 
                    onClick={handleInstagramUpload}
                    className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 hover:opacity-90 text-white font-bold py-4 rounded-xl transition-all shadow-xl flex items-center justify-center gap-3"
                  >
                    <i className="fab fa-instagram text-xl"></i> Post to Instagram
                  </button>
                  <a 
                    href={processing.videoUrl} 
                    download={`cineboost_${config.resolution}.mp4`}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-xl transition-all text-center flex items-center justify-center gap-3"
                  >
                    <i className="fas fa-download"></i> Save to Gallery
                  </a>
                </>
              ) : (
                <button 
                  onClick={runEnhancement}
                  disabled={!sourceVideo || (processing.status !== 'idle' && processing.status !== 'failed')}
                  className={`w-full font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-3 ${
                    !sourceVideo || (processing.status !== 'idle' && processing.status !== 'failed')
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xl active:scale-[0.98]'
                  }`}
                >
                  <i className="fas fa-wand-sparkles"></i> 
                  {processing.status === 'idle' || processing.status === 'failed' ? 'Enhance Quality' : 'Processing...'}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="p-8 text-center text-zinc-600 text-xs border-t border-zinc-900 mt-auto">
        <p>&copy; 2024 CineBoost AI Studio. Optimized for Google Gemini Veo.</p>
      </footer>
    </div>
  );
};

export default App;
