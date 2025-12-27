
import React from 'react';
import { FilterType } from './types';

export const FILTERS = [
  { 
    id: FilterType.HOLLYWOOD, 
    name: 'Hollywood Blockbuster', 
    description: 'High contrast, teal & orange grading, dramatic lighting.',
    icon: <i className="fas fa-film"></i>,
    prompt: 'Hollywood cinematic style, blockbuster color grading, high detail, teal and orange palette, professional lighting'
  },
  { 
    id: FilterType.NOIR, 
    name: 'Neo-Noir', 
    description: 'Moody black and white, sharp shadows, rainy textures.',
    icon: <i className="fas fa-moon"></i>,
    prompt: 'Classic film noir, high-contrast black and white, dramatic shadows, moody atmosphere, rainy textures'
  },
  { 
    id: FilterType.CYBERPUNK, 
    name: 'Neon Cyberpunk', 
    description: 'Vivid neon lights, rain-slicked streets, futuristic vibe.',
    icon: <i className="fas fa-microchip"></i>,
    prompt: 'Cyberpunk aesthetic, neon pink and blue lighting, futuristic city atmosphere, highly detailed textures'
  },
  { 
    id: FilterType.VINTAGE_70S, 
    name: '70s Vintage Film', 
    description: 'Warm grain, faded colors, nostalgic home-movie feel.',
    icon: <i className="fas fa-camera-retro"></i>,
    prompt: '1970s vintage film style, warm color temperature, subtle film grain, nostalgic mood'
  },
  { 
    id: FilterType.DREAMY_PASTEL, 
    name: 'Dreamy Pastel', 
    description: 'Soft glow, whimsical colors, ethereal lighting.',
    icon: <i className="fas fa-cloud"></i>,
    prompt: 'Ethereal dreamy pastel style, soft focus, whimsical lighting, magical atmosphere'
  }
];

export const RESOLUTIONS = [
  { id: '720p', name: '720p' },
  { id: '1080p', name: '1080p' },
  { id: '4k', name: '4K (AI Ultra HD)' }
];

export const ASPECT_RATIOS = [
  { id: '9:16', name: 'Portrait (Instagram/Reel)' },
  { id: '16:9', name: 'Landscape (Cinematic)' }
];
