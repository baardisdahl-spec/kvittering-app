# Kvitteringer

En enkel Progressive Web App (PWA) for å registrere kvitteringer på reiser. Tar bilde av kvitteringer, leser tekst automatisk (OCR), og genererer PDF som kan sendes på e-post.

## Funksjoner

- 📷 Ta bilde med kamera direkte fra appen, eller velg fra bildebibliotek
- 🤖 Automatisk lesing (OCR) av butikk, beløp og dato (norsk + engelsk)
- ✏️ Manuell redigering hvis OCR ikke treffer
- 🧳 Flere reiser med flere kvitteringer per reise
- 📄 PDF-eksport med oversiktsside + bilde av hver kvittering
- 💾 Lagrer alt lokalt på enheten (ingen server, ingen kontoer)
- 📱 Installeres på iPhone-hjemskjermen og fungerer offline
- 🌙 Støtter mørk modus automatisk

## Kom i gang lokalt

Du trenger Python 3 (følger med macOS) for å kjøre en lokal server:

```bash
cd kvittering-app
python3 -m http.server 8000
```

Åpne deretter `http://localhost:8000` i nettleseren.

> **Hvorfor server?** Service workers og kameratilgang krever HTTPS eller localhost. Du kan ikke bare dobbeltklikke på `index.html`.

## Deploy til GitHub Pages (anbefalt)

Dette er den enkleste måten å få appen tilgjengelig på iPhone:

1. **Opprett et nytt repo på GitHub**, f.eks. `kvittering-app`
2. **Push koden** fra denne mappen:
   ```bash
   cd kvittering-app
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/DITT_BRUKERNAVN/kvittering-app.git
   git push -u origin main
   ```
3. **Aktiver GitHub Pages**: gå til repo → Settings → Pages → Source: `main` branch, mappe `/ (root)` → Save
4. Etter et par minutter er appen tilgjengelig på `https://DITT_BRUKERNAVN.github.io/kvittering-app/`

## Installer på iPhone

1. Åpne URL-en i **Safari** (må være Safari, ikke Chrome)
2. Trykk **Del-knappen** (firkant med pil opp)
3. Scroll ned og trykk **Legg til på Hjem-skjerm**
4. Gi den et navn og trykk **Legg til**

Nå har du en app-ikon på hjemskjermen som åpner seg i fullskjerm uten Safari-UI.

## Filstruktur

```
kvittering-app/
├── index.html      # Hovedside og templates
├── styles.css      # iOS-inspirert styling
├── app.js          # Navigering og UI-logikk
├── storage.js      # IndexedDB for lagring
├── ocr.js          # Tesseract.js OCR + parsing
├── pdf.js          # jsPDF-eksport
├── sw.js           # Service worker (offline)
├── manifest.json   # PWA-manifest
└── icons/          # App-ikoner (legg til 192x192 og 512x512 PNG)
```

## App-ikoner

For en finere installasjonsopplevelse kan du legge til to PNG-ikoner i `icons/`:
- `icon-192.png` (192×192 px)
- `icon-512.png` (512×512 px)

Du kan generere disse på [realfavicongenerator.net](https://realfavicongenerator.net/) eller [pwabuilder.com](https://www.pwabuilder.com/imageGenerator).

## Tilpasning og utvidelser

### Send PDF direkte på e-post

Legg til en send-knapp som åpner Mail-appen med PDF som vedlegg. På iOS er dette begrenset, men du kan bruke `mailto:`-lenker eller [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) for å dele PDF-en til Mail.

I `pdf.js`, etter generering:
```javascript
const blob = doc.output('blob');
if (navigator.share && navigator.canShare({ files: [new File([blob], filename, {type: 'application/pdf'})] })) {
  navigator.share({
    files: [new File([blob], filename, {type: 'application/pdf'})],
    title: trip.name
  });
}
```

### Bedre OCR med skytjeneste

Tesseract.js gjør jobben for de fleste kvitteringer, men har sine begrensninger. For mer presis lesing kan du bytte til:
- **Google Cloud Vision API** — meget presis, gratis tier på 1000 requests/måned
- **Azure Computer Vision** — også veldig god, gratis tier
- **AWS Textract** — best på strukturert tekst

Disse krever en backend (eller en serverless-funksjon) for å beskytte API-nøkkelen.

### Eksport til regneark

Hvis du vil legge ved en CSV/Excel-fil i tillegg til PDF, kan du legge til [SheetJS](https://sheetjs.com/) og generere et regneark med samme data.

## Personvern

Alt lagres lokalt på enheten din via IndexedDB. Ingen data sendes noensteds — bilder, beløp og notater forlater aldri telefonen din. Hvis du tømmer Safari-data eller avinstallerer appen mister du dataene.

For backup, eksporter til PDF og lagre filen et trygt sted.

## Kjent problemer / forbedringer

- **iOS PDF-visning**: PDF åpner i ny fane som du kan dele/lagre via systemets dele-meny
- **OCR på norsk**: Fungerer best på trykte kvitteringer med god kontrast. Håndskrevne kvitteringer leses dårlig
- **Tesseract loading**: Første OCR-kjøring laster ned språkdata (~10MB), deretter er den raskere

## Lisens

MIT — bruk fritt.
