/**
 * Excel 및 CSV 파서 유틸리티
 * 다양한 헤더 변형 및 숫자 포맷(쉼표, 소수점, 통화단위, 신규 표기)을 유연하게 처리
 */
const BudgetParser = {
  /**
   * CSV 텍스트를 파싱하여 객체 배열로 변환
   */
  parseCSV(text) {
    if (!text || typeof text !== 'string') return [];
    
    const lines = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i++; // 이스케이프된 쌍따옴표 건너뛰기
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    
    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c.length > 0)) {
        lines.push(currentRow);
      }
    }
    
    if (lines.length < 2) return [];
    
    const headers = lines[0];
    const dataRows = lines.slice(1);
    
    const rawObjects = dataRows.map(row => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx] !== undefined ? row[idx] : '';
      });
      return obj;
    });
    
    return this.normalizeDataset(rawObjects, headers);
  },

  /**
   * SheetJS로 읽은 XLSX Workbook 파싱
   */
  parseWorkbook(workbook) {
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('엑셀 파일에 유효한 시트가 없습니다.');
    }
    
    let bestSheetName = workbook.SheetNames[0];
    let maxRows = 0;
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (json && json.length > maxRows) {
        maxRows = json.length;
        bestSheetName = sheetName;
      }
    }
    
    const targetSheet = workbook.Sheets[bestSheetName];
    const rawGrid = XLSX.utils.sheet_to_json(targetSheet, { header: 1, defval: '' });
    
    if (!rawGrid || rawGrid.length < 2) {
      throw new Error('시트에 데이터 행이 부족합니다.');
    }
    
    let headerRowIdx = 0;
    for (let r = 0; r < Math.min(rawGrid.length, 5); r++) {
      const row = rawGrid[r];
      const joined = row.join(' ');
      if (joined.includes('분야') || joined.includes('사업') || joined.includes('연번') || joined.includes('정부안')) {
        headerRowIdx = r;
        break;
      }
    }
    
    const headers = rawGrid[headerRowIdx].map(h => String(h).trim());
    const dataRows = rawGrid.slice(headerRowIdx + 1);
    
    const rawObjects = dataRows
      .filter(row => row.some(cell => String(cell).trim().length > 0))
      .map(row => {
        const obj = {};
        headers.forEach((h, idx) => {
          if (h) obj[h] = row[idx] !== undefined ? row[idx] : '';
        });
        return obj;
      });
      
    return this.normalizeDataset(rawObjects, headers);
  },

  /**
   * 다양한 컬럼 헤더명을 표준 키로 매핑
   */
  detectColumnKeys(headers) {
    const map = {
      id: null,
      area: null,
      name: null,
      unit: null,
      yPrev: null,
      yCurr: null,
      diff: null,
      rate: null,
      details: null
    };

    const clean = str => String(str || '').toLowerCase().replace(/[\s\(\)\[\]_\-·\/\.]/g, '');

    headers.forEach(h => {
      const c = clean(h);
      if (!c) return;

      if (!map.id && (c === '연번' || c === '순번' || c === '번호' || c === 'no' || c === 'id')) {
        map.id = h;
      } else if (!map.area && (c.includes('분야') || c.includes('중점영역') || c.includes('영역') || c.includes('부문') || c === 'sector' || c === 'area')) {
        map.area = h;
      } else if (!map.name && (c.includes('세부사업') || c.includes('사업명') || c.includes('주요지표') || c.includes('사업내용') || c === 'project' || c === 'name')) {
        map.name = h;
      } else if (!map.unit && (c.includes('단위') || c.includes('구분') || c === 'unit')) {
        map.unit = h;
      } else if (!map.yPrev && (c.includes('2026') || c.includes('a') && c.includes('년') || c.includes('전년') || c.includes('본예산'))) {
        map.yPrev = h;
      } else if (!map.yCurr && (c.includes('2027') || c.includes('b') && c.includes('안') || c.includes('정부안') || c.includes('당해') || c.includes('금년'))) {
        map.yCurr = h;
      } else if (!map.diff && (c.includes('증감') || c.includes('ba') || c.includes('차액') || c === 'diff')) {
        map.diff = h;
      } else if (!map.rate && (c.includes('증가율') || c.includes('증감률') || c.includes('증감율') || c.includes('%') || c === 'rate')) {
        map.rate = h;
      } else if (!map.details && (c.includes('핵심내용') || c.includes('보도자료') || c.includes('원문') || c.includes('근거') || c.includes('비고') || c.includes('추진') || c.includes('내용'))) {
        map.details = h;
      }
    });

    if (!map.area && headers.length >= 2) map.area = headers[1];
    if (!map.name && headers.length >= 3) map.name = headers[2];
    if (!map.unit && headers.length >= 4) map.unit = headers[3];
    if (!map.yPrev && headers.length >= 5) map.yPrev = headers[4];
    if (!map.yCurr && headers.length >= 6) map.yCurr = headers[5];
    if (!map.diff && headers.length >= 7) map.diff = headers[6];
    if (!map.rate && headers.length >= 8) map.rate = headers[7];
    if (!map.details && headers.length >= 9) map.details = headers[8];

    return map;
  },

  /**
   * 숫자 문자열 정규화
   */
  parseNumber(val) {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    
    const str = String(val).replace(/,/g, '').trim();
    if (str === '-' || str === '신규' || str === 'NEW' || str === 'N/A') return 0;
    
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  },

  /**
   * 표준 데이터셋 구조로 변환
   */
  normalizeDataset(rawRows, headers) {
    if (!rawRows || rawRows.length === 0) return [];
    
    const colMap = this.detectColumnKeys(headers || Object.keys(rawRows[0] || {}));
    
    return rawRows.map((row, idx) => {
      const rawId = colMap.id ? row[colMap.id] : (idx + 1);
      const id = parseInt(rawId, 10) || (idx + 1);
      
      const rawArea = String(colMap.area ? row[colMap.area] : '기타').trim() || '기타';
      const areaClean = rawArea.replace(/^[①-⑳\d\.\s\-_]+/, '').trim() || rawArea;
      
      const name = String(colMap.name ? row[colMap.name] : `사업 ${id}`).trim();
      const unit = String(colMap.unit ? row[colMap.unit] : '억원').trim() || '억원';
      
      const yPrev = this.parseNumber(colMap.yPrev ? row[colMap.yPrev] : 0);
      const yCurr = this.parseNumber(colMap.yCurr ? row[colMap.yCurr] : 0);
      
      let diff = colMap.diff ? this.parseNumber(row[colMap.diff]) : (yCurr - yPrev);
      diff = Math.round(diff * 100) / 100;
      
      const rawRate = colMap.rate ? String(row[colMap.rate]).trim() : '';
      const details = colMap.details ? String(row[colMap.details]).trim() : '';
      
      // 신규 사업 여부 판정:
      // 1. 증가율 컬럼에 '신규' 또는 'NEW' 표기
      // 2. 전년도 예산이 0이고 당해년도 예산이 0보다 큰 경우
      const isNew = rawRate.includes('신규') || 
                    rawRate.toUpperCase().includes('NEW') || 
                    (yPrev === 0 && yCurr > 0);

      let rate = 0;
      let rateDisplay = '';

      if (isNew) {
        rateDisplay = '신규';
        rate = 100;
      } else if (rawRate && rawRate !== '-') {
        const cleanRateStr = rawRate.replace('%', '').replace(/,/g, '').trim();
        const parsedRate = parseFloat(cleanRateStr);
        if (!isNaN(parsedRate)) {
          rate = parsedRate;
          rateDisplay = `${rate > 0 ? '+' : ''}${rate.toFixed(1)}%`;
        }
      }
      
      if (!rateDisplay && !isNew) {
        if (yPrev > 0) {
          rate = ((yCurr - yPrev) / yPrev) * 100;
          rate = Math.round(rate * 10) / 10;
          rateDisplay = `${rate > 0 ? '+' : ''}${rate.toFixed(1)}%`;
        } else {
          rateDisplay = '0.0%';
        }
      }

      return {
        id,
        area: rawArea,
        areaClean,
        name,
        unit,
        yPrev,
        yCurr,
        diff,
        rate,
        rateDisplay,
        isNew,
        details,
        raw: row
      };
    }).filter(item => item.name && item.name.length > 0);
  }
};
