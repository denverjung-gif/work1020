/**
 * 메인 애플리케이션 제어 스크립트
 * 상태 관리, 탭 전환, 필터링, 정렬, 엑셀/CSV 업로드 및 다운로드, 모달 제어
 */
const App = {
  state: {
    dataset: [],
    fileName: '기본 데이터 (2027년 국방예산 정부안)',
    activeTab: 'overview',
    selectedSector: null,
    searchQuery: '',
    filterSector: 'ALL',
    filterType: 'ALL', // 'ALL', 'NEW', 'EXISTING'
    sortColumn: 'id',
    sortAsc: true,
    theme: localStorage.getItem('theme') || 'light'
  },

  /**
   * 앱 초기화
   */
  init() {
    this.applyTheme(this.state.theme);
    this.bindEvents();
    
    // URL 파라미터로 초기 탭 지정 가능 (e.g. index.html?tab=sector)
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab');
    if (initialTab && ['overview', 'sector', 'new', 'table'].includes(initialTab)) {
      this.state.activeTab = initialTab;
    }

    // 기본 데이터셋 로드
    const normalized = BudgetParser.normalizeDataset(DEFAULT_DATA);
    this.loadDataset(normalized, '기본 데이터 (2027년 국방예산 정부안)');

    if (initialTab && ['overview', 'sector', 'new', 'table'].includes(initialTab)) {
      this.switchTab(initialTab);
    }
  },

  /**
   * 테마 적용
   */
  applyTheme(theme) {
    this.state.theme = theme;
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      const icon = document.getElementById('themeIcon');
      if (icon) icon.textContent = '☀️';
    } else {
      document.documentElement.classList.remove('dark');
      const icon = document.getElementById('themeIcon');
      if (icon) icon.textContent = '🌙';
    }
    DashboardCharts.updateTheme();
  },

  toggleTheme() {
    this.applyTheme(this.state.theme === 'dark' ? 'light' : 'dark');
  },

  /**
   * 이벤트 바인딩
   */
  bindEvents() {
    // 테마 토글 버튼
    document.getElementById('btnToggleTheme')?.addEventListener('click', () => this.toggleTheme());

    // 기본 데이터 복원 버튼
    document.getElementById('btnResetData')?.addEventListener('click', () => {
      const normalized = BudgetParser.normalizeDataset(DEFAULT_DATA);
      this.loadDataset(normalized, '기본 데이터 (2027년 국방예산 정부안)');
      this.showToast('기본 예시 데이터로 복원되었습니다.', 'success');
    });

    // 파일 업로드 인풋
    const fileInput = document.getElementById('fileInput');
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) this.handleFileUpload(file);
      e.target.value = ''; // 재업로드 가능하도록 초기화
    });

    // 드래그 앤 드롭 영역
    const dropZone = document.getElementById('dropZone');
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dropZone) dropZone.classList.add('drag-active');
    });
    window.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null && dropZone) {
        dropZone.classList.remove('drag-active');
      }
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dropZone) dropZone.classList.remove('drag-active');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.handleFileUpload(file);
    });

    // 탭 전환
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        this.switchTab(targetTab);
      });
    });

    // 검색 및 필터 이벤트
    document.getElementById('tableSearchInput')?.addEventListener('input', (e) => {
      this.state.searchQuery = e.target.value.trim().toLowerCase();
      this.renderTableTab();
    });

    document.getElementById('tableSectorFilter')?.addEventListener('change', (e) => {
      this.state.filterSector = e.target.value;
      this.renderTableTab();
    });

    document.getElementById('tableTypeFilter')?.addEventListener('change', (e) => {
      this.state.filterType = e.target.value;
      this.renderTableTab();
    });

    // 모달 닫기
    document.getElementById('modalCloseBtn')?.addEventListener('click', () => this.closeDetailModal());
    document.getElementById('detailModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'detailModal') this.closeDetailModal();
    });

    // ESC 키 모달 닫기
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeDetailModal();
    });

    // CSV 및 엑셀 내보내기 버튼
    document.getElementById('btnExportCSV')?.addEventListener('click', () => this.exportCurrentData('csv'));
    document.getElementById('btnExportXLSX')?.addEventListener('click', () => this.exportCurrentData('xlsx'));
  },

  /**
   * 파일 업로드 처리 (Excel & CSV)
   */
  handleFileUpload(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    if (ext === 'csv') {
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const dataset = BudgetParser.parseCSV(text);
          if (dataset.length === 0) {
            this.showToast('CSV 파일에서 유효한 데이터를 추출하지 못했습니다.', 'error');
            return;
          }
          this.loadDataset(dataset, file.name);
          this.showToast(`'${file.name}' 업로드 완료 (${dataset.length}개 사업)`, 'success');
        } catch (err) {
          console.error(err);
          this.showToast(`CSV 파싱 오류: ${err.message}`, 'error');
        }
      };
      reader.readAsText(file, 'utf-8');
    } else if (ext === 'xlsx' || ext === 'xls') {
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const dataset = BudgetParser.parseWorkbook(workbook);
          if (dataset.length === 0) {
            this.showToast('엑셀 파일에서 유효한 데이터를 추출하지 못했습니다.', 'error');
            return;
          }
          this.loadDataset(dataset, file.name);
          this.showToast(`'${file.name}' 업로드 완료 (${dataset.length}개 사업)`, 'success');
        } catch (err) {
          console.error(err);
          this.showToast(`엑셀 파싱 오류: ${err.message}`, 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      this.showToast('지원되지 않는 파일 형식입니다. (.xlsx, .xls, .csv 가능)', 'error');
    }
  },

  /**
   * 새 데이터셋 로드 및 대시보드 전면 갱신
   */
  loadDataset(dataset, fileName) {
    this.state.dataset = dataset;
    this.state.fileName = fileName;

    // 첫 번째 분야를 기본 선택값으로 지정
    const sectors = this.getUniqueSectors();
    if (sectors.length > 0) {
      this.state.selectedSector = sectors[0];
    } else {
      this.state.selectedSector = null;
    }

    // 파일 이름 배지 업데이트
    const fileBadge = document.getElementById('currentFileBadge');
    if (fileBadge) {
      fileBadge.textContent = `${fileName} (${dataset.length}개 사업)`;
    }

    // 상단 종합 KPI 카드 갱신
    this.renderKPICards();

    // 분야 필터 옵션 동적 갱신
    this.populateSectorFilters();

    // 현재 탭 렌더링
    this.renderActiveTab();
  },

  /**
   * 고유 분야 목록 반환
   */
  getUniqueSectors() {
    const set = new Set();
    this.state.dataset.forEach(item => {
      if (item.area) set.add(item.area);
    });
    return Array.from(set);
  },

  /**
   * 분야별 집계 데이터 생성
   */
  getSectorAggregates() {
    const map = {};
    this.state.dataset.forEach(item => {
      const area = item.area;
      if (!map[area]) {
        map[area] = {
          area: area,
          areaClean: item.areaClean,
          yPrev: 0,
          yCurr: 0,
          diff: 0,
          count: 0,
          newCount: 0,
          newBudget: 0,
          projects: []
        };
      }
      map[area].yPrev += item.yPrev;
      map[area].yCurr += item.yCurr;
      map[area].diff += item.diff;
      map[area].count += 1;
      map[area].projects.push(item);
      if (item.isNew) {
        map[area].newCount += 1;
        map[area].newBudget += item.yCurr;
      }
    });

    return Object.values(map).map(sec => {
      sec.yPrev = Math.round(sec.yPrev * 100) / 100;
      sec.yCurr = Math.round(sec.yCurr * 100) / 100;
      sec.diff = Math.round(sec.diff * 100) / 100;
      sec.rate = sec.yPrev > 0 ? ((sec.yCurr - sec.yPrev) / sec.yPrev) * 100 : 0;
      sec.rate = Math.round(sec.rate * 10) / 10;
      return sec;
    });
  },

  /**
   * 상단 종합 KPI 요약 카드 렌더링
   */
  renderKPICards() {
    const data = this.state.dataset;
    let totalYPrev = 0;
    let totalYCurr = 0;
    let newProjectsCount = 0;
    let newProjectsBudget = 0;

    data.forEach(item => {
      totalYPrev += item.yPrev;
      totalYCurr += item.yCurr;
      if (item.isNew) {
        newProjectsCount += 1;
        newProjectsBudget += item.yCurr;
      }
    });

    const totalDiff = totalYCurr - totalYPrev;
    const totalRate = totalYPrev > 0 ? ((totalDiff / totalYPrev) * 100) : 0;
    const existCount = data.length - newProjectsCount;

    // 최대 투자 분야 찾기
    const sectorAggs = this.getSectorAggregates();
    sectorAggs.sort((a, b) => b.yCurr - a.yCurr);
    const topSector = sectorAggs[0] || { areaClean: '-', yCurr: 0 };

    // KPI DOM 업데이트
    this.setText('kpiTotalYCurr', DashboardCharts.formatAmount(totalYCurr));
    this.setText('kpiTotalYPrev', `2026년 본예산: ${DashboardCharts.formatAmount(totalYPrev)}`);
    
    const diffSign = totalDiff >= 0 ? '+' : '';
    this.setText('kpiTotalDiff', `${diffSign}${DashboardCharts.formatAmount(totalDiff)}`);
    this.setText('kpiTotalRate', `전년 대비 ${diffSign}${totalRate.toFixed(1)}%`);
    
    this.setText('kpiNewCount', `${newProjectsCount}개 사업`);
    this.setText('kpiNewBudget', `신규 총액: ${DashboardCharts.formatAmount(newProjectsBudget)}`);
    
    this.setText('kpiTopSector', topSector.areaClean);
    this.setText('kpiTopSectorBudget', DashboardCharts.formatAmount(topSector.yCurr));

    this.setText('kpiProjectCount', `${data.length}개 사업`);
    this.setText('kpiProjectBreakdown', `기존 ${existCount}개 / 신규 ${newProjectsCount}개`);
  },

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  },

  /**
   * 분야 필터 select 옵션 채우기
   */
  populateSectorFilters() {
    const sectors = this.getUniqueSectors();
    const select = document.getElementById('tableSectorFilter');
    if (!select) return;

    select.innerHTML = '<option value="ALL">전체 분야 보기</option>';
    sectors.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec;
      opt.textContent = sec;
      select.appendChild(opt);
    });
  },

  /**
   * 탭 전환
   */
  switchTab(tabId) {
    this.state.activeTab = tabId;

    // 탭 헤더 활성화 상태 변경
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    // 탭 본문 표시/숨김
    document.querySelectorAll('.tab-content').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });

    this.renderActiveTab();
  },

  /**
   * 현재 활성 탭 렌더링
   */
  renderActiveTab() {
    switch (this.state.activeTab) {
      case 'overview':
        this.renderOverviewTab();
        break;
      case 'sector':
        this.renderSectorTab();
        break;
      case 'new':
        this.renderNewProjectsTab();
        break;
      case 'table':
        this.renderTableTab();
        break;
    }
  },

  /**
   * 1. 종합 대시보드 탭 렌더링
   */
  renderOverviewTab() {
    const sectorAggs = this.getSectorAggregates();
    const data = this.state.dataset;

    let newBudget = 0;
    let existBudget = 0;
    let newCount = 0;
    let existCount = 0;

    data.forEach(item => {
      if (item.isNew) {
        newBudget += item.yCurr;
        newCount++;
      } else {
        existBudget += item.yCurr;
        existCount++;
      }
    });

    // 차트들 렌더링
    DashboardCharts.renderSectorShare('chartSectorShare', sectorAggs);
    DashboardCharts.renderSectorCompare('chartSectorCompare', sectorAggs);
    DashboardCharts.renderSectorDiffRank('chartSectorDiffRank', sectorAggs);
    DashboardCharts.renderNewVsExisting('chartNewVsExisting', newBudget, existBudget, newCount, existCount);

    // 하단 주요 하이라이트 카드 렌더링
    this.renderOverviewHighlights(data, sectorAggs);
  },

  /**
   * 종합 대시보드 하단 하이라이트 생성
   */
  renderOverviewHighlights(data, sectorAggs) {
    const container = document.getElementById('overviewHighlights');
    if (!container) return;

    // 최대 증액 Top 3 사업 선별
    const topDiffProjects = [...data].sort((a, b) => b.diff - a.diff).slice(0, 3);
    
    // 최대 증가율 기존 사업 Top 3 선별
    const topRateProjects = [...data]
      .filter(item => !item.isNew && item.rate > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3);

    let html = `
      <div class="highlight-card">
        <div class="highlight-title">
          <span class="icon">📈</span> 최대 증액 Top 3 사업
        </div>
        <div class="highlight-list">
          ${topDiffProjects.map((p, i) => `
            <div class="highlight-item" onclick="App.showDetailModalById(${p.id})">
              <span class="rank-badge rank-${i+1}">${i+1}</span>
              <div class="item-text">
                <div class="name">${p.name}</div>
                <div class="sub">${p.areaClean}</div>
              </div>
              <div class="item-val text-blue">+${DashboardCharts.formatAmount(p.diff)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="highlight-card">
        <div class="highlight-title">
          <span class="icon">⚡</span> 최고 증가율 Top 3 사업 (기존사업)
        </div>
        <div class="highlight-list">
          ${topRateProjects.map((p, i) => `
            <div class="highlight-item" onclick="App.showDetailModalById(${p.id})">
              <span class="rank-badge rank-${i+1}">${i+1}</span>
              <div class="item-text">
                <div class="name">${p.name}</div>
                <div class="sub">${p.areaClean}</div>
              </div>
              <div class="item-val text-emerald">+${p.rate.toFixed(1)}%</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="highlight-card">
        <div class="highlight-title">
          <span class="icon">🛡️</span> 중점 분야 예산 집중도
        </div>
        <div class="highlight-list">
          ${sectorAggs.slice(0, 3).map((s, i) => {
            const total = sectorAggs.reduce((a, b) => a + b.yCurr, 0);
            const pct = total > 0 ? ((s.yCurr / total) * 100).toFixed(1) : 0;
            return `
              <div class="highlight-item" onclick="App.selectSectorAndGo('${s.area}')">
                <span class="rank-badge rank-${i+1}">${i+1}</span>
                <div class="item-text">
                  <div class="name">${s.areaClean}</div>
                  <div class="sub">${s.count}개 세부사업 (신규 ${s.newCount}개)</div>
                </div>
                <div class="item-val text-indigo">${DashboardCharts.formatAmount(s.yCurr)} (${pct}%)</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  /**
   * 2. 분야별 심층 분석 탭 렌더링
   */
  renderSectorTab() {
    const sectorAggs = this.getSectorAggregates();
    const pillsContainer = document.getElementById('sectorPillsContainer');
    if (!pillsContainer) return;

    if (!this.state.selectedSector && sectorAggs.length > 0) {
      this.state.selectedSector = sectorAggs[0].area;
    }

    // 분야 선택 필즈 생성
    pillsContainer.innerHTML = sectorAggs.map(sec => `
      <button class="sector-pill ${sec.area === this.state.selectedSector ? 'active' : ''}" 
              onclick="App.selectSector('${sec.area}')">
        <span>${sec.area}</span>
        <span class="pill-count">${sec.count}</span>
      </button>
    `).join('');

    // 현재 선택된 분야 상세 정보 렌더링
    const currentSec = sectorAggs.find(s => s.area === this.state.selectedSector) || sectorAggs[0];
    if (!currentSec) return;

    this.setText('secDetailTitle', currentSec.area);
    this.setText('secDetailCurr', DashboardCharts.formatAmount(currentSec.yCurr));
    this.setText('secDetailPrev', `2026년: ${DashboardCharts.formatAmount(currentSec.yPrev)}`);
    
    const sign = currentSec.diff >= 0 ? '+' : '';
    this.setText('secDetailDiff', `${sign}${DashboardCharts.formatAmount(currentSec.diff)} (${sign}${currentSec.rate}%)`);
    this.setText('secDetailCounts', `총 ${currentSec.count}개 사업 (신규사업: ${currentSec.newCount}개 / ${DashboardCharts.formatAmount(currentSec.newBudget)})`);

    // 선택된 분야 내 세부 사업별 비교 차트 렌더링
    DashboardCharts.renderSectorProjects('chartSectorProjects', currentSec.projects);

    // 선택된 분야 세부 사업 카드 그리드 렌더링
    const cardsContainer = document.getElementById('sectorProjectsGrid');
    if (cardsContainer) {
      cardsContainer.innerHTML = currentSec.projects.map(p => `
        <div class="project-card ${p.isNew ? 'is-new' : ''}" onclick="App.showDetailModalById(${p.id})">
          <div class="card-header">
            <span class="card-id">#${p.id}</span>
            ${p.isNew ? '<span class="badge-new">신규사업</span>' : `<span class="badge-rate ${p.diff >= 0 ? 'inc' : 'dec'}">${p.rateDisplay}</span>`}
          </div>
          <h4 class="card-title">${p.name}</h4>
          
          <div class="card-metrics">
            <div class="metric-col">
              <span class="label">2026년 (A)</span>
              <span class="val">${DashboardCharts.formatAmount(p.yPrev)}</span>
            </div>
            <div class="metric-arrow">➔</div>
            <div class="metric-col">
              <span class="label">2027년 정부안 (B)</span>
              <span class="val bold text-blue">${DashboardCharts.formatAmount(p.yCurr)}</span>
            </div>
          </div>

          <div class="card-diff">
            <span>증감액: </span>
            <span class="${p.diff >= 0 ? 'text-emerald' : 'text-red'} bold">
              ${p.diff >= 0 ? '+' : ''}${DashboardCharts.formatAmount(p.diff)}
            </span>
          </div>

          <div class="card-details">
            <p>${p.details || '상세 내용 없음'}</p>
          </div>
        </div>
      `).join('');
    }
  },

  selectSector(area) {
    this.state.selectedSector = area;
    this.renderSectorTab();
  },

  selectSectorAndGo(area) {
    this.state.selectedSector = area;
    this.switchTab('sector');
  },

  /**
   * 3. 신규사업 전용관 탭 렌더링
   */
  renderNewProjectsTab() {
    const newProjects = this.state.dataset.filter(item => item.isNew);
    const totalNewBudget = newProjects.reduce((a, b) => a + b.yCurr, 0);

    this.setText('newTabCount', `${newProjects.length}개 사업`);
    this.setText('newTabBudget', DashboardCharts.formatAmount(totalNewBudget));

    // 차트 렌더링
    DashboardCharts.renderNewProjectsRank('chartNewProjectsRank', newProjects);
    DashboardCharts.renderNewProjectsArea('chartNewProjectsArea', newProjects);

    // 신규사업 카드 그리드 렌더링
    const grid = document.getElementById('newProjectsGrid');
    if (grid) {
      grid.innerHTML = newProjects.map(p => `
        <div class="new-project-card" onclick="App.showDetailModalById(${p.id})">
          <div class="card-badge-row">
            <span class="area-tag">${p.areaClean}</span>
            <span class="badge-new">신규 (NEW)</span>
          </div>
          <h3 class="card-title">${p.name}</h3>
          
          <div class="new-budget-box">
            <span class="label">2027년 신규 편성 예산</span>
            <span class="amount">${DashboardCharts.formatAmount(p.yCurr)}</span>
          </div>

          <div class="new-card-body">
            <div class="quote-box">
              <div class="quote-icon">📝</div>
              <p>${p.details}</p>
            </div>
          </div>

          <div class="card-footer-action">
            <span>상세 근거 보기 ➔</span>
          </div>
        </div>
      `).join('');
    }
  },

  /**
   * 4. 전체 데이터 테이블 탭 렌더링
   */
  renderTableTab() {
    let list = [...this.state.dataset];

    // 분야 필터
    if (this.state.filterSector !== 'ALL') {
      list = list.filter(item => item.area === this.state.filterSector);
    }

    // 사업 유형 필터
    if (this.state.filterType === 'NEW') {
      list = list.filter(item => item.isNew);
    } else if (this.state.filterType === 'EXISTING') {
      list = list.filter(item => !item.isNew);
    }

    // 검색어 필터
    if (this.state.searchQuery) {
      const q = this.state.searchQuery;
      list = list.filter(item => 
        item.name.toLowerCase().includes(q) ||
        item.area.toLowerCase().includes(q) ||
        item.details.toLowerCase().includes(q) ||
        String(item.id).includes(q)
      );
    }

    // 정렬
    const col = this.state.sortColumn;
    const asc = this.state.sortAsc ? 1 : -1;
    list.sort((a, b) => {
      let va = a[col];
      let vb = b[col];
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va || '').localeCompare(String(vb || '')) * asc;
      }
      return ((va || 0) - (vb || 0)) * asc;
    });

    this.setText('tableResultCount', `총 ${list.length}건 검색됨`);

    const tbody = document.getElementById('dataTableBody');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-table">조건에 일치하는 사업 데이터가 없습니다.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(p => `
      <tr class="${p.isNew ? 'row-new' : ''}" onclick="App.showDetailModalById(${p.id})">
        <td class="text-center">${p.id}</td>
        <td><span class="table-area-badge">${p.areaClean}</span></td>
        <td class="bold project-name-cell">
          ${p.name}
          ${p.isNew ? '<span class="badge-new-mini">신규</span>' : ''}
        </td>
        <td class="text-right">${p.yPrev > 0 ? p.yPrev.toLocaleString() : '-'}</td>
        <td class="text-right bold text-blue">${p.yCurr.toLocaleString()}</td>
        <td class="text-right ${p.diff >= 0 ? 'text-emerald' : 'text-red'}">
          ${p.diff >= 0 ? '+' : ''}${p.diff.toLocaleString()}
        </td>
        <td class="text-center">
          ${p.isNew ? '<span class="badge-new">신규</span>' : `<span class="badge-rate-table ${p.diff >= 0 ? 'inc' : 'dec'}">${p.rateDisplay}</span>`}
        </td>
        <td class="table-details-cell" title="${p.details}">${p.details}</td>
      </tr>
    `).join('');
  },

  /**
   * 테이블 컬럼 클릭 정렬
   */
  sortTable(col) {
    if (this.state.sortColumn === col) {
      this.state.sortAsc = !this.state.sortAsc;
    } else {
      this.state.sortColumn = col;
      this.state.sortAsc = true;
    }
    
    // 정렬 화살표 아이콘 업데이트
    document.querySelectorAll('.sortable-th').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.col === col) {
        th.classList.add(this.state.sortAsc ? 'sort-asc' : 'sort-desc');
      }
    });

    this.renderTableTab();
  },

  /**
   * 상세 모달 팝업 열기
   */
  showDetailModalById(id) {
    const item = this.state.dataset.find(p => p.id == id);
    if (!item) return;

    this.setText('modalId', `#${item.id}`);
    this.setText('modalArea', item.area);
    this.setText('modalTitle', item.name);

    const statusBadge = document.getElementById('modalStatusBadge');
    if (statusBadge) {
      statusBadge.className = item.isNew ? 'badge-new' : 'badge-rate inc';
      statusBadge.textContent = item.isNew ? '신규사업' : `증가율: ${item.rateDisplay}`;
    }

    this.setText('modalYPrev', DashboardCharts.formatAmount(item.yPrev));
    this.setText('modalYCurr', DashboardCharts.formatAmount(item.yCurr));
    
    const sign = item.diff >= 0 ? '+' : '';
    this.setText('modalDiff', `${sign}${DashboardCharts.formatAmount(item.diff)}`);
    this.setText('modalRate', item.rateDisplay);
    this.setText('modalUnit', item.unit || '억원');
    this.setText('modalDetails', item.details || '내용이 없습니다.');

    const modal = document.getElementById('detailModal');
    if (modal) modal.classList.add('open');
  },

  closeDetailModal() {
    const modal = document.getElementById('detailModal');
    if (modal) modal.classList.remove('open');
  },

  /**
   * 현재 데이터 내보내기 (CSV / XLSX)
   */
  exportCurrentData(format) {
    const data = this.state.dataset.map(p => ({
      '연번': p.id,
      '분야 (중점영역)': p.area,
      '세부 사업 / 주요 지표': p.name,
      '구분/단위': p.unit,
      '2026년 (A)': p.yPrev,
      '2027년 정부안 (B)': p.yCurr,
      '증감 (B-A)': p.diff,
      '증가율 (%)': p.rateDisplay,
      '핵심 내용 및 보도자료 박스 원문 근거': p.details
    }));

    if (format === 'csv') {
      const headers = Object.keys(data[0]);
      let csv = headers.join(',') + '\n';
      data.forEach(row => {
        csv += headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(',') + '\n';
      });
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      this.downloadBlob(blob, '국방예산_대시보드_데이터.csv');
    } else if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '예산사업내역');
      XLSX.writeFile(wb, '국방예산_대시보드_데이터.xlsx');
    }
  },

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * 토스트 알림 표시
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
};

// DOM 로드 완료 후 실행
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
