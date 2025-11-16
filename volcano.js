function setText(id, v){ const el=document.getElementById(id); if(el) el.textContent=v; }

(function init(){
  const q = new URLSearchParams(location.search);
  const data = {
    id: q.get('id') || '—',
    name: q.get('name') || '—',
    country: q.get('country') || '—',
    type: q.get('type') || '—',
    status: q.get('status') || '—',
    eruption: q.get('eruption') || '—',
    elev: q.get('elev') || '—',
    lat: q.get('lat') || '—',
    lon: q.get('lon') || '—'
  };

  // header info
  setText('vType', data.type);

  // details
  setText('vId', data.id);
  setText('vName', data.name);
  setText('vCountry', data.country);
  setText('vCat', data.type);
  setText('vStatus', data.status);
  setText('vEru', data.eruption);
  setText('vCoords',
    (data.lat && data.lon && data.lat!=='—' && data.lon!=='—')
      ? `${Number(data.lat).toFixed(2)}°, ${Number(data.lon).toFixed(2)}°`
      : '—'
  );

  // elevation bar (0–6000, absolute value as on the map)
  const elevNum = Number(data.elev);
  const pct = Number.isFinite(elevNum) ? Math.max(0, Math.min(1, Math.abs(elevNum)/6000)) : 0;
  const bar = document.getElementById('elevBar');
  if (bar) bar.style.width = `${Math.round(pct*100)}%`;
  setText('elevLabel', `Elevation: ${Number.isFinite(elevNum) ? elevNum : '—'} m`);
})();
