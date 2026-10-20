/**
 * Chart.js 기반 시각화 매니저
 * 테마 대응(다크/라이트), 애니메이션, 반응형 리사이즈, 인스턴스 자동 파기 및 재성성
 */
const DashboardCharts = {
  instances: {},

  // 모던 감성 팔레트 (다양한 분야 구분용)
  palette: [
    '#2563EB', // Blue
    '#059669', // Emerald
    '#7C3AED', // Violet
    '#D97706', // Amber
    '#DC2626', // Red
    '#0891B2', // Cyan
    '#4F46E5', // Indigo
    '#DB2777', // Pink
    '#0D9488', // Teal
    '#EA580C'  // Orange
  ],

  /**
   * 차트 공통 옵션 및 테마 색상 획득
   */
  getThemeColors() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      text: isDark ? '#94A3B8' : '#475569',
      heading: isDark ? '#F1F5F9' : '#0F172A',
      grid: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(226, 232, 240, 0.8)',
      tooltipBg: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.96)',
      tooltipBorder: isDark ? '#334155' : '#E2E8F0',
      tooltipText: isDark ? '#F8FAFC' : '#0F172A'
    };
  },

  /**
   * 숫자 포맷 (단위: 억원 포맷)
   */
  formatAmount(val) {
    if (val === undefined || val === null || isNaN(val)) return '0';
    if (Math.abs(val) >= 10000) {
      const jo = Math.floor(val / 10000);
      const rem = Math.round(val % 10000);
      return rem > 0 ? `${jo}조 ${rem.toLocaleString()}억원` : `${jo}조원`;
    }
    return `${val.toLocaleString()}억원`;
  },

  /**
   * 기존 차트 인스턴스 파기
   */
  destroy(key) {
    if (this.instances[key]) {
      this.instances[key].destroy();
      delete this.instances[key];
    }
  },

  /**
   * 1. 분야별 예산 비중 도넛 차트
   */
  renderSectorShare(canvasId, sectorData) {
    this.destroy('sectorShare');
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const theme = this.getThemeColors();
    const labels = sectorData.map(d => d.areaClean);
    const data = sectorData.map(d => d.yCurr);
    const colors = sectorData.map((_, i) => this.palette[i % this.palette.length]);

    this.instances['sectorShare'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: document.documentElement.classList.contains('dark') ? '#1E293B' : '#FFFFFF',
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: theme.text,
              boxWidth: 12,
              padding: 12,
              font: { family: 'Pretendard, system-ui, sans-serif', size: 12 }
            }
          },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (item) => {
                const total = data.reduce((a, b) => a + b, 0);
                const percent = total > 0 ? ((item.raw / total) * 100).toFixed(1) : 0;
                return ` ${DashboardCharts.formatAmount(item.raw)} (${percent}%)`;
              }
            }
          }
        },
        cutout: '62%'
      }
    });
  },

  /**
   * 2. 분야별 전년(2026) vs 당해년도(2027) 예산 비교 그룹 바 차트
   */
  renderSectorCompare(canvasId, sectorData) {
    this.destroy('sectorCompare');
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const theme = this.getThemeColors();
    const labels = sectorData.map(d => d.areaClean);
    const yPrevData = sectorData.map(d => d.yPrev);
    const yCurrData = sectorData.map(d => d.yCurr);

    this.instances['sectorCompare'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '2026년 (A)',
            data: yPrevData,
            backgroundColor: 'rgba(148, 163, 184, 0.65)',
            borderColor: '#94A3B8',
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: '2027년 정부안 (B)',
            data: yCurrData,
            backgroundColor: 'rgba(37, 99, 235, 0.85)',
            borderColor: '#2563EB',
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: theme.text,
              font: { family: 'Pretendard, sans-serif', size: 11 },
              maxRotation: 30,
              minRotation: 0
            }
          },
          y: {
            grid: { color: theme.grid },
            ticks: {
              color: theme.text,
              font: { family: 'Pretendard, sans-serif', size: 11 },
              callback: val => val >= 10000 ? (val / 10000).toFixed(1) + '조' : val.toLocaleString()
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: theme.text, boxWidth: 12, padding: 14 }
          },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (item) => ` ${item.dataset.label}: ${DashboardCharts.formatAmount(item.raw)}`
            }
          }
        }
      }
    });
  },

  /**
   * 3. 분야별 증감액 순위 수평 바 차트
   */
  renderSectorDiffRank(canvasId, sectorData) {
    this.destroy('sectorDiffRank');
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const theme = this.getThemeColors();
    // 증감액 순으로 정렬
    const sorted = [...sectorData].sort((a, b) => b.diff - a.diff);
    const labels = sorted.map(d => d.areaClean);
    const data = sorted.map(d => d.diff);
    const colors = data.map(d => d >= 0 ? 'rgba(5, 150, 105, 0.85)' : 'rgba(220, 38, 38, 0.85)');

    this.instances['sectorDiffRank'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '증감액 (B-A)',
          data,
          backgroundColor: colors,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: theme.grid },
            ticks: {
              color: theme.text,
              callback: val => val >= 10000 ? (val / 10000).toFixed(1) + '조' : val.toLocaleString()
            }
          },
          y: {
            grid: { display: false },
            ticks: { color: theme.text, font: { size: 11 } }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (item) => {
                const diff = item.raw;
                const sign = diff > 0 ? '+' : '';
                return ` 증감액: ${sign}${DashboardCharts.formatAmount(diff)}`;
              }
            }
          }
        }
      }
    });
  },

  /**
   * 4. 기존 vs 신규 사업 예산 비중 차트
   */
  renderNewVsExisting(canvasId, newBudget, existingBudget, newCount, existCount) {
    this.destroy('newVsExisting');
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const theme = this.getThemeColors();

    this.instances['newVsExisting'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: [`신규 사업 (${newCount}개)`, `기존 사업 (${existCount}개)`],
        datasets: [{
          data: [newBudget, existingBudget],
          backgroundColor: ['#10B981', '#3B82F6'],
          borderColor: document.documentElement.classList.contains('dark') ? '#1E293B' : '#FFFFFF',
          borderWidth: 2,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: theme.text, boxWidth: 12, padding: 12 }
          },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (item) => {
                const total = newBudget + existingBudget;
                const pct = total > 0 ? ((item.raw / total) * 100).toFixed(1) : 0;
                return ` ${DashboardCharts.formatAmount(item.raw)} (${pct}%)`;
              }
            }
          }
        },
        cutout: '65%'
      }
    });
  },

  /**
   * 5. 선택 분야 내 세부 사업별 차트
   */
  renderSectorProjects(canvasId, projects) {
    this.destroy('sectorProjects');
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const theme = this.getThemeColors();
    const labels = projects.map(p => p.name.length > 20 ? p.name.slice(0, 19) + '…' : p.name);
    const yPrev = projects.map(p => p.yPrev);
    const yCurr = projects.map(p => p.yCurr);

    this.instances['sectorProjects'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '2026년 (A)',
            data: yPrev,
            backgroundColor: 'rgba(148, 163, 184, 0.65)',
            borderRadius: 4
          },
          {
            label: '2027년 정부안 (B)',
            data: yCurr,
            backgroundColor: 'rgba(79, 70, 229, 0.85)',
            borderRadius: 4
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: theme.grid },
            ticks: {
              color: theme.text,
              callback: val => val >= 10000 ? (val / 10000).toFixed(1) + '조' : val.toLocaleString()
            }
          },
          y: {
            grid: { display: false },
            ticks: { color: theme.text, font: { size: 12 } }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: theme.text, boxWidth: 12 }
          },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              title: (items) => projects[items[0].dataIndex]?.name || '',
              label: (item) => ` ${item.dataset.label}: ${DashboardCharts.formatAmount(item.raw)}`
            }
          }
        }
      }
    });
  },

  /**
   * 6. 신규사업 규모 순위 차트 (Horizontal Bar)
   */
  renderNewProjectsRank(canvasId, newProjects) {
    this.destroy('newProjectsRank');
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const theme = this.getThemeColors();
    const sorted = [...newProjects].sort((a, b) => b.yCurr - a.yCurr);
    const labels = sorted.map(p => p.name.length > 18 ? p.name.slice(0, 17) + '…' : p.name);
    const data = sorted.map(p => p.yCurr);

    this.instances['newProjectsRank'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '2027년 정부안 예산',
          data,
          backgroundColor: 'rgba(16, 185, 129, 0.85)',
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: theme.grid },
            ticks: {
              color: theme.text,
              callback: val => val.toLocaleString() + '억'
            }
          },
          y: {
            grid: { display: false },
            ticks: { color: theme.text, font: { size: 12 } }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              title: (items) => sorted[items[0].dataIndex]?.name || '',
              label: (item) => ` 2027년 예산: ${DashboardCharts.formatAmount(item.raw)}`
            }
          }
        }
      }
    });
  },

  /**
   * 7. 신규사업 분야별 분포 차트
   */
  renderNewProjectsArea(canvasId, newProjects) {
    this.destroy('newProjectsArea');
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const theme = this.getThemeColors();
    // 분야별 집계
    const areaMap = {};
    newProjects.forEach(p => {
      const area = p.areaClean;
      areaMap[area] = (areaMap[area] || 0) + p.yCurr;
    });

    const labels = Object.keys(areaMap);
    const data = labels.map(k => areaMap[k]);
    const colors = labels.map((_, i) => this.palette[i % this.palette.length]);

    this.instances['newProjectsArea'] = new Chart(ctx, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: document.documentElement.classList.contains('dark') ? '#1E293B' : '#FFFFFF',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: theme.text,
              boxWidth: 12,
              padding: 10,
              font: { size: 11 }
            }
          },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (item) => {
                const total = data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((item.raw / total) * 100).toFixed(1) : 0;
                return ` ${DashboardCharts.formatAmount(item.raw)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  },

  /**
   * 테마 변경 시 모든 차트 갱신
   */
  updateTheme() {
    Object.values(this.instances).forEach(chart => {
      if (chart) chart.update();
    });
  }
};
