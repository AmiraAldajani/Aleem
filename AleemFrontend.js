// soft highlight helpers (derived from text color)
function _rgbToHsl(r, g, b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h, s, l=(max+min)/2;
  if(max===min){ h=0; s=0; }
  else{
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d + (g<b?6:0); break;
      case g: h=(b-r)/d + 2; break;
      case b: h=(r-g)/d + 4; break;
    }
    h/=6;
  }
  return { h, s, l };
// this function converts RGB color values (red-green-blue) into HSL (hue-saturation-lightness) format
}
function _hslToRgb(h, s, l){
  let r, g, b;
  if (s === 0){ r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l*s;
    const p = 2*l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}

function _softBgFromTextColor(el){
  const cs = getComputedStyle(el);
  const m  = cs.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  let r=0,g=0,b=0;
  if (m){ r=+m[1]; g=+m[2]; b=+m[3]; }

  const { h, s, l } = _rgbToHsl(r, g, b);

  // لو النص داكن (l منخفض) نخلي الخلفية أفتح، ولو النص فاتح نخليها أغمق —
  // مع الحفاظ على نفس الـ hue/ saturation عشان التناغم.
  const delta = 0.35;              // مقدار الفرق في السطوع
  const targetL = l < 0.5
    ? Math.min(0.92, l + delta)    // نص داكن → خلفية أفتح
    : Math.max(0.08, l - delta);   // نص فاتح → خلفية أغمق

  const [rr, gg, bb] = _hslToRgb(h, s, targetL);
  const alpha = 0.30;              // شفافية الهايلايت (جرّبي 0.14–0.25)
  return `rgba(${rr},${gg},${bb},${alpha})`;
}



// AleemFrontend.js

// 1) Inject CSS dynamically
(function injectStyle() { 
  const css = `
    body { font-family: Arial, sans-serif; direction: rtl; margin: 24px; }
    #content { border: 1px solid #ccc; padding: 15px; margin-top: 10px; }
    mark { /* background set via JS */ }

    mark.aleem-word {
      background: transparent;
      padding:0 2px;
      border-radius:4px;
      cursor:help;
      position:relative;
      color: inherit;  
    }
    mark.aleem-word:focus { outline:2px solid #ffd24d; }
    
    .aleem-tooltip {
      position:absolute; bottom:1.8em; right:0;
      max-width:420px; line-height:1.6; font-size:14px;
      background:#111; color:#fff; padding:10px 12px;
      border-radius:10px; box-shadow:0 6px 22px rgba(0,0,0,.28);
      opacity:0; visibility:hidden; transform:translateY(4px);
      transition:opacity .12s ease, transform .12s ease, visibility 0s linear .12s;
      z-index:9999; pointer-events:none;
      white-space:normal;
    }
    .aleem-word:hover .aleem-tooltip,
    .aleem-word:focus .aleem-tooltip,
    .aleem-word.-open .aleem-tooltip {
      opacity:1; visibility:visible; transform:translateY(0);
      transition:opacity .12s ease, transform .12s ease;
      pointer-events:auto;
    }
    .aleem-tooltip::after {
      content:""; position:absolute; top:100%; right:12px;
      border:6px solid transparent; border-top-color:#111;
    }
    .aleem-tooltip a { display:inline-block; margin-top:6px; text-decoration:underline; color:#b7e1ff; }
    .aleem-tooltip .muted { opacity:.75; font-size:12px; margin-right:8px; }
    
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.prepend(style);
})();

// App logic
const API_BASE = (
  document.currentScript ||
  document.querySelector('script[src*="AleemFrontend.js"]')
)?.src
  ? new URL((document.currentScript || document.querySelector('script[src*="AleemFrontend.js"]')).src).origin
  : "https://aleem.arai.center";

const AR = "\u0600-\u06FF";

// ===== Page-level cache (browser-side) =====
const CACHE_NS = "aleem:v1";

function djb2(str){
  let h = 5381; for (let i=0; i<str.length; i++) h = ((h<<5)+h) ^ str.charCodeAt(i);
  return (h>>>0).toString(36);
}
function makePageCacheKey(domainKeywords, difficulty){
  const base = location.origin + location.pathname;
  const dk   = Array.isArray(domainKeywords) ? domainKeywords.slice().sort() : [];
  const diff = difficulty ?? "default";
  const key  = `${base}#dk=${djb2(JSON.stringify(dk))}&diff=${diff}`;
  return `${CACHE_NS}:${key}`;
}

function savePageCache({ key, words, meaningMap }){
  try {
    const payload = {
      v: 1,
      savedAt: Date.now(),
      words,
      meanings: Array.from(meaningMap.entries()) // [[word, html], ...]
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {}
}

function loadPageCache(key){
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.words) || !Array.isArray(parsed.meanings)) return null;
    const map = new Map(parsed.meanings);
    return { words: parsed.words, meaningMap: map, savedAt: parsed.savedAt };
  } catch { return null; }
}
// End of Page-level cache
function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function openTip(span){ span.classList.add("-open"); }
function stripDiacritics(s){ return s.replace(/[\u064B-\u065F\u0670]/g, ""); }
function closeTip(span){ span.classList.remove("-open"); }

// إغلاق أي تولتيب مفتوح عند النقر خارج الكلمة
document.addEventListener("click", (e)=>{
  const open = document.querySelectorAll("mark.aleem-word.-open");
  open.forEach(el => { if (!el.contains(e.target)) closeTip(el); });
});
 
// استخراج الكلمات
function extractWords(container = document.body){
  // نحدد أصغر container ممكن قبل الاستنساخ
  const root = container === document.body
    ? (document.querySelector("article") || 
       document.querySelector("main") || 
       document.querySelector("#content") || 
       document.body)
    : container;

  const clone = root.cloneNode(true);
  
  // نحذف العناصر اللي مو محتوى أصلي
  const noise = [
    'nav', 'header', 'footer', 'aside',
    '[class*="sidebar"]', '[class*="related"]', '[class*="recommend"]',
    '[class*="ad"]', '[id*="ad"]', '[class*="breadcrumb"]',
    '[class*="menu"]', '[class*="share"]', '[class*="tags"]',
    '[class*="author"]', '[class*="comment"]'
  ];
  noise.forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  });
  
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node){
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement; if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName;
      if (["SCRIPT","STYLE","NOSCRIPT","CODE","PRE","KBD","SAMP"].includes(tag)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const bits = []; let n;
  while ((n = walker.nextNode())) bits.push(n.nodeValue);
  const text = bits.join(" ");
  const WORD_RE = /[\u0600-\u06FF]+/g;
  const matches = text.match(WORD_RE) || [];
  const words = matches.map(w => w.trim()).filter(w => w.length > 2);
  return Array.from(new Set(words));
}

// جلب المعنى من البروكسي
async function fetchMeaningFromMuajam(word){
  const ts = Date.now();
  // نحدد ان المصدر المطلوب بس معجم الرياص
  const url = `${API_BASE}/api/muajam?word=${encodeURIComponent(word)}&source=riyadh&ts=${ts}`;
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  if (!r.ok) return { hasMeaning:false, html:"" };
  const data = await r.json().catch(()=> ({}));
  const meaning = (typeof data?.meaning === "string" && data.meaning.trim())
    ? data.meaning.trim() : null;
  // ← نستخدم lemma أو نرجع للكلمة الأصلية
  const lookupWord = (typeof data?.lemma === "string" && data.lemma.trim())
    ? data.lemma.trim()
    : word;
    
  const riyadhUrl = `https://dictionary.ksaa.gov.sa/result/${encodeURIComponent(word)}`;
  if (meaning) {
    return {
      hasMeaning: true,
      html: `<a href="${riyadhUrl}" target="_blank" rel="noopener" class="def-link">${escapeHtml(meaning)}</a>`
    };
  }
  return { hasMeaning: false, html: "" };
}


function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[m]));
}

// ===== Resilience helpers =====

// Wraps any promise with a timeout; rejects with a named error on expiry
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`[Aleem] timeout: ${label} (${ms}ms)`)), ms);
    promise.then(
      v => { clearTimeout(id); resolve(v); },
      e => { clearTimeout(id); reject(e); }
    );
  });
}

// Runs an async task over an array in batches of `size`, sequentially per batch
async function fetchInBatches(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}


// طلب Gemini عبر البروكسي
async function selectUncommonWithGemini(allCandidates, DOMAIN_KEYWORDS, difficulty){
  
  const normalizeForKey = (s) => String(s)
    .replace(/[،؛.,:"'!?()\[\]{}]/g, " ") // إزالة علامات الترقيم
    .replace(/\s+/g, " ") // normalization للمسافات
    .trim();
  const candidates = Array.from(new Set((allCandidates || []).map(w => normalizeForKey(String(w).trim())).filter(Boolean).filter(w => w.length > 2))).sort();

  // 15-second hard timeout so a slow/dead API never hangs the page
  const fetchPromise = fetch(`${API_BASE}/api/gemini/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates, domainKeywords: DOMAIN_KEYWORDS, difficulty }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
  });

  let r;
  try {
    r = await withTimeout(fetchPromise, 15000, "gemini/select");
  } catch (err) {
    console.warn("[Aleem] Gemini request failed or timed out:", err?.message);
    return null; // signal: API unavailable
  }

  if (!r.ok) {
    console.warn("[Aleem] Gemini endpoint returned", r.status);
    return null; // signal: API error (quota, 502, etc.)
  }

  try {
    const data = await r.json();
    // Server signals graceful degradation (quota exceeded, timeout, etc.)
    if (data.degraded) {
      if (data.userMessage)
      console.warn("[Aleem] server reported degraded mode:", data.reason);
      return null;
    }
    return Array.isArray(data.uncommon) ? data.uncommon : null;
  } catch {
    return null;
  }
  
}

// تظليل الكلمات
async function highlightWords(words, meaningMap, container = document.body){
  document.querySelectorAll('mark.aleem-word').forEach(mark => {
    mark.replaceWith(document.createTextNode(mark.dataset.word || mark.innerText));
  });
  if (!container) return;
  const diacritics = /[\u064B-\u065F\u0670]/g;
  function wordToPattern(w){
    return escapeRegExp(w).replace(/[^\u0600-\u06FF\s]/g, m => m).split("").map(ch => {
      if (/[\u0600-\u06FF]/.test(ch)) return ch + "[\\u064B-\\u065F\\u0670]*";
      return ch;
    }).join("");
  }
  const pattern = new RegExp(`(?<![\\u0600-\\u06FF])(${words.map(wordToPattern).join("|")})(?![\\u0600-\\u06FF])`, "g");

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const nodes = []; let n; while ((n = walker.nextNode())) nodes.push(n);

  for (const textNode of nodes){
    const text = textNode.nodeValue;
    if (!pattern.test(text)) continue;
    const frag = document.createDocumentFragment();
    let last = 0; pattern.lastIndex = 0; let m;
    while ((m = pattern.exec(text))){
      const before = text.slice(last, m.index);
      if (before) frag.appendChild(document.createTextNode(before));
      const word = m[1];
      const mark = document.createElement("mark");
        /* Aleem: derive soft highlight from text color */
        mark.style.backgroundColor = _softBgFromTextColor(mark);
      mark.className = "aleem-word";
      mark.dataset.word = word;
      mark.innerText = word;
      const tip = document.createElement("span");
      tip.className = "aleem-tooltip";
      tip.dataset.loaded = "1";
      tip.innerHTML = meaningMap.get(word) || meaningMap.get(stripDiacritics(word)) || "(لا معنى متاح)";
      mark.appendChild(tip);
      frag.appendChild(mark);
      last = m.index + word.length;
    }
    const after = text.slice(last);
    if (after) frag.appendChild(document.createTextNode(after));
    textNode.parentNode.replaceChild(frag, textNode);
  }
}


function _toList(val){
  if (!val) return [];
  try { 
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : String(val).split(",").map(s=>s.trim()).filter(Boolean);
  } catch {
    return String(val).split(",").map(s=>s.trim()).filter(Boolean);
  }
}

function _globToRegex(glob){
  // دعم بسيط للـ * فقط
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp("^" + esc + "$");
}

function _urlMatchesPattern(pattern, { href, path }){
  const p = String(pattern).trim();
  if (!p) return false;

  // إذا بدأ بـ http/https نطابق الـ href كامل
  if (/^https?:\/\//i.test(p)) {
    return _globToRegex(p).test(href);
  }
  // غير كذا نطابق الـ pathname (مع/بدون سلاش أخير)
  const normalized = path.endsWith("/") ? path : path + "/";
  const patNorm    = p.endsWith("/") ? p : p + "/";
  return _globToRegex(patNorm).test(normalized);
}

function _isIncluded({ includeList, excludeList }){
  const href = location.href;
  const path = location.pathname;

  // لو فيه exclude ويطابق → نرجّع false مباشرة
  for (const patt of excludeList){
    if (_urlMatchesPattern(patt, { href, path })) return false;
  }
  // لو فيه include محدد → لازم يطابق واحد منها
  if (includeList.length){
    for (const patt of includeList){
      if (_urlMatchesPattern(patt, { href, path })) return true;
    }
    return false; // ما طابق ولا واحد
  }
  // لو ما فيه include → نسمح افتراضياً (إلا إذا استُبعد أعلاه)
  return true;
}

function _normalizeArabicForStoplist(s){
  return String(s)
    .replace(/[،؛.,:"'!?()\[\]{}]/g, " ")
    .replace(/[\u0640\u064B-\u0652\u0670]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
async function loadCommonWords(currentScript){
  try {
    const r = await fetch(`${API_BASE}/api/common-words`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json().catch(()=> ({}));
      if (Array.isArray(j?.words)) return j.words;
    }
  } catch {}
  return [];
}


// MAIN
(async function main() {

  // تأخير بسيط قبل البدء عشان تتأكد الصفحة جهزت العناصر
  await new Promise(resolve => setTimeout(resolve, 1000)); // 1000ms = 1s
  // 1) استخراج المرشّحين الخام من الصفحة
  const container = document.getElementById("content") || 
                  document.querySelector("article") ||
                  document.querySelector("main") ||
                  document.body;

  const candidatesRaw = extractWords(container);
  if (!candidatesRaw.length) return;

  // 2) تحديد <script> الحالي (المضمّن لخيارات عليم)
  const currentScript = document.currentScript ||
        document.querySelector('script[src*="AleemFrontend.js"]');
  
  // 3) قراءة domainKeywords (إلزاميّة من جهة المنتج، لكن نحط "لا يوجد" كقيمة افتراضيّة لو ما وُجدت)
  let domainKeywords = ["لا يوجد"];
  if (currentScript) {
    const attr = currentScript.getAttribute("data-domain-keywords");
    if (attr) {
      try {
        domainKeywords = JSON.parse(attr);
      } catch {
        domainKeywords = attr.split(",").map(s => s.trim());
      }
    }
  }

  // 4) قراءة include/exclude
  const includeList = _toList(
    currentScript?.getAttribute("data-include") ||
    currentScript?.getAttribute("data-include-pages")
  );
  const excludeList = _toList(
    currentScript?.getAttribute("data-exclude") ||
    currentScript?.getAttribute("data-exclude-pages")
  );

  // 5) فلترة الصفحة بناءً على include/exclude
  if (!_isIncluded({ includeList, excludeList })) {
    console.debug("[Aleem] skipped by include/exclude rules", {
      includeList, excludeList, href: location.href
    });
    return;
  }

  // 6) تحميل قائمة الكلمات الشائعة وبناء مجموعة الاستبعاد
  const commonList = await loadCommonWords(currentScript);
  const COMMON_SET = new Set(commonList.map(_normalizeArabicForStoplist));

  // 7) تجهيز المرشّحين (تنظيف + إزالة التكرار + استبعاد القصيرة والشائعة)
  const candidates = Array.from(new Set(
    candidatesRaw
      .map(_normalizeArabicForStoplist)
      .filter(Boolean)
      .filter(w => w.length > 2)
      .filter(w => !COMMON_SET.has(w))
  ));
  if (!candidates.length) return; // لو ما بقي شيء بعد التنقية

  // 8) قراءة مستوى الصعوبة (نسبة الكلمات المُراد تظليلها)
  //    "منخفض" => 0.06 ، "مرتفع" => 0.18 ، "عادي" => null (بدون نسبة ثابتة)
  //    ولو المستخدم كتب رقم (مثلاً 0.05) نستخدمه مباشرةً.
  let difficulty = null;
  if (currentScript) {
    const diffAttr = currentScript.getAttribute("data-difficulty");
    if (diffAttr) {
      const val = diffAttr.trim();
      if (val === "منخفض")      difficulty = 0.06;
      else if (val === "مرتفع") difficulty = 0.18;
      else if (val === "عادي")  difficulty = null;
      else {
        const num = parseFloat(val);
        difficulty = isNaN(num) ? null : num;
      }
    }
  }

  // 9) مفاتيح الكاش + محاولة المسار السريع
  const cacheKey = makePageCacheKey(domainKeywords, difficulty);
  const cached   = loadPageCache(cacheKey);

  // Fast path: لو في كاش صالح، نعرض فوراً (يدعم أوفلاين)
  if (cached && cached.words.length) {
    try {
      await highlightWords(cached.words, cached.meaningMap, container);
      // تحديث صامت بالخلفية لو كنا أونلاين
      if (navigator.onLine) {
        refreshInBackground();
      }
      return; // المستخدم يشوف الهايلايت مباشرة
    } catch {
      // لو فشل الاسترجاع من الكاش، نكمل للمسار الطبيعي
    }
  }

  // 10) المسار الطبيعي عبر الشبكة: حساب جديد ثم تخزين
  await computeAndCache(difficulty);
  

  // --------- الدوال المساعدة داخل النطاق ---------

  // تحسب الكلمات النادرة (Gemini) + تجيب المعاني من المعجم + تحفظ وتُظهِر
  async function computeAndCache(difficulty) {
    let selected = null;
    try {
      selected = await selectUncommonWithGemini(candidates, domainKeywords, difficulty);
    } catch (err) {
      console.warn("[Aleem] selectUncommonWithOpenAI threw:", err?.message);
    }

    const apiUnavailable = selected === null;

    if (apiUnavailable) {
      return;
    }

    // Fetch meanings in controlled batches of 5 (never fires hundreds of requests at once)
    const BATCH_SIZE = 5;
    const meaningMap = new Map();

    const checks = await fetchInBatches(selected, BATCH_SIZE, async (w) => {
      try {
        const { hasMeaning, html } =
          await fetchMeaningFromMuajam(w);
        if (hasMeaning) {
          meaningMap.set(w, html);
          return w;
        }
      } catch (err) {
        console.warn("[Aleem] muajam fetch failed for", w, err?.message);
      }
      return null;
    });

    const withMeaning = checks.filter(Boolean);

    // Persist to cache
    savePageCache({ key: cacheKey, words: withMeaning, meaningMap });

    // Apply highlights to the page
    await highlightWords(withMeaning, meaningMap, container);
  }

  // تحديث صامت بالخلفيّة (إعادة حساب + كتابة الكاش) بدون تغيير مرئي مباشر
  async function refreshInBackground() {
    try {
      document.querySelectorAll('mark.aleem-word').forEach(mark => {
      mark.replaceWith(document.createTextNode(mark.dataset.word || mark.innerText));
      });
      await computeAndCache(difficulty);
    } catch {}
  }
})();