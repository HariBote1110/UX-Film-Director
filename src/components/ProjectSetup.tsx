import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { ProjectSettings } from '../types';

const STORAGE_KEY = 'ux-film-director-last-settings';

const ProjectSetup: React.FC = () => {
  const { initializeProject } = useStore();
  
  const [settings, setSettings] = useState<ProjectSettings>({
    width: 1920,
    height: 1080,
    fps: 60,
    sampleRate: 44100
  });

  const [hasLastSettings, setHasLastSettings] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setHasLastSettings(true);
    }
  }, []);

  const handleChange = (key: keyof ProjectSettings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleCreate = () => {
    // Save to local storage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    initializeProject(settings);
  };

  const handleContinue = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      initializeProject(parsed);
    }
  };

  const inputStyle = {
    background: '#333',
    border: '1px solid #555',
    color: '#fff',
    padding: '8px',
    borderRadius: '4px',
    width: '100%',
    marginBottom: '16px'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '12px',
    color: '#aaa'
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: '#1a1a1a',
      color: '#fff'
    }}>
      <div style={{
        width: '400px',
        padding: '30px',
        background: '#252526',
        borderRadius: '8px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        border: '1px solid #333'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: '20px', textAlign: 'center' }}>New Project</h2>

        {hasLastSettings && (
          <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #333' }}>
            <button 
              onClick={handleContinue}
              style={{
                width: '100%',
                padding: '12px',
                background: '#094771',
                border: 'none',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              Continue with previous settings
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Width (px)</label>
            <input 
              type="number" 
              value={settings.width} 
              onChange={(e) => handleChange('width', parseInt(e.target.value))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Height (px)</label>
            <input 
              type="number" 
              value={settings.height} 
              onChange={(e) => handleChange('height', parseInt(e.target.value))}
              style={inputStyle}
            />
          </div>
        </div>

        <label style={labelStyle}>Frame Rate (fps)</label>
        <select 
          value={settings.fps} 
          onChange={(e) => handleChange('fps', parseInt(e.target.value))}
          style={inputStyle}
        >
          <option value="24">24 fps</option>
          <option value="30">30 fps</option>
          <option value="60">60 fps</option>
        </select>

        <label style={labelStyle}>Audio Sample Rate (Hz)</label>
        <select 
          value={settings.sampleRate} 
          onChange={(e) => handleChange('sampleRate', parseInt(e.target.value))}
          style={inputStyle}
        >
          <option value="44100">44100 Hz</option>
          <option value="48000">48000 Hz</option>
        </select>

        <button 
          onClick={handleCreate}
          style={{
            width: '100%',
            padding: '12px',
            background: '#333',
            border: '1px solid #555',
            color: 'white',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            marginTop: '10px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#444'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#333'}
        >
          Create New Project
        </button>
      </div>
    </div>
  );
};

export default ProjectSetup;