import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { lookupBarcode, searchProducts } from '../utils/openFoodFacts';
import { AL } from '../data/constants';
import { getGIRisk, GI_RISK_CATS } from '../data/giRisk';

export default function BarcodeScanner({ onSelect, onClose }) {
  const [mode, setMode] = useState('scan');
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [product, setProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const scannerRef = useRef(null);
  const scannerDivId = 'barcode-reader';

  const startScanner = useCallback(async () => {
    try {
      setError('');
      setScanning(true);
      const html5QrCode = new Html5Qrcode(scannerDivId);
      scannerRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.0 },
        async (decodedText) => {
          await html5QrCode.stop();
          scannerRef.current = null;
          setScanning(false);
          handleBarcode(decodedText);
        },
        () => {}
      );
    } catch (err) {
      setScanning(false);
      setError('Could not access camera. Make sure you gave camera permission.');
    }
  }, []);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch (e) {}
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => { return () => { stopScanner(); }; }, [stopScanner]);

  const handleBarcode = async (barcode) => {
    setLoading(true);
    setError('');
    const result = await lookupBarcode(barcode.trim());
    setLoading(false);
    if (result) setProduct(result);
    else setError(`No product found for barcode: ${barcode}. Try searching by name instead.`);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    setSearchLoading(true);
    setSearchResults([]);
    const results = await searchProducts(searchQuery.trim(), 10);
    setSearchLoading(false);
    setSearchAttempted(true);
    setSearchResults(results);
  };

  const handleManualLookup = async () => {
    if (!manualBarcode.trim()) return;
    await stopScanner();
    handleBarcode(manualBarcode.trim());
  };

  const selectProduct = (prod) => {
    onSelect({
      desc: prod.brand ? `${prod.name} — ${prod.brand}` : prod.name,
      al: prod.allergens,
      tags: ['Scanned'],
      ings: prod.ingredients,
      _barcode: prod.barcode,
      _brand: prod.brand,
      _image: prod.image,
      _source: 'openfoodfacts',
    });
  };

  const ProductCard = ({ prod }) => {
    const risks = getGIRisk(prod.name, prod.allergens);
    return (
      <div style={{ background:'var(--c1)', border:'1px solid rgba(167,139,250,0.08)', borderRadius:14, padding:14, marginBottom:10, animation:'fu .3s ease' }}>
        <div style={{ display:'flex', gap:10, marginBottom:8 }}>
          {prod.image && <img src={prod.image} alt="" style={{ width:56, height:56, borderRadius:8, objectFit:'cover', border:'1px solid rgba(167,139,250,0.1)' }} />}
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--t1)', lineHeight:1.3 }}>{prod.name}</div>
            {prod.brand && <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>{prod.brand}</div>}
            {prod.barcode && <div style={{ fontSize:9, color:'var(--t3)', marginTop:1 }}>UPC: {prod.barcode}</div>}
          </div>
        </div>
        {prod.allergens.length > 0 && <div style={{ marginBottom:6 }}>
          <div style={{ fontSize:10, fontWeight:600, color:'var(--t3)', marginBottom:3, textTransform:'uppercase' }}>Allergens Detected</div>
          <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
            {prod.allergens.map(a => { const al = AL.find(x => x.id === a); return al ? <span key={a} className="tg ta">{al.i} {al.l}</span> : null; })}
          </div>
        </div>}
        {risks.length > 0 && <div style={{ display:'flex', gap:3, flexWrap:'wrap', marginBottom:6 }}>
          {risks.map(f => { const cat = GI_RISK_CATS.find(c => c.id === f); return cat ? <span key={f} style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:`${cat.c}15`, color:cat.c, fontWeight:500 }}>{cat.ic} {cat.l}</span> : null; })}
        </div>}
        {prod.ingredients.length > 0 && <div style={{ fontSize:10, color:'var(--t2)', lineHeight:1.4, marginBottom:8 }}>
          <span style={{ fontWeight:600, color:'var(--t3)' }}>Ingredients: </span>
          {prod.ingredients.slice(0, 10).join(', ')}{prod.ingredients.length > 10 && ` +${prod.ingredients.length - 10} more`}
        </div>}
        {prod.allergens.length === 0 && prod.ingredients.length === 0 && <div style={{ fontSize:11, color:'var(--t3)', fontStyle:'italic', marginBottom:6 }}>No allergen or ingredient data available</div>}
        <button className="bp" onClick={() => selectProduct(prod)} style={{ fontSize:14, padding:10 }}>+ Add to Meal</button>
      </div>
    );
  };

  return (
    <div className="mov" onClick={e => { if (e.target === e.currentTarget) { stopScanner(); onClose(); } }}>
      <div className="mo">
        <div className="moh">
          <span className="mot">📷 Scan Product Barcode</span>
          <button className="mox" onClick={() => { stopScanner(); onClose(); }}>✕</button>
        </div>
        <div className="mob">

          {mode === 'scan' && <>
            <div id={scannerDivId} style={{ width:'100%', marginBottom:10, borderRadius:10, overflow:'hidden', background:'var(--c2)', minHeight: scanning ? 250 : 0 }} />
            {!scanning && !loading && !product && <div style={{ textAlign:'center' }}>
              <button className="bp" onClick={startScanner} style={{ marginBottom:10 }}>📷 Start Camera Scanner</button>
              <div style={{ fontSize:11, color:'var(--t3)', marginBottom:12 }}>Point your camera at a barcode on any food package</div>
              <div style={{ padding:'10px 12px', background:'var(--c1)', borderRadius:10, border:'1px solid rgba(167,139,250,0.06)' }}>
                <div style={{ fontSize:10, color:'var(--t3)', marginBottom:6, fontWeight:600 }}>Or type a barcode number:</div>
                <div style={{ display:'flex', gap:6 }}>
                  <input className="fi" type="text" inputMode="numeric" placeholder="e.g. 028400064514" value={manualBarcode} onChange={e => setManualBarcode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleManualLookup()} style={{ flex:1 }} />
                  <button className="mb" onClick={handleManualLookup} style={{ color:'var(--pb)', fontWeight:600 }}>Look Up</button>
                </div>
              </div>
            </div>}
            {scanning && <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:12, color:'var(--pb)', marginBottom:6 }}>📷 Scanning... point at a barcode</div>
              <button className="mb" onClick={stopScanner} style={{ color:'var(--er)' }}>Stop Scanner</button>
            </div>}
          </>}

          {loading && <div style={{ textAlign:'center', padding:20, color:'var(--pb)' }}><div className="spn" style={{ margin:'0 auto 8px' }} /><div style={{ fontSize:12 }}>Looking up product...</div></div>}
          {error && <div style={{ padding:10, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.15)', borderRadius:8, fontSize:12, color:'#f87171', marginBottom:10 }}>{error}</div>}
          {product && !loading && <>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--ok)', marginBottom:6 }}>✅ Product Found</div>
            <ProductCard prod={product} />
            <button className="mb" onClick={() => { setProduct(null); setError(''); setManualBarcode(''); }} style={{ width:'100%', textAlign:'center', marginTop:4 }}>Scan Another</button>
          </>}
        </div>
      </div>
    </div>
  );
}
