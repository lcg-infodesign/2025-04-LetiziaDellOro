// ============================================================================
// LAYOUT: canvas accanto alla sidebar. Questi valori devono riflettere il CSS.
// ============================================================================
/*→ Calcola la dimensione disponibile del canvas in base a sidebar/header.
→ Crea (o ridimensiona) il canvas p5 dentro #canvas-holder.
→ Applica piccoli margini per evitare canvas troppo piccoli.*/
const SIDEBAR_W = 320 + 32;
const HEADER_H  = 56;

// --- CALIBRAZIONE immagine mappa --------------------------------------------
// La  PNG non coincide perfettamente con la proiezione equirettangolare “pura”.
// Applico quindi uno SHIFT percentuale sul rettangolo della mappa disegnata:
//  - CAL_X < 0 sposta i punti a sinistra (in percentuale della larghezza disegnata)
//  - CAL_Y > 0 sposta i punti verso il basso (in percentuale dell’altezza disegnata)
/*→ Offset percentuali (x,y) per riallineare i punti alla tua PNG.*/
const CAL_X = -0.03;
const CAL_Y =  0.12;

function sizeCanvasToLayout(){
  const availW = Math.max(320, windowWidth  - SIDEBAR_W - 32);
  const availH = Math.max(320, windowHeight - HEADER_H  - 24);
  if (!window._cnv) window._cnv = createCanvas(availW, availH).parent('canvas-holder');
  else resizeCanvas(availW, availH);
}

// ============================================================================
// DATI GLOBALI
// ============================================================================
/*→ Variabili principali: immagine mappa, righe CSV, cache posizioni per hover.
→ Stato hover e buffer raw del file CSV.
→ Configura lato legenda (right/left) e min/max lat/lon per mappature “stile prof”.*/
let worldMap, volcanoesRows = [], volcanoPositions = [], hoveredVolcano = null, volcanoesRaw = [];
const LEGEND_SIDE = "right";
let MIN_LAT=null, MAX_LAT=null, MIN_LON=null, MAX_LON=null;

// ========================= E4: FILTRO PER TYPE ==============================
// AGGIUNTO: stato del filtro e lista dei tipi
/*→ Introduce il filtro per Type: activeType (“All” o un singolo tipo) + lista tipi unici.*/
let activeType="All", allTypes=[];

// AGGIUNTO: mapping Type→Glyph unico e set di 50 glifi diversi
/*→ Definisce un set di 50 forme base e una mappa Type→Glyph per assegnazioni stabili.*/
const TYPE_TO_GLYPH = new Map();
const GLYPH_SET = [
  'circle','ring','target','bullseye','pieN','pieE','pieS','pieW','halo','dot',
  'triangle','triangleDown','triangleLeft','triangleRight','square','roundedSquare','diamond',
  'rect','rectTall','oval','capsule','pentagon','hexagon','heptagon','octagon',
  'cross','x','plus','asterisk','star5','star6','star8',
  'chevronUp','chevronDown','chevronLeft','chevronRight',
  'caretUp','caretDown','caretLeft','caretRight',
  'parallelogram','trapezoidUp','trapezoidDown','crescentL','crescentR','wedgeNE','wedgeNW','hourglass','bowtie'
];

// ============================================================================
// CARICAMENTO (p5 preload): immagine mappa + CSV (come array di righe)
// ============================================================================
/*→ Carica l’immagine della mappa e il CSV (come array di stringhe) in preload().*/
function preload(){
  worldMap     = loadImage('mappa-del-mondo.png');
  volcanoesRaw = loadStrings('volcanoes-2025-10-27 - Es.3.csv');
}

// ============================================================================
// SETUP
// ============================================================================
/*→ Inizializza canvas, font e parse del CSV “flessibile”.
→ Calcola MIN/MAX di lat e lon dal dataset (per mappe coerenti).
→ Allinea la legenda nel DOM.
→ Inizializza dropdown dei Type e costruisce la legenda “per Type” con glifi unici.*/
function setup(){
  sizeCanvasToLayout(); background(0); textFont('Arial');
  volcanoesRows = parseCSVFlexible(volcanoesRaw);
  const lats=[], lons=[];
  for (const r of volcanoesRows){ const la=getNumVal(r,'Latitude'); const lo=getNumVal(r,'Longitude'); if(Number.isFinite(la))lats.push(la); if(Number.isFinite(lo))lons.push(lo); }
  if(lats.length&&lons.length){ MIN_LAT=Math.min(...lats); MAX_LAT=Math.max(...lats); MIN_LON=Math.min(...lons); MAX_LON=Math.max(...lons); }
  const legend=document.getElementById('legend'); if(legend){ legend.classList.remove('left','right'); legend.classList.add(LEGEND_SIDE==='left'?'left':'right'); }
  initTypeDropdown(); buildPerTypeLegend();
}

// Alla modifica della finestra, ricalcolo la dimensione corretta del canvas
/*→ windowResized(): ridimensiona il canvas rispetto al layout corrente.*/
function windowResized(){ sizeCanvasToLayout(); }

// ============================================================================
// DRAW: disegno mappa + griglia + vulcani + gestione hover/tooltip
// ============================================================================
/*→ Ridimensiona e centra la mappa mantenendo proporzioni.
→ Disegna l’immagine mappa + griglia geografica.
→ Disegna tutti i vulcani (rispettando l’eventuale filtro).
→ Gestisce hover e aggiorna il tooltip HTML.*/
function draw(){
  background(0);
  let mapW=width*0.9, mapH=(worldMap.height/worldMap.width)*mapW;
  if(mapH>height*0.9){ mapH=height*0.9; mapW=(worldMap.width/worldMap.height)*mapH; }
  const mapX=(width-mapW)/2, mapY=(height-mapH)/2;
  image(worldMap,mapX,mapY,mapW,mapH); drawCoordinateGrid(mapX,mapY,mapW,mapH);
  drawVolcanoes(mapX,mapY,mapW,mapH); handleVolcanoHover(); updateTooltip();
}

// ============================================================================
// PARSING CSV “flessibile” 
// - Riconosce automaticamente ; o , come separatore
// - La regex `splitter` evita di spezzare dentro ai campi tra virgolette
// ============================================================================
/*→ Normalizza header/chiavi, supporta ; e , come delimiter e virgolette nei campi.
→ Helper getVal/getNumVal per valori testuali/numerici robusti (virgola → punto).*/
const norm=s=>String(s).toLowerCase().replace(/[\s_()\-]/g,'');
function parseCSVFlexible(lines){
  const headerLine=lines.find(l=>l&&l.trim())||'';
  const delim=headerLine.includes(';')?';':','; const splitter=new RegExp(`${delim}(?=(?:[^"]*"[^"]*")*[^"]*$)`);
  const header=headerLine.split(splitter).map(h=>h.replace(/^"|"$/g,'').trim()); const headerNorm=header.map(norm);
  const rows=[]; for(let i=1;i<lines.length;i++){ const raw=lines[i]; if(!raw||!raw.trim())continue;
    const parts=raw.split(splitter).map(v=>v.replace(/^"|"$/g,'').trim()); const obj={};
    for(let c=0;c<header.length;c++) obj[headerNorm[c]||`col${c}`]=parts[c]??''; rows.push(obj);
  } return rows;
}
function getVal(rowObj,wantedName){ const key=norm(wantedName); return (key in rowObj)?rowObj[key]:''; }
function getNumVal(rowObj,wantedName){ const v=parseFloat(String(getVal(rowObj,wantedName)).replace(',','.')); return Number.isFinite(v)?v:NaN; }

// ============================================================================
// PROIEZIONE / GRIGLIA
// - Proiezione equirettangolare standard per convertire (lat,lon) → (x,y)
// - + offset di calibrazione (CAL_X, CAL_Y) per allineare i punti alla tua PNG
// ============================================================================
/*→ Con MIN/MAX usa map() “stile prof”, altrimenti fallback equirettangolare.
→ Disegna meridiani/paralleli con etichette e un equatore evidenziato.*/
function latLonToPixel(lat,lon,mapX,mapY,mapW,mapH){
  if(MIN_LAT!==null&&MAX_LAT!==null&&MIN_LON!==null&&MAX_LON!==null){
    let x=map(lon,MIN_LON,MAX_LON,mapX,mapX+mapW), y=map(lat,MAX_LAT,MIN_LAT,mapY,mapY+mapH);
    x+=mapW*CAL_X; y+=mapH*CAL_Y; return {x,y};
  }
  return { x: mapX+((lon+180)/360)*mapW+mapW*CAL_X, y: mapY+((90-lat)/180)*mapH+mapH*CAL_Y };
}
function drawCoordinateGrid(mapX,mapY,mapW,mapH){
  stroke(100,100,100,140); strokeWeight(1); textSize(11); textAlign(CENTER,TOP); fill(200);
  for(let lon=-180;lon<=180;lon+=30){ const a=latLonToPixel(90,lon,mapX,mapY,mapW,mapH), b=latLonToPixel(-90,lon,mapX,mapY,mapW,mapH);
    line(a.x,a.y,b.x,b.y); noStroke(); text(lon+"°",a.x,mapY+mapH+8); stroke(100,100,100,140);
  }
  for(let lat=-90;lat<=90;lat+=30){ const a=latLonToPixel(lat,-180,mapX,mapY,mapW,mapH), b=latLonToPixel(lat,180,mapX,mapY,mapW,mapH);
    line(a.x,a.y,b.x,b.y); noStroke(); textAlign(RIGHT,CENTER); text(lat+"°",mapX-10,a.y); stroke(100,100,100,140); textAlign(CENTER,TOP);
  }
  stroke(180,180,180,200); strokeWeight(2); const e1=latLonToPixel(0,-180,mapX,mapY,mapW,mapH), e2=latLonToPixel(0,180,mapX,mapY,mapW,mapH); line(e1.x,e1.y,e2.x,e2.y);
}

// ============================================================================
// VULCANI + GLIFI
// - Converto ogni riga → coordinate proiettate
// - Filtro se escono dal rettangolo mappa (es. per sicurezza)
// - Mappo elevazione → dimensione, status → colore, eruzione → alpha
// ============================================================================
/*→ Cicla le righe, valida lat/lon e scarta fuori mappa.
→ Applica filtro per Type se ≠ “All”.
→ Size dal modulo dell’elevazione 
→ Colore da status (giallo→rosso) + alpha da recenza eruzione.
→ Sceglie il glifo per quel Type e lo disegna; salva dati per l’hover.*/
function drawVolcanoes(mapX,mapY,mapW,mapH){
  volcanoPositions=[]; if(!volcanoesRows.length) return;
  for(const row of volcanoesRows){
    const lat=getNumVal(row,'Latitude'), lon=getNumVal(row,'Longitude'); if(!Number.isFinite(lat)||!Number.isFinite(lon)) continue;
    const name=getVal(row,'Volcano Name')||'Unknown', country=getVal(row,'Country')||'Unknown', location=getVal(row,'Location')||'Unknown';
    const type=getVal(row,'Type')||'Unknown', status=getVal(row,'Status')||'Unknown', eruption=getVal(row,'Last Known Eruption')||'Unknown';
    const elevation=getNumVal(row,'Elevation (m)');
    if(activeType!=="All" && type!==activeType) continue;
    const pos=latLonToPixel(lat,lon,mapX,mapY,mapW,mapH); if(pos.x<mapX||pos.x>mapX+mapW||pos.y<mapY||pos.y>mapY+mapH) continue;
    const size=Number.isFinite(elevation)?constrain(map(Math.abs(elevation),0,6000,3,12),3,12):4;
    const glyph=glyphForType(type), col=statusToYellowRed(status);
    const e=String(eruption); col.setAlpha(e.includes('D1')?255:e.includes('D2')?240:e.includes('U')?220:200);
    drawGlyph(pos.x,pos.y,size,glyph,col);
    volcanoPositions.push({x:pos.x,y:pos.y,size,name,country,location,elevation:Number.isFinite(elevation)?elevation:0,type,status,eruption});
  }
}

// assegna stabilmente un glifo a ciascun Type 
/*→ glyphForType(): assegna una forma deterministica al Type (riuso coerente).*/
function glyphForType(type){
  if(TYPE_TO_GLYPH.has(type)) return TYPE_TO_GLYPH.get(type);
  const idx = TYPE_TO_GLYPH.size; const g = GLYPH_SET[idx % GLYPH_SET.length]; TYPE_TO_GLYPH.set(type,g); return g;
}

// Status → colore (giallo → arancio → rosso). Le soglie sono qualitative.
/*→ Genera un colore interpolato giallo→rosso in base all’epoca (storico più rosso).*/
function statusToYellowRed(status){
  const c1=color(255,210,0), c2=color(230,40,20); const s=String(status).toLowerCase();
  let t=0.35; if(s.includes('pleistocene')) t=0.10; else if(s.includes('holocene')) t=0.55; else if(s.includes('historical')) t=1.00;
  return lerpColor(c1,c2,constrain(t,0,1));
}

// ============================================================================
// DISEGNO GLIFI (50 varianti). Colore già impostato in fill/stroke.
// ============================================================================
/*→ drawGlyph():  50 forme .*/
function drawGlyph(x,y,size,kind,col){
  push(); stroke(col); fill(col); strokeWeight(1.2); const r=size*0.9, d=r*2;
  switch(kind){
    case 'circle': ellipse(x,y,d,d); break;
    case 'ring': noFill(); ellipse(x,y,d,d); break;
    case 'target': noFill(); ellipse(x,y,d,d); ellipse(x,y,d*0.6,d*0.6); break;
    case 'bullseye': noFill(); ellipse(x,y,d,d); ellipse(x,y,d*0.66,d*0.66); ellipse(x,y,d*0.33,d*0.33); break;
    case 'pieN': arc(x,y,d,d,-PI,0,PIE); break;
    case 'pieE': arc(x,y,d,d,-HALF_PI,HALF_PI,PIE); break;
    case 'pieS': arc(x,y,d,d,0,PI,PIE); break;
    case 'pieW': arc(x,y,d,d,HALF_PI,-HALF_PI,PIE); break;
    case 'halo': noFill(); ellipse(x,y,d*1.2,d*1.2); fill(col); noStroke(); ellipse(x,y,d*0.5,d*0.5); stroke(col); break;
    case 'dot': ellipse(x,y,d*0.7,d*0.7); break;
    case 'triangle': triUp(x,y,r); break;
    case 'triangleDown': triDown(x,y,r); break;
    case 'triangleLeft': triLeft(x,y,r); break;
    case 'triangleRight': triRight(x,y,r); break;
    case 'square': rectMode(CENTER); rect(x,y,d*0.95,d*0.95); break;
    case 'roundedSquare': rectMode(CENTER); rect(x,y,d*0.95,d*0.95,r*0.35); break;
    case 'diamond': push(); translate(x,y); rotate(PI/4); rectMode(CENTER); rect(0,0,d*0.9,d*0.9); pop(); break;
    case 'rect': rectMode(CENTER); rect(x,y,d*1.4,d*0.6,2); break;
    case 'rectTall': rectMode(CENTER); rect(x,y,d*0.7,d*1.4,2); break;
    case 'oval': ellipse(x,y,d*1.6,d*1.1); break;
    case 'capsule': rectMode(CENTER); rect(x,y,d*1.4,d*0.7,d*0.35); break;
    case 'pentagon': drawRegularPolygon(x,y,5,r); break;
    case 'hexagon': drawRegularPolygon(x,y,6,r); break;
    case 'heptagon': drawRegularPolygon(x,y,7,r); break;
    case 'octagon': drawRegularPolygon(x,y,8,r); break;
    case 'cross': noFill(); strokeWeight(1.7); line(x-r,y,x+r,y); line(x,y-r,x,y+r); break;
    case 'x': noFill(); strokeWeight(1.7); line(x-r*0.9,y-r*0.9,x+r*0.9,y+r*0.9); line(x-r*0.9,y+r*0.9,x+r*0.9,y-r*0.9); break;
    case 'plus': strokeWeight(2.2); line(x-r,y,x+r,y); line(x,y-r,x,y+r); break;
    case 'asterisk': strokeWeight(1.6); line(x-r,y,x+r,y); line(x,y-r,x,y+r); line(x-r*0.9,y-r*0.9,x+r*0.9,y+r*0.9); line(x-r*0.9,y+r*0.9,x+r*0.9,y-r*0.9); break;
    case 'star5': drawStar(x,y,r,r*0.5,5); break;
    case 'star6': drawStar(x,y,r,r*0.55,6); break;
    case 'star8': drawStar(x,y,r,r*0.55,8); break;
    case 'chevronUp': chevron(x,y,r,0); break;
    case 'chevronDown': chevron(x,y,r,PI); break;
    case 'chevronLeft': chevron(x,y,r,-HALF_PI); break;
    case 'chevronRight': chevron(x,y,r,HALF_PI); break;
    case 'caretUp': caret(x,y,r,0); break;
    case 'caretDown': caret(x,y,r,PI); break;
    case 'caretLeft': caret(x,y,r,-HALF_PI); break;
    case 'caretRight': caret(x,y,r,HALF_PI); break;
    case 'parallelogram': push(); translate(x,y); shearX(PI/8); rectMode(CENTER); rect(0,0,d*1.3,d*0.8); pop(); break;
    case 'trapezoidUp': quad(x-r*1.1,y+r*0.6,x+r*1.1,y+r*0.6,x+r*0.6,y-r*0.6,x-r*0.6,y-r*0.6); break;
    case 'trapezoidDown': quad(x-r*0.6,y+r*0.6,x+r*0.6,y+r*0.6,x+r*1.1,y-r*0.6,x-r*1.1,y-r*0.6); break;
    case 'crescentL': crescent(x,y,r,true); break;
    case 'crescentR': crescent(x,y,r,false); break;
    case 'wedgeNE': arc(x,y,d,d,-HALF_PI,0,PIE); break;
    case 'wedgeNW': arc(x,y,d,d,-PI,-HALF_PI,PIE); break;
    case 'hourglass': quad(x-r,y-r,x+r,y+r,x+r,y-r,x-r,y+r); break;
    case 'bowtie': quad(x-r,y, x,y-r, x+r,y, x,y+r); break;
    default: ellipse(x,y,d,d);
  }
  pop();
}

// ---------- helper per geometrie base ----------
/* → drawRegularPolygon(): n-lati centrato con raggio r.
→ drawStar(): stella generica con punti variabili.
→ triUp/Down/Left/Right, chevron(), caret(), crescent(): primitive per forme direzionali e lune.*/
function drawRegularPolygon(cx,cy,n,r){ beginShape(); for(let i=0;i<n;i++){ const a=-HALF_PI+(TWO_PI*i)/n; vertex(cx+cos(a)*r, cy+sin(a)*r);} endShape(CLOSE); }
function drawStar(cx,cy,rOuter,rInner,points){ beginShape(); const steps=points*2; for(let i=0;i<steps;i++){ const r=(i%2===0)?rOuter:rInner; const a=-HALF_PI+(TWO_PI*i)/steps; vertex(cx+cos(a)*r, cy+sin(a)*r);} endShape(CLOSE); }
function triUp(x,y,r){ triangle(x,y-r, x-r*0.866,y+r*0.5, x+r*0.866,y+r*0.5); }
function triDown(x,y,r){ triangle(x,y+r, x-r*0.866,y-r*0.5, x+r*0.866,y-r*0.5); }
function triLeft(x,y,r){ triangle(x-r,y, x+r*0.5,y-r*0.866, x+r*0.5,y+r*0.866); }
function triRight(x,y,r){ triangle(x+r,y, x-r*0.5,y-r*0.866, x-r*0.5,y+r*0.866); }
function chevron(x,y,r,rot){ push(); translate(x,y); rotate(rot); noFill(); strokeWeight(2); line(-r, r*0.2, 0, -r*0.8); line(0,-r*0.8, r, r*0.2); pop(); }
function caret(x,y,r,rot){ push(); translate(x,y); rotate(rot); noFill(); strokeWeight(2); line(-r*0.8,-r*0.2,0,-r*0.8); line(0,-r*0.8,r*0.8,-r*0.2); pop(); }
function crescent(x,y,r,left){ const d=r*2; push(); noStroke(); ellipse(x,y,d,d); fill(0); const shift=left?r*0.6:-r*0.6; ellipse(x+shift,y,d,d); pop(); }

// ============================================================================
// HOVER / TOOLTIP
// - handleVolcanoHover: trova il primo vulcano “vicino” al mouse
// - updateTooltip: compila/posiziona il <div id="tip"> (HTML) vicino al mouse
// ============================================================================
/* → handleVolcanoHover(): seleziona il primo punto vicino al mouse e cambia il cursore.
→ updateTooltip(): compila HTML del tooltip e lo posiziona a schermo senza uscire dai bordi.*/
function handleVolcanoHover(){
  hoveredVolcano=null; for(const v of volcanoPositions){ if(dist(mouseX,mouseY,v.x,v.y)<=v.size+4){ hoveredVolcano=v; break; } }
  document.body.style.cursor = hoveredVolcano ? 'pointer' : 'default';
}
function updateTooltip(){
  const tip=document.getElementById('tip'); if(!tip) return; if(!hoveredVolcano){ tip.hidden=true; return; }
  const v=hoveredVolcano;
  tip.innerHTML = `
    <div class="name">${v.name}</div>
    <div>Country: ${v.country}</div>
    <div>Location: ${v.location}</div>
    <div>Elevation: ${v.elevation} m</div>
    <div>Type: ${v.type}</div>
    <div>Last Eruption: ${v.eruption}</div>
  `;
  const pad=5; let x=mouseX+16, y=mouseY+16; const w=tip.offsetWidth||50, h=tip.offsetHeight||50;
  if(x+w+pad>window.innerWidth) x=mouseX-w-5; if(y+h+pad>window.innerHeight) y=mouseY-h-5;
  tip.style.left=`${x}px`; tip.style.top=`${y}px`; tip.hidden=false;
}

// ============================================================================
// ================= E4: DROPDOWN – INIZIALIZZAZIONE ==========================
// AGGIUNTO: costruzione lista tipi, popolamento <select>, sync con URL
// ============================================================================
/* → initTypeDropdown(): raccoglie i tipi unici, assegna glifi, popola <select>.
→ Legge ?type= dall’URL, imposta activeType e listener change; ricostruisce la legenda.*/
function initTypeDropdown(){
  const setTypes=new Set(); for(const r of volcanoesRows){ const t=getVal(r,'Type'); if(t) setTypes.add(t); }
  allTypes=Array.from(setTypes).sort((a,b)=>a.localeCompare(b));
  TYPE_TO_GLYPH.clear(); for(let i=0;i<allTypes.length;i++) TYPE_TO_GLYPH.set(allTypes[i], GLYPH_SET[i%GLYPH_SET.length]);
  const sel=document.getElementById('typeFilter'); if(!sel) return;
  sel.innerHTML=''; const optAll=document.createElement('option'); optAll.value="All"; optAll.textContent="All"; sel.appendChild(optAll);
  for(const t of allTypes){ const o=document.createElement('option'); o.value=t; o.textContent=t; sel.appendChild(o); }
  const params=new URLSearchParams(window.location.search), tFromURL=params.get('type');
  if(tFromURL&&allTypes.includes(tFromURL)){ activeType=tFromURL; sel.value=tFromURL; } else { activeType="All"; sel.value="All"; }
  sel.addEventListener('change',e=>{ activeType=e.target.value||"All"; });
  buildPerTypeLegend();
}

// ============================================================================
// LEGENDA “UNO PER OGNI TYPE” con SVG inline (nessuna classe extra)
// ============================================================================
/*→ buildPerTypeLegend(): genera <li> per ogni Type con un’icona SVG 16×16 coerente col glifo.*/
function buildPerTypeLegend(){
  const ul=document.getElementById('legend-types'); if(!ul) return; ul.innerHTML='';
  const stroke='#ff7c00', fill='#ff7c00';
  for(const t of allTypes){
    const li=document.createElement('li'); li.style.display='flex'; li.style.alignItems='center'; li.style.gap='8px'; li.style.margin='6px 0';
    const sw=document.createElement('span'); sw.className='swatch'; sw.innerHTML=glyphSVG(TYPE_TO_GLYPH.get(t),stroke,fill);
    li.appendChild(sw); li.appendChild(document.createTextNode(t)); ul.appendChild(li);
  }
}

//  minimo renderer SVG (16×16) per i 50 glifi
/*→ glyphSVG(): restituisce l’SVG inline della forma richiesta per la legenda.*/
function glyphSVG(kind,stroke='#ff7c00',fill='#ff7c00'){
  const st=`stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  switch(kind){
    case 'circle': return `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="${fill}" ${st}/></svg>`;
    case 'ring': return `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" ${st}/></svg>`;
    case 'target': return `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" ${st}/><circle cx="8" cy="8" r="3.5" fill="none" ${st}/></svg>`;
    case 'bullseye': return `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" ${st}/><circle cx="8" cy="8" r="4" fill="none" ${st}/><circle cx="8" cy="8" r="2" fill="none" ${st}/></svg>`;
    case 'pieN': return `<svg viewBox="0 0 16 16"><path d="M2 8 A6 6 0 0 1 14 8" fill="${fill}" ${st}/></svg>`;
    case 'pieE': return `<svg viewBox="0 0 16 16"><path d="M8 2 A6 6 0 0 1 8 14" fill="${fill}" ${st}/></svg>`;
    case 'pieS': return `<svg viewBox="0 0 16 16"><path d="M2 8 A6 6 0 0 0 14 8" fill="${fill}" ${st}/></svg>`;
    case 'pieW': return `<svg viewBox="0 0 16 16"><path d="M8 2 A6 6 0 0 0 8 14" fill="${fill}" ${st}/></svg>`;
    case 'halo': return `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" ${st}/><circle cx="8" cy="8" r="3" fill="${fill}" ${st}/></svg>`;
    case 'dot': return `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4.5" fill="${fill}" ${st}/></svg>`;
    case 'triangle': return `<svg viewBox="0 0 16 16"><path d="M8 2 L2.8 13 H13.2 Z" fill="${fill}" ${st}/></svg>`;
    case 'triangleDown': return `<svg viewBox="0 0 16 16"><path d="M2.8 3 H13.2 L8 14 Z" fill="${fill}" ${st}/></svg>`;
    case 'triangleLeft': return `<svg viewBox="0 0 16 16"><path d="M3 8 L14 2.8 V13.2 Z" fill="${fill}" ${st}/></svg>`;
    case 'triangleRight': return `<svg viewBox="0 0 16 16"><path d="M13 8 L2 2.8 V13.2 Z" fill="${fill}" ${st}/></svg>`;
    case 'square': return `<svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" fill="${fill}" ${st}/></svg>`;
    case 'roundedSquare': return `<svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="3" fill="${fill}" ${st}/></svg>`;
    case 'diamond': return `<svg viewBox="0 0 16 16"><path d="M8 1.8 L14.2 8 L8 14.2 L1.8 8 Z" fill="${fill}" ${st}/></svg>`;
    case 'rect': return `<svg viewBox="0 0 16 16"><rect x="2" y="6" width="12" height="4" rx="1" fill="${fill}" ${st}/></svg>`;
    case 'rectTall': return `<svg viewBox="0 0 16 16"><rect x="6" y="2" width="4" height="12" rx="1" fill="${fill}" ${st}/></svg>`;
    case 'oval': return `<svg viewBox="0 0 16 16"><ellipse cx="8" cy="8" rx="7" ry="4.5" fill="${fill}" ${st}/></svg>`;
    case 'capsule': return `<svg viewBox="0 0 16 16"><rect x="2" y="5.5" width="12" height="5" rx="3" fill="${fill}" ${st}/></svg>`;
    case 'pentagon': return `<svg viewBox="0 0 16 16"><path d="M8 2 L14 6 L12.2 14 H3.8 L2 6 Z" fill="${fill}" ${st}/></svg>`;
    case 'hexagon': return `<svg viewBox="0 0 16 16"><path d="M5 2.5 H11 L14 8 L11 13.5 H5 L2 8 Z" fill="${fill}" ${st}/></svg>`;
    case 'heptagon': return `<svg viewBox="0 0 16 16"><path d="M8 2 L12.5 4.5 L13.8 9 L10.8 13 H5.2 L2.2 9 L3.5 4.5 Z" fill="${fill}" ${st}/></svg>`;
    case 'octagon': return `<svg viewBox="0 0 16 16"><path d="M6 2 H10 L14 6 V10 L10 14 H6 L2 10 V6 Z" fill="${fill}" ${st}/></svg>`;
    case 'cross': return `<svg viewBox="0 0 16 16"><path d="M2 8 H14 M8 2 V14" fill="none" ${st}/></svg>`;
    case 'x': return `<svg viewBox="0 0 16 16"><path d="M3 3 L13 13 M13 3 L3 13" fill="none" ${st}/></svg>`;
    case 'plus': return `<svg viewBox="0 0 16 16"><path d="M2 8 H14 M8 2 V14" fill="none" stroke-width="2.5" stroke="${stroke}"/></svg>`;
    case 'asterisk': return `<svg viewBox="0 0 16 16"><path d="M2 8 H14 M8 2 V14 M3 3 L13 13 M13 3 L3 13" fill="none" ${st}/></svg>`;
    case 'star5': return `<svg viewBox="0 0 16 16"><path d="M8 2 L9.8 6.5 L14 6.5 L10.5 9.2 L11.8 13.8 L8 11.2 L4.2 13.8 L5.5 9.2 L2 6.5 L6.2 6.5 Z" fill="${fill}" ${st}/></svg>`;
    case 'star6': return `<svg viewBox="0 0 16 16"><path d="M8 2 L10 6 L14 6 L11 9 L12.5 14 L8 11.5 L3.5 14 L5 9 L2 6 L6 6 Z" fill="${fill}" ${st}/></svg>`;
    case 'star8': return `<svg viewBox="0 0 16 16"><path d="M8 1.5 L9.6 6 L14.5 8 L9.6 10 L8 14.5 L6.4 10 L1.5 8 L6.4 6 Z" fill="${fill}" ${st}/></svg>`;
    case 'chevronUp': return `<svg viewBox="0 0 16 16"><path d="M3 10 L8 5 L13 10" fill="none" ${st}/></svg>`;
    case 'chevronDown': return `<svg viewBox="0 0 16 16"><path d="M3 6 L8 11 L13 6" fill="none" ${st}/></svg>`;
    case 'chevronLeft': return `<svg viewBox="0 0 16 16"><path d="M10 3 L5 8 L10 13" fill="none" ${st}/></svg>`;
    case 'chevronRight': return `<svg viewBox="0 0 16 16"><path d="M6 3 L11 8 L6 13" fill="none" ${st}/></svg>`;
    case 'caretUp': return `<svg viewBox="0 0 16 16"><path d="M3 10 L8 6 L13 10 Z" fill="${fill}" ${st}/></svg>`;
    case 'caretDown': return `<svg viewBox="0 0 16 16"><path d="M3 6 L8 10 L13 6 Z" fill="${fill}" ${st}/></svg>`;
    case 'caretLeft': return `<svg viewBox="0 0 16 16"><path d="M10 3 L6 8 L10 13 Z" fill="${fill}" ${st}/></svg>`;
    case 'caretRight': return `<svg viewBox="0 0 16 16"><path d="M6 3 L10 8 L6 13 Z" fill="${fill}" ${st}/></svg>`;
    case 'parallelogram': return `<svg viewBox="0 0 16 16"><path d="M4 3 H14 L12 13 H2 Z" fill="${fill}" ${st}/></svg>`;
    case 'trapezoidUp': return `<svg viewBox="0 0 16 16"><path d="M3 12 H13 L11 4 H5 Z" fill="${fill}" ${st}/></svg>`;
    case 'trapezoidDown': return `<svg viewBox="0 0 16 16"><path d="M5 12 H11 L13 4 H3 Z" fill="${fill}" ${st}/></svg>`;
    case 'crescentL': return `<svg viewBox="0 0 16 16"><path d="M8 2 A6 6 0 1 0 8 14 A4.5 6 0 1 1 8 2 Z" fill="${fill}" ${st}/></svg>`;
    case 'crescentR': return `<svg viewBox="0 0 16 16"><path d="M8 2 A6 6 0 1 1 8 14 A4.5 6 0 1 0 8 2 Z" fill="${fill}" ${st}/></svg>`;
    case 'wedgeNE': return `<svg viewBox="0 0 16 16"><path d="M8 8 L8 2 A6 6 0 0 1 14 8 Z" fill="${fill}" ${st}/></svg>`;
    case 'wedgeNW': return `<svg viewBox="0 0 16 16"><path d="M8 8 L2 8 A6 6 0 0 1 8 2 Z" fill="${fill}" ${st}/></svg>`;
    case 'hourglass': return `<svg viewBox="0 0 16 16"><path d="M3 3 H13 L9 8 L13 13 H3 L7 8 Z" fill="${fill}" ${st}/></svg>`;
    case 'bowtie': return `<svg viewBox="0 0 16 16"><path d="M3 3 L9 8 L3 13 M13 3 L7 8 L13 13" fill="none" ${st}/></svg>`;
    default: return `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="${fill}" ${st}/></svg>`;
  }
}
