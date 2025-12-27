
export enum FilterType {
  NONE = 'none',
  HOLLYWOOD = 'hollywood',
  NOIR = 'noir',
  CYBERPUNK = 'cyberpunk',
  VINTAGE_70S = 'vintage_70s',
  DREAMY_PASTEL = 'dreamy_pastel',
  DARK_ACADEMIA = 'dark_academia'
}

export interface EnhancementConfig {
  resolution: '720p' | '1080p' | '4k';
  aspectRatio: '16:9' | '9:16';
  filter: FilterType;
  prompt: string;
}

export interface ProcessingState {
  status: 'idle' | 'preparing' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  videoUrl?: string;
}

export interface AppState {
  apiKeySelected: boolean;
  isProcessing: boolean;
}
