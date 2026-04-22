import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';

// Food search with real API (local cache + Open Food Facts fallback) and
// a native barcode scanner using the browser's BarcodeDetector API.
// - On supported browsers (Chrome/Edge mobile, Safari iOS 17+) this opens a
//   live camera feed, decodes EAN/UPC barcodes and looks them up via
//   /api/nutrition/barcode/:code (which caches results).
// - Fallback: a manual barcode entry dialog for unsupported browsers.
export default function FoodSearch({ mealType, onSelect, onBack }) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState([]);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [showManualBarcode, setShowManualBarcode] = useState(false);
  const [scanError, setScanError] = useState('');

  useEffect(() => { searchFoods(''); }, []);
  useEffect(() => {
    const timer = setTimeout(() => searchFoods(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const searchFoods = async (q) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/nutrition/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFoods(data.foods || []);
        setSource(data.source || '');
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const lookupBarcode = async (code) => {
    try {
      const res = await fetch(`/api/nutrition/barcode/${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        return data.food;
      }
      if (res.status === 404) {
        setScanError(`No product found for barcode ${code}`);
      } else {
        setScanError('Could not reach food database');
      }
    } catch (err) {
      setScanError('Barcode lookup failed');
    }
    return null;
  };

  const handleBarcodeResult = async (code) => {
    setScanning(false);
    setShowManualBarcode(false);
    setManualBarcode('');
    setScanError('');
    const food = await lookupBarcode(code);
    if (food) {
      // Drop the barcode result into the search list so the user can review + tap Add
      setFoods([food, ...foods]);
      setQuery(food.name);
    }
  };

  const openScanner = () => {
    setScanError('');
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      setScanning(true);
    } else {
      // Unsupported browser - use manual barcode entry
      setShowManualBarcode(true);
    }
  };

  return (
    <div className="page-content" style={{ paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1, textAlign: 'center' }}>{mealType}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Barcode scanner */}
          <button
            onClick={openScanner}
            title="Scan barcode"
            style={{
              width: 32, height: 32, borderRadius: '50%', background: 'rgba(61,255,210,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="16"/><line x1="9" y1="8" x2="9" y2="16"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="15" y1="8" x2="15" y2="16"/><line x1="18" y1="8" x2="18" y2="16"/>
            </svg>
          </button>
          {/* Manual barcode entry */}
          <button
            onClick={() => setShowManualBarcode(true)}
            title="Enter barcode manually"
            style={{
              width: 32, height: 32, borderRadius: '50%', background: 'rgba(61,255,210,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-mint)" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search foods, brands, recipes..."
          className="input-field"
          style={{ paddingLeft: 42, fontSize: 15 }}
        />
      </div>

      {/* Source indicator */}
      {source.includes('openfoodfacts') && (
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8, textAlign: 'center' }}>
          Powered by Open Food Facts
        </p>
      )}

      {scanError && (
        <div style={{
          background: 'rgba(255,69,58,0.15)', borderRadius: 10, padding: 10, marginBottom: 12,
          fontSize: 12, color: '#FF453A', textAlign: 'center',
        }}>
          {scanError}
        </div>
      )}

      {loading && foods.length === 0 && (
        <div style={{ textAlign: 'center', padding: 30 }}>
          <div className="spinner" />
        </div>
      )}

      {/* Food list */}
      {foods.map((food, i) => (
        <div
          key={`${food.id || 'off'}-${i}`}
          onClick={() => onSelect(food)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
            borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
          }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
            background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {food.image_url ? (
              <img src={food.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 18, opacity: 0.5 }}>🍽️</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {food.name}
              </p>
              {food.verified && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--accent-mint)">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {food.brand ? `${food.brand} · ` : ''}{food.serving || food.serving_size || '100 g'} · <span style={{ color: 'var(--accent)' }}>{food.calories} kcal</span>
            </p>
          </div>
          <button style={{
            width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      ))}

      {!loading && foods.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: 30 }}>
          No foods found. Try another search or scan a barcode.
        </p>
      )}

      {/* ===== BARCODE SCANNER MODAL ===== */}
      {scanning && (
        <BarcodeScanner
          onResult={handleBarcodeResult}
          onClose={() => setScanning(false)}
          onError={msg => { setScanError(msg); setScanning(false); }}
        />
      )}

      {/* ===== MANUAL BARCODE ENTRY ===== */}
      {showManualBarcode && (
        <div
          onClick={() => setShowManualBarcode(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: 16, padding: 24, maxWidth: 360, width: '100%',
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Enter Barcode</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Type the 8-13 digit EAN/UPC barcode number.
            </p>
            <input
              value={manualBarcode}
              onChange={e => setManualBarcode(e.target.value)}
              placeholder="e.g. 3017624010701"
              autoFocus
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                border: '1px solid var(--divider)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', fontSize: 16, outline: 'none', marginBottom: 12,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowManualBarcode(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--divider)',
                  background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={() => handleBarcodeResult(manualBarcode.trim())}
                disabled={!manualBarcode.trim()}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                  background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  opacity: manualBarcode.trim() ? 1 : 0.5,
                }}
              >Look up</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Barcode scanner using the native BarcodeDetector API.
// Opens the back camera, continuously scans for a barcode, returns the first decode.
function BarcodeScanner({ onResult, onClose, onError }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const stopRef = useRef(false);

  useEffect(() => {
    stopRef.current = false;
    let detector;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // eslint-disable-next-line no-undef
        detector = new BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
        });

        const scan = async () => {
          if (stopRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              const raw = codes[0].rawValue;
              stopRef.current = true;
              onResult(raw);
              return;
            }
          } catch (e) { /* retry next frame */ }
          requestAnimationFrame(scan);
        };
        requestAnimationFrame(scan);
      } catch (err) {
        console.error('Scanner error:', err);
        onError?.(err.name === 'NotAllowedError'
          ? 'Camera access denied. Try manual entry.'
          : 'Could not start camera');
      }
    };

    start();

    return () => {
      stopRef.current = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', zIndex: 500,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
        <button
          onClick={onClose}
          style={{
            width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
            border: 'none', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <p style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Scan Barcode</p>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {/* Targeting frame */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: '70%', height: 140, borderRadius: 14,
            border: '3px solid var(--accent-mint)',
            boxShadow: '0 0 0 3000px rgba(0,0,0,0.4)',
          }} />
        </div>
      </div>

      <p style={{ color: '#fff', fontSize: 13, textAlign: 'center', padding: 20, opacity: 0.8 }}>
        Point the camera at a product barcode
      </p>
    </div>
  );
}
