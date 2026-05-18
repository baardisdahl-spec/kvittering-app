// OCR med to motorer: Tesseract (gratis, lokal) eller Claude API (bedre kvalitet)

// ============ SETTINGS ============
const SETTINGS_KEY = 'kvitteringer_settings';

function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { ocrEngine: 'tesseract', claudeApiKey: '' };
  } catch {
    return { ocrEngine: 'tesseract', claudeApiKey: '' };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ============ MAIN OCR ENTRY POINT ============
async function runOCR(imageDataUrl) {
  const settings = getSettings();
  
  if (settings.ocrEngine === 'claude' && settings.claudeApiKey) {
    try {
      return await runClaudeOCR(imageDataUrl, settings.claudeApiKey);
    } catch (err) {
      console.error('Claude OCR failed, falling back to Tesseract:', err);
      return await runTesseractOCR(imageDataUrl);
    }
  }
  return await runTesseractOCR(imageDataUrl);
}

// ============ CLAUDE API OCR ============
async function runClaudeOCR(imageDataUrl, apiKey) {
  const match = imageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data');
  const mediaType = match[1];
  const base64Data = match[2];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data
            }
          },
          {
            type: 'text',
            text: `Du analyserer en kvittering (norsk eller engelsk). Returner KUN gyldig JSON i dette eksakte formatet, uten markdown eller forklaring:

{
  "merchant": "navnet på butikken/stedet (det mest fremtredende firmanavnet øverst)",
  "amount": totalbeløpet som tall (sluttsummen kunden betalte, ikke delsummer eller MVA),
  "currency": "valutakode i ISO 4217-format (NOK, EUR, USD, GBP, SEK, DKK, CHF, PLN, JPY, AUD, CAD, THB osv.). Default NOK hvis ikke spesifisert eller hvis det er en norsk kvittering med 'kr'.",
  "category": "én av: hotel, food, transport, flight, fuel, parking, supplies, other. Velg basert på butikkens type. Restaurant/kafé/dagligvare = food. Tog/buss/taxi = transport. Flyselskap = flight. Bensinstasjon = fuel. Parkeringshus = parking. Butikk for ting du har kjøpt = supplies.",
  "date": "YYYY-MM-DD (datoen for kjøpet)"
}

Hvis et felt ikke kan leses, sett verdien til null. Beløp skal være tall (eks: 425.00, ikke "425,00 kr").`
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');
  
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    merchant: parsed.merchant || '',
    amount: typeof parsed.amount === 'number' ? parsed.amount : null,
    currency: parsed.currency || null,
    category: parsed.category || null,
    date: parsed.date || null,
    rawText: text,
    engine: 'claude'
  };
}

// ============ TESSERACT OCR (fallback) ============
let tesseractWorker = null;

async function getOcrWorker() {
  if (tesseractWorker) return tesseractWorker;
  tesseractWorker = await Tesseract.createWorker(['nor', 'eng']);
  return tesseractWorker;
}

async function runTesseractOCR(imageDataUrl) {
  try {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(imageDataUrl);
    const result = parseReceiptText(data.text);
    if (result) result.engine = 'tesseract';
    return result;
  } catch (err) {
    console.error('Tesseract error:', err);
    return null;
  }
}

function parseReceiptText(text) {
  if (!text) return null;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  return {
    rawText: text,
    merchant: extractMerchant(lines),
    amount: extractAmount(text, lines),
    date: extractDate(text)
  };
}

function extractMerchant(lines) {
  for (const line of lines.slice(0, 5)) {
    if (/^[\d\s\-\.\/]+$/.test(line)) continue;
    if (line.length < 3) continue;
    if (/^(kvittering|receipt|kassebon)/i.test(line)) continue;
    return line.substring(0, 40);
  }
  return '';
}

function extractAmount(text, lines) {
  const totalKeywords = /(?:sum|totalt?|å\s*betale|beløp|å\sbetal|totalsum|å betale)/i;
  
  let candidates = [];
  for (let i = 0; i < lines.length; i++) {
    if (totalKeywords.test(lines[i])) {
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const nums = extractNumbersFromLine(lines[j]);
        candidates.push(...nums);
      }
    }
  }
  
  if (candidates.length === 0) {
    const allNums = [];
    for (const line of lines) {
      allNums.push(...extractNumbersFromLine(line));
    }
    if (allNums.length > 0) {
      return Math.max(...allNums);
    }
    return null;
  }
  
  return Math.max(...candidates);
}

function extractNumbersFromLine(line) {
  const matches = line.match(/(?:^|[\s:])(\d{1,3}(?:[\s\.]\d{3})*[,\.]\d{2}|\d{1,6}[,\.]\d{2})(?=\s|$|[^\d])/g);
  if (!matches) return [];
  return matches.map(m => {
    const normalized = m.replace(/[\s:]/g, '').replace(',', '.');
    const num = parseFloat(normalized);
    return num;
  }).filter(n => !isNaN(n) && n > 0 && n < 100000);
}

function extractDate(text) {
  const patterns = [
    /(\d{2})[.\-\/](\d{2})[.\-\/](\d{4})/,
    /(\d{2})[.\-\/](\d{2})[.\-\/](\d{2})\b/,
    /(\d{4})[.\-\/](\d{2})[.\-\/](\d{2})/
  ];
  
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      let day, month, year;
      if (m[1].length === 4) {
        year = m[1];
        month = m[2];
        day = m[3];
      } else {
        day = m[1];
        month = m[2];
        year = m[3].length === 2 ? '20' + m[3] : m[3];
      }
      const d = parseInt(day), mo = parseInt(month), y = parseInt(year);
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) {
        return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
      }
    }
  }
  return null;
}
