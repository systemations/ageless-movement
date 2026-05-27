import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';

// All check-in photos are normalised to the same 3:4 portrait frame so the
// before/after grid lines up. The user pans/zooms; we export a fixed-size
// 900x1200 JPEG File ready for the existing /api/upload flow.
const OUT_W = 900;
const OUT_H = 1200;

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.src = url;
  });
}

async function getCroppedImg(src, cropPx) {
  const image = await createImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, cropPx.x, cropPx.y, cropPx.width, cropPx.height, 0, 0, OUT_W, OUT_H);
  return new Promise(resolve => {
    canvas.toBlob(
      b => resolve(new File([b], 'checkin.jpg', { type: 'image/jpeg' })),
      'image/jpeg',
      0.9,
    );
  });
}

export default function CropModal({ imageSrc, onCancel, onCropped }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPx, setAreaPx] = useState(null);
  const [busy, setBusy] = useState(false);

  const onComplete = useCallback((_area, px) => setAreaPx(px), []);

  const confirm = async () => {
    if (!areaPx || busy) return;
    setBusy(true);
    try {
      const file = await getCroppedImg(imageSrc, areaPx);
      onCropped(file);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000, background: '#0A1428',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
        <p style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Position your photo</p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Pinch or use the slider to zoom, drag to frame.</p>
      </div>

      <div style={{ position: 'relative', flex: 1, background: '#000' }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={3 / 4}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onComplete}
          showGrid
        />
      </div>

      <div style={{ padding: '16px', flexShrink: 0, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        <input
          type="range" min={1} max={3} step={0.01} value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          style={{ width: '100%', marginBottom: 14, accentColor: 'var(--accent)' }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--divider)',
              background: 'transparent', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            onClick={confirm}
            disabled={busy}
            style={{
              flex: 2, padding: '12px', borderRadius: 12, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 800,
              cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
            }}
          >{busy ? 'Processing...' : 'Use Photo'}</button>
        </div>
      </div>
    </div>
  );
}
