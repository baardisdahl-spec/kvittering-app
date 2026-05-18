// PDF generation using jsPDF
async function generatePDF(trip) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;

  // ============ COVER / SUMMARY PAGE ============
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Reiseregning', margin, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Generert: ${formatDateNorwegian(new Date())}`, margin, 32);
  doc.setTextColor(0);

  // Trip info
  let y = 45;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(trip.name || 'Uten navn', margin, y);
  y += 7;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const from = trip.dateFrom || trip.date;
  const to = trip.dateTo;
  if (from && to && to !== from) {
    const days = calculateDaysForPDF(from, to);
    const dayLabel = days === 1 ? 'dag' : 'dager';
    doc.text(`Periode: ${formatDateString(from)} – ${formatDateString(to)}  (${days} ${dayLabel})`, margin, y);
    y += 6;
  } else if (from) {
    doc.text(`Dato: ${formatDateString(from)}`, margin, y);
    y += 6;
  }
  if (trip.description) {
    const descLines = doc.splitTextToSize(trip.description, contentWidth);
    doc.text(descLines, margin, y);
    y += descLines.length * 5 + 3;
  }

  // Summary table
  y += 5;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('#', margin, y);
  doc.text('Butikk/sted', margin + 8, y);
  doc.text('Kategori', margin + 70, y);
  doc.text('Dato', margin + 110, y);
  doc.text('Beløp', pageWidth - margin, y, { align: 'right' });
  y += 4;
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const totalsByCurrency = {};
  trip.receipts.forEach((r, i) => {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 25;
    }
    doc.text(String(i + 1), margin, y);
    const merchant = (r.merchant || '–').substring(0, 32);
    doc.text(merchant, margin + 8, y);
    // Kategori-navn (uten ikon)
    const catName = getCategoryName(r.category);
    doc.text(catName.substring(0, 16), margin + 70, y);
    doc.text(r.date ? formatDateString(r.date) : '–', margin + 110, y);
    const amt = r.amount ? formatCurrency(r.amount, r.currency) : '–';
    doc.text(amt, pageWidth - margin, y, { align: 'right' });
    y += 6;
    const cur = r.currency || 'NOK';
    totalsByCurrency[cur] = (totalsByCurrency[cur] || 0) + (r.amount || 0);
  });

  y += 2;
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  
  // If multiple currencies, list each on its own line
  const currencies = Object.keys(totalsByCurrency);
  if (currencies.length === 0) {
    doc.text('Totalt:', margin + 110, y);
    doc.text(formatCurrency(0, 'NOK'), pageWidth - margin, y, { align: 'right' });
  } else if (currencies.length === 1) {
    doc.text('Totalt:', margin + 110, y);
    doc.text(formatCurrency(totalsByCurrency[currencies[0]], currencies[0]), pageWidth - margin, y, { align: 'right' });
  } else {
    doc.text('Totalt per valuta:', margin + 110, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    currencies.forEach(cur => {
      doc.text(formatCurrency(totalsByCurrency[cur], cur), pageWidth - margin, y, { align: 'right' });
      y += 5;
    });
  }

  // ============ RECEIPT IMAGE PAGES ============
  for (let i = 0; i < trip.receipts.length; i++) {
    const r = trip.receipts[i];
    doc.addPage();
    
    // Header for receipt
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`Kvittering ${i + 1}`, margin, 20);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80);
    let infoY = 27;
    if (r.merchant) {
      doc.text(`Butikk: ${r.merchant}`, margin, infoY);
      infoY += 5;
    }
    if (r.category) {
      doc.text(`Kategori: ${getCategoryName(r.category)}`, margin, infoY);
      infoY += 5;
    }
    if (r.date) {
      doc.text(`Dato: ${formatDateString(r.date)}`, margin, infoY);
      infoY += 5;
    }
    if (r.amount) {
      doc.text(`Beløp: ${formatCurrency(r.amount, r.currency)}`, margin, infoY);
      infoY += 5;
    }
    if (r.note) {
      const noteLines = doc.splitTextToSize(`Notat: ${r.note}`, contentWidth);
      doc.text(noteLines, margin, infoY);
      infoY += noteLines.length * 5;
    }
    doc.setTextColor(0);

    // Add the receipt image
    if (r.image) {
      try {
        const imgY = infoY + 5;
        const maxImgHeight = pageHeight - imgY - margin;
        const imgInfo = await getImageDimensions(r.image);
        const ratio = imgInfo.width / imgInfo.height;
        let imgW = contentWidth;
        let imgH = imgW / ratio;
        if (imgH > maxImgHeight) {
          imgH = maxImgHeight;
          imgW = imgH * ratio;
        }
        const imgX = margin + (contentWidth - imgW) / 2;
        doc.addImage(r.image, 'JPEG', imgX, imgY, imgW, imgH);
      } catch (err) {
        console.error('Could not add image:', err);
        doc.text('[Kunne ikke laste bilde]', margin, infoY + 10);
      }
    }
  }

  return doc;
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
}

function getCategoryName(catId) {
  const names = {
    hotel: 'Hotell', food: 'Mat', transport: 'Transport', flight: 'Fly',
    fuel: 'Drivstoff', parking: 'Parkering', supplies: 'Utgifter', other: 'Annet'
  };
  return names[catId] || 'Annet';
}

function calculateDaysForPDF(fromStr, toStr) {
  const from = new Date(fromStr);
  const to = new Date(toStr);
  return Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1;
}

function formatCurrency(amount, currency = 'NOK') {
  const symbols = {
    NOK: 'kr', SEK: 'kr', DKK: 'kr',
    EUR: '€', USD: '$', GBP: '£',
    CHF: 'CHF', PLN: 'zł', JPY: '¥',
    AUD: 'A$', CAD: 'C$', THB: '฿'
  };
  const symbol = symbols[currency] || currency;
  const formatted = new Intl.NumberFormat('nb-NO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
  return `${formatted} ${symbol}`;
}

function formatDateNorwegian(date) {
  return new Intl.DateTimeFormat('nb-NO', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(date);
}

function formatDateString(dateStr) {
  if (!dateStr) return '';
  // dateStr is YYYY-MM-DD from date input
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return formatDateNorwegian(d);
}

async function exportTripToPDF(trip) {
  const doc = await generatePDF(trip);
  const filename = `Reiseregning_${(trip.name || 'reise').replace(/[^a-z0-9æøå\-]/gi, '_')}.pdf`;
  
  // On iOS, the cleanest way is to open in new tab so user can save/share via system share sheet
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } else {
    doc.save(filename);
  }
  return filename;
}
