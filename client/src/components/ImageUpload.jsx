import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export default function ImageUpload({ value, onChange, width = 200, height = 140, label = 'Thumbnail' }) {
  const { token } = useAuth();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.url) onChange(data.url);
    } catch (err) {
      console.error('Upload failed:', err);
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleRemove = () => {
    onChange('');
  };

  return (
    <div>
      {label && <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{label}</label>}
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        style={{
          width, height, borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
          border: '2px dashed var(--divider)', position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-primary)', transition: 'border-color 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--divider)'}
      >
        {value ? (
          <>
            <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0}
            >
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Change Image</span>
              <button onClick={(e) => { e.stopPropagation(); handleRemove(); }} style={{
                background: 'rgba(255,59,48,0.8)', color: '#fff', border: 'none', borderRadius: 6,
                padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              }}>Remove</button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 12 }}>
            {uploading ? (
              <div className="spinner" style={{ margin: '0 auto 8px' }} />
            ) : (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" style={{ marginBottom: 6 }}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>
                  Click to upload
                </p>
              </>
            )}
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
    </div>
  );
}
