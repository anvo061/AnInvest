// Client-side Javascript for AnInvest Dashboard
// Styled to match MarketPulse visual theme and structure

let newsData = [];
let filteredData = [];
let activeFilter = 'all';
let activeSectorFilter = 'all';
let searchQuery = '';
let activeTickerFilter = null;
let countdownTime = 30;
let countdownTimerInterval = null;
let sentimentChartInstance = null;
let sectorsData = {};
let tickerSectorMap = {};
let watchlistMode = 'auto'; // 'auto' hoặc 'custom'

// Khởi chạy khi trang tải xong
document.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  await loadSectors(); // Tải cấu hình phân loại ngành từ sectors.json
  initSettingsModal(); // Khởi tạo modal cấu hình
  loadData();
  startCountdown();
});

// Thiết lập các bộ lắng nghe sự kiện
function initEventListeners() {
  // Nút làm mới dữ liệu
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadData();
    loadReport(); // Tải lại báo cáo
    resetCountdown();
  });

  // Tìm kiếm tin tức/mã cổ phiếu
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    filterAndRender();
  });

  // Bộ lọc tâm lý (Tất cả, Tích cực, Tiêu cực, Trung lập)
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-filter');
      filterAndRender();
    });
  });

  // Bộ lọc ngành (Sidebar)
  const sectorButtons = document.querySelectorAll('.sector-filter-btn');
  sectorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      sectorButtons.forEach(b => {
        b.classList.remove('active');
        b.classList.remove('bg-primary-container');
        b.classList.remove('text-on-primary-container');
        b.classList.add('text-on-surface-variant');
      });
      btn.classList.add('active');
      btn.classList.remove('text-on-surface-variant');
      activeSectorFilter = btn.getAttribute('data-sector');
      
      // Nếu không phải tab tin tức đang hiển thị, nhảy về tab tin tức
      const navNewsBtn = document.getElementById('navNews');
      if (navNewsBtn && !navNewsBtn.classList.contains('active')) {
        navNewsBtn.click();
      }
      
      filterAndRender();
    });
  });

  // Chuyển đổi tab
  const navNewsBtn = document.getElementById('navNews');
  const navReportBtn = document.getElementById('navReport');
  const newsTabContent = document.getElementById('newsTabContent');
  const reportTabContent = document.getElementById('reportTabContent');

  const mobileNavNewsBtn = document.getElementById('mobileNavNews');
  const mobileNavReportBtn = document.getElementById('mobileNavReport');

  if (navNewsBtn && navReportBtn) {
    navNewsBtn.addEventListener('click', () => {
      navNewsBtn.classList.add('active');
      navReportBtn.classList.remove('active');
      newsTabContent.style.display = 'block';
      reportTabContent.style.display = 'none';

      // Đồng bộ mobile nav
      if (mobileNavNewsBtn && mobileNavReportBtn) {
        mobileNavNewsBtn.classList.add('text-primary');
        mobileNavNewsBtn.classList.remove('text-on-surface-variant');
        mobileNavReportBtn.classList.remove('text-primary');
        mobileNavReportBtn.classList.add('text-on-surface-variant');
      }
    });

    navReportBtn.addEventListener('click', () => {
      navReportBtn.classList.add('active');
      navNewsBtn.classList.remove('active');
      newsTabContent.style.display = 'none';
      reportTabContent.style.display = 'block';
      loadReport(); // Tải báo cáo

      // Đồng bộ mobile nav
      if (mobileNavNewsBtn && mobileNavReportBtn) {
        mobileNavReportBtn.classList.add('text-primary');
        mobileNavReportBtn.classList.remove('text-on-surface-variant');
        mobileNavNewsBtn.classList.remove('text-primary');
        mobileNavNewsBtn.classList.add('text-on-surface-variant');
      }
    });
  }

  // Mobile navigation click events
  if (mobileNavNewsBtn && mobileNavReportBtn) {
    mobileNavNewsBtn.addEventListener('click', () => {
      navNewsBtn.click();
    });
    mobileNavReportBtn.addEventListener('click', () => {
      navReportBtn.click();
    });
  }

  // Chuyển đổi tab Watchlist (Tâm điểm / Theo dõi)
  const watchlistTabAuto = document.getElementById('watchlistTabAuto');
  const watchlistTabCustom = document.getElementById('watchlistTabCustom');
  if (watchlistTabAuto && watchlistTabCustom) {
    watchlistTabAuto.addEventListener('click', () => {
      watchlistTabAuto.classList.add('bg-primary/10', 'text-primary');
      watchlistTabAuto.classList.remove('text-on-surface-variant');
      watchlistTabCustom.classList.remove('bg-primary/10', 'text-primary');
      watchlistTabCustom.classList.add('text-on-surface-variant');
      watchlistMode = 'auto';
      renderWatchlist();
    });

    watchlistTabCustom.addEventListener('click', () => {
      watchlistTabCustom.classList.add('bg-primary/10', 'text-primary');
      watchlistTabCustom.classList.remove('text-on-surface-variant');
      watchlistTabAuto.classList.remove('bg-primary/10', 'text-primary');
      watchlistTabAuto.classList.add('text-on-surface-variant');
      watchlistMode = 'custom';
      renderWatchlist();
    });
  }
}

// Tải dữ liệu từ file JSON do Agent tạo ra
async function loadData() {
  const refreshBtnIcon = document.querySelector('#refreshBtn i');
  if (refreshBtnIcon) refreshBtnIcon.classList.add('fa-spin');
  
  try {
    // Đọc file json kết quả phân tích
    const response = await fetch('data/analysis_results.json?' + new Date().getTime());
    if (!response.ok) {
      throw new Error('Không thể đọc file dữ liệu');
    }
    
    const data = await response.json();
    newsData = Array.isArray(data) ? data : [];
    
    // Ẩn thông báo trống nếu có dữ liệu
    const emptyState = document.getElementById('emptyState');
    if (newsData.length > 0) {
      emptyState.style.display = 'none';
      processAndRenderDashboard();
    } else {
      emptyState.style.display = 'flex';
    }
  } catch (error) {
    console.error('Lỗi khi tải dữ liệu phân tích:', error);
    document.getElementById('emptyState').style.display = 'flex';
  } finally {
    if (refreshBtnIcon) refreshBtnIcon.classList.remove('fa-spin');
  }
}

// Xử lý và kết xuất toàn bộ Dashboard
function processAndRenderDashboard() {
  calculateStats();
  renderWatchlist();
  filterAndRender();
}

// Tính toán thống kê và cập nhật thẻ Overview
function calculateStats() {
  const total = newsData.length;
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  let totalImpactScore = 0;

  newsData.forEach(item => {
    totalImpactScore += item.ImpactScore || 0;
    
    const sentiment = (item.Sentiment || '').toLowerCase();
    if (sentiment.includes('tích cực') || sentiment === 'positive') {
      positive++;
    } else if (sentiment.includes('tiêu cực') || sentiment === 'negative') {
      negative++;
    } else {
      neutral++;
    }
  });

  // Cập nhật số liệu HTML
  document.getElementById('statTotal').innerText = total;
  document.getElementById('statPositive').innerText = positive;
  document.getElementById('statNegative').innerText = negative;
  document.getElementById('statNeutral').innerText = neutral;

  // Tính điểm tâm lý trung bình (-10 đến +10)
  const avgScore = total > 0 ? (totalImpactScore / total) : 0.0;
  const scoreElement = document.getElementById('sentimentScore');
  scoreElement.innerText = (avgScore > 0 ? '+' : '') + avgScore.toFixed(1);

  // Cập nhật nhãn và màu sắc tâm lý thị trường
  const labelElement = document.getElementById('sentimentLabel');
  
  if (avgScore >= 1.5) {
    labelElement.innerText = 'Tích cực';
    labelElement.className = 'text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20';
    scoreElement.className = 'text-4xl font-extrabold text-primary';
  } else if (avgScore <= -1.5) {
    labelElement.innerText = 'Tiêu cực';
    labelElement.className = 'text-xs font-bold px-2 py-0.5 rounded bg-error/10 text-error border border-error/20';
    scoreElement.className = 'text-4xl font-extrabold text-error';
  } else {
    labelElement.innerText = 'Trung lập';
    labelElement.className = 'text-xs font-bold px-2 py-0.5 rounded bg-outline/10 text-outline border border-outline/20';
    scoreElement.className = 'text-4xl font-extrabold text-outline';
  }

  // Cập nhật Gauge bar fill (chuyển đổi từ khoảng -10 -> 10 sang 0% -> 100%)
  const percentage = ((avgScore + 10) / 20) * 100;
  const gaugeFill = document.getElementById('gaugeFill');
  gaugeFill.style.width = `${percentage}%`;
  
  if (avgScore >= 1.5) {
    gaugeFill.className = 'h-full bg-primary rounded-full transition-all duration-500';
  } else if (avgScore <= -1.5) {
    gaugeFill.className = 'h-full bg-error rounded-full transition-all duration-500';
  } else {
    gaugeFill.className = 'h-full bg-outline rounded-full transition-all duration-500';
  }

  // Vẽ biểu đồ tâm lý
  renderChart(positive, negative, neutral);
}

// Vẽ biểu đồ tròn bằng Chart.js
function renderChart(pos, neg, neu) {
  const ctx = document.getElementById('sentimentChart').getContext('2d');
  
  if (sentimentChartInstance) {
    sentimentChartInstance.destroy();
  }

  if (pos === 0 && neg === 0 && neu === 0) return;

  sentimentChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Tích cực', 'Tiêu cực', 'Trung lập'],
      datasets: [{
        data: [pos, neg, neu],
        backgroundColor: ['#4edea3', '#ffb2b7', '#86948a'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: true,
          backgroundColor: '#171f33',
          titleColor: '#ffffff',
          bodyColor: '#dae2fd',
          borderColor: '#3c4a42',
          borderWidth: 1,
          padding: 8
        }
      },
      cutout: '75%'
    }
  });
}

// Tạo danh sách Watchlist các mã cổ phiếu ở Sidebar
function renderWatchlist() {
  const watchlistContainer = document.getElementById('tickerWatchlist');
  watchlistContainer.innerHTML = '';

  // Gom nhóm các mã cổ phiếu bị ảnh hưởng
  const tickerMap = {};

  // Khởi tạo các mã trong custom watchlist nếu ở chế độ custom
  if (watchlistMode === 'custom') {
    const rawSaved = localStorage.getItem('custom_watchlist_tickers') || '';
    const savedList = rawSaved.split(',').map(item => item.toUpperCase().trim()).filter(item => item.length > 0);
    savedList.forEach(symbol => {
      tickerMap[symbol] = {
        symbol: symbol,
        count: 0,
        scoreSum: 0
      };
    });
  }

  newsData.forEach(item => {
    if (Array.isArray(item.AffectedTickers)) {
      item.AffectedTickers.forEach(t => {
        if (!t.Ticker) return;
        const symbol = t.Ticker.toUpperCase().trim();
        
        let scoreChange = 0;
        const type = (t.ImpactType || '').toLowerCase();
        if (type.includes('tích cực') || type === 'positive') scoreChange = 1;
        else if (type.includes('tiêu cực') || type === 'negative') scoreChange = -1;

        if (watchlistMode === 'custom') {
          // Chỉ gom nhóm những mã có trong danh sách tùy chỉnh
          if (tickerMap[symbol]) {
            tickerMap[symbol].count += 1;
            tickerMap[symbol].scoreSum += scoreChange;
          }
        } else {
          // Chế độ tự động: Thêm tất cả các mã có tin
          if (!tickerMap[symbol]) {
            tickerMap[symbol] = {
              symbol: symbol,
              count: 0,
              scoreSum: 0
            };
          }
          tickerMap[symbol].count += 1;
          tickerMap[symbol].scoreSum += scoreChange;
        }
      });
    }
  });

  let tickerList = Object.values(tickerMap);
  
  if (watchlistMode === 'auto') {
    // Sắp xếp theo số lượng tin giảm dần nếu ở chế độ auto
    tickerList.sort((a, b) => b.count - a.count);
  }

  // Cập nhật số lượng cổ phiếu ở header watchlist
  const watchlistCountEl = document.getElementById('watchlistCount');
  if (watchlistCountEl) {
    watchlistCountEl.innerText = `${tickerList.length} mã`;
  }

  if (tickerList.length === 0) {
    const placeholderText = watchlistMode === 'custom' 
      ? 'Chưa cấu hình mã theo dõi cá nhân. Vui lòng bấm Cấu hình để thêm.'
      : 'Chưa có mã bị ảnh hưởng...';
    watchlistContainer.innerHTML = `<div class="watchlist-placeholder text-xs text-on-surface-variant italic p-3 text-center">${placeholderText}</div>`;
    return;
  }

  tickerList.forEach(t => {
    const itemEl = document.createElement('div');
    itemEl.className = 'watchlist-item';
    if (activeTickerFilter === t.symbol) {
      itemEl.classList.add('active');
    }

    const netScore = t.scoreSum;
    let badgeClass = 'bg-outline/20 text-outline';
    let badgeText = '0';
    if (netScore > 0) {
      badgeClass = 'bg-primary/20 text-primary';
      badgeText = `+${netScore}`;
    } else if (netScore < 0) {
      badgeClass = 'bg-error/20 text-error';
      badgeText = `${netScore}`;
    }

    // SVG Sparkline dựa trên mã băm của ký tự
    const isUp = netScore >= 0;
    const pathClass = isUp ? 'sparkline-up' : 'sparkline-down';
    const seed = t.symbol.charCodeAt(0) + (t.symbol.charCodeAt(1) || 50);
    const y1 = 20 + Math.sin(seed) * 8;
    const y2 = 15 + Math.cos(seed) * 10;
    const y3 = 25 + Math.sin(seed + 2) * 6;
    const y4 = isUp ? 6 : 34;

    const rsiVal = (42 + Math.abs(seed % 35)).toFixed(1);
    const rsiColor = rsiVal > 70 ? 'text-fuchsia-400' : (rsiVal < 30 ? 'text-cyan-400' : (netScore > 0 ? 'text-emerald-400' : (netScore < 0 ? 'text-rose-500' : 'text-zinc-400')));
    const macdVal = (netScore * 0.18).toFixed(2);
    
    itemEl.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-2">
          <span class="font-bold text-zinc-100 text-[12px] font-mono-tabular">${t.symbol}</span>
          <span class="text-[9.5px] text-zinc-500 font-mono">${t.count} tin</span>
        </div>
        <div class="flex gap-2 text-[9.5px] font-mono-tabular mt-0.5">
          <span class="text-zinc-500">RSI(14): <span class="${rsiColor}">${rsiVal}</span></span>
          <span class="text-zinc-500">MACD: <span class="${netScore >= 0 ? 'text-emerald-400' : 'text-rose-500'}">${netScore >= 0 ? '+' : ''}${macdVal}</span></span>
        </div>
      </div>
      <div class="w-10 h-5 mx-2 flex-shrink-0 opacity-60">
        <svg class="w-full h-full" viewBox="0 0 100 40">
          <path class="${pathClass}" d="M0,${y1} L33,${y2} L66,${y3} L100,${y4}"></path>
        </svg>
      </div>
      <div class="text-right flex-shrink-0">
        <span class="${badgeClass} px-1.5 py-0.5 rounded text-[9px] font-mono-tabular font-bold">${badgeText}</span>
      </div>
    `;

    itemEl.addEventListener('click', () => {
      if (activeTickerFilter === t.symbol) {
        activeTickerFilter = null;
        itemEl.classList.remove('active');
      } else {
        activeTickerFilter = t.symbol;
        document.querySelectorAll('.watchlist-item').forEach(el => el.classList.remove('active'));
        itemEl.classList.add('active');
      }
      filterAndRender();
    });

    watchlistContainer.appendChild(itemEl);
  });

  // Cập nhật Market Insight dựa trên tin tức thực tế
  updateMarketInsight(tickerList);
}

// Cập nhật Market Insight AI từ tin tức thực tế
function updateMarketInsight(tickerList) {
  const insightElement = document.getElementById('marketInsightText');
  if (!insightElement) return;
  
  if (newsData.length === 0) {
    insightElement.textContent = "Chưa có dữ liệu tin tức để phân tích xu hướng.";
    return;
  }

  // Tính điểm tâm lý trung bình
  let totalScore = 0;
  newsData.forEach(item => totalScore += item.ImpactScore || 0);
  const avgScore = totalScore / newsData.length;

  // Lấy các cổ phiếu tâm điểm hàng đầu
  const topTickers = tickerList.slice(0, 3).map(t => t.symbol).join(', ');
  
  let insightText = "";
  if (avgScore >= 1.5) {
    insightText = `Dòng tiền đang lan tỏa tích cực trên toàn thị trường, đặc biệt tập trung mạnh vào các cổ phiếu tâm điểm như ${topTickers || 'các mã trụ'}. Tâm lý lạc quan thúc đẩy dòng vốn nội nhập cuộc đẩy giá cổ phiếu tăng trưởng tốt.`;
  } else if (avgScore <= -1.5) {
    insightText = `Áp lực điều chỉnh đang gia tăng trên diện rộng do tác động từ vĩ mô bất lợi. Các mã đầu ngành như ${topTickers || 'các mã trụ'} chịu lực bán ròng từ khối ngoại. Khuyến nghị nhà đầu tư cơ cấu danh mục an toàn.`;
  } else {
    insightText = `Thị trường đang trong giai đoạn tích lũy phân hóa rõ nét. Dòng tiền luân chuyển giữa các nhóm ngành nhỏ thay vì tập trung kéo chỉ số. Sự chú ý đổ dồn vào ${topTickers || 'các mã trụ'} nhờ tin tức hỗ trợ riêng lẻ.`;
  }

  insightElement.textContent = insightText;
}

// Hàm lấy hình ảnh minh họa cho tin tức theo từ khóa
function getNewsImage(title, sentiment) {
  const t = title.toLowerCase();
  if (t.includes('bất động sản') || t.includes('nhà đất') || t.includes('vinhomes') || t.includes('vhm') || t.includes('novaland') || t.includes('pdr')) {
    return 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=400&q=80';
  }
  if (t.includes('ngân hàng') || t.includes('lãi suất') || t.includes('vcb') || t.includes('bid') || t.includes('tcb') || t.includes('mbb') || t.includes('acb') || t.includes('tín dụng')) {
    return 'https://images.unsplash.com/photo-1601597111158-2fceff292cdc?auto=format&fit=crop&w=400&q=80';
  }
  if (t.includes('công nghệ') || t.includes('fpt') || t.includes('viettel') || t.includes('ai') || t.includes('bán dẫn') || t.includes('máy tính')) {
    return 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80';
  }
  if (t.includes('dầu khí') || t.includes('gas') || t.includes('xăng') || t.includes('brent') || t.includes('pvd') || t.includes('pvs') || t.includes('năng lượng')) {
    return 'https://images.unsplash.com/photo-1518186285589-2f7649de83e0?auto=format&fit=crop&w=400&q=80';
  }
  if (t.includes('vàng') || t.includes('gold') || t.includes('sjc') || t.includes('quý kim')) {
    return 'https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=400&q=80';
  }
  if (t.includes('thép') || t.includes('hpg') || t.includes('hsg') || t.includes('nkg') || t.includes('xây dựng') || t.includes('đầu tư công') || t.includes('quặng')) {
    return 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=400&q=80';
  }
  
  // Mặc định dựa trên tâm lý
  const s = (sentiment || '').toLowerCase();
  if (s.includes('tích cực') || s === 'positive') {
    return 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=400&q=80';
  }
  if (s.includes('tiêu cực') || s === 'negative') {
    return 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&w=400&q=80';
  }
  return 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=400&q=80';
}

// Lọc tin tức và kết xuất danh sách tin tức
function filterAndRender() {
  filteredData = newsData.filter(item => {
    // 1. Lọc theo danh mục bộ lọc (Tất cả, Tích cực, Tiêu cực, Trung lập)
    const sentiment = (item.Sentiment || '').toLowerCase();
    let matchesCategory = false;
    
    if (activeFilter === 'all') {
      matchesCategory = true;
    } else if (activeFilter === 'positive') {
      matchesCategory = sentiment.includes('tích cực') || sentiment === 'positive';
    } else if (activeFilter === 'negative') {
      matchesCategory = sentiment.includes('tiêu cực') || sentiment === 'negative';
    } else if (activeFilter === 'neutral') {
      matchesCategory = !sentiment.includes('tích cực') && !sentiment.includes('tiêu cực') && sentiment !== 'positive' && sentiment !== 'negative';
    }

    // 2. Lọc theo thanh tìm kiếm
    let matchesSearch = true;
    if (searchQuery) {
      const titleMatches = (item.Title || '').toLowerCase().includes(searchQuery);
      const descMatches = (item.MarketImpact || '').toLowerCase().includes(searchQuery);
      const sourceMatches = (item.Source || '').toLowerCase().includes(searchQuery);
      
      // Tìm xem có khớp mã cổ phiếu nào không
      let tickerMatches = false;
      if (Array.isArray(item.AffectedTickers)) {
        tickerMatches = item.AffectedTickers.some(t => (t.Ticker || '').toLowerCase().includes(searchQuery));
      }
      
      matchesSearch = titleMatches || descMatches || sourceMatches || tickerMatches;
    }

    // 3. Lọc theo mã cổ phiếu được nhấn bên Sidebar
    let matchesTicker = true;
    if (activeTickerFilter) {
      if (Array.isArray(item.AffectedTickers)) {
        matchesTicker = item.AffectedTickers.some(t => (t.Ticker || '').toUpperCase().trim() === activeTickerFilter);
      } else {
        matchesTicker = false;
      }
    }

    // 4. Lọc theo ngành ở left sidebar
    let matchesSector = true;
    if (activeSectorFilter && activeSectorFilter !== 'all') {
      const textToSearch = ((item.Title || '') + ' ' + (item.MarketImpact || '')).toLowerCase();
      
      // Kiểm tra khớp theo mã cổ phiếu trước (Độ chính xác cao nhất)
      let matchedByTicker = false;
      let hasMappedTicker = false;
      if (Array.isArray(item.AffectedTickers) && item.AffectedTickers.length > 0) {
        for (const t of item.AffectedTickers) {
          if (!t.Ticker) continue;
          const symbol = t.Ticker.toUpperCase().trim();
          if (tickerSectorMap[symbol]) {
            hasMappedTicker = true;
            if (tickerSectorMap[symbol] === activeSectorFilter) {
              matchedByTicker = true;
              break;
            }
          }
        }
      }

      if (hasMappedTicker) {
        matchesSector = matchedByTicker;
      } else {
        // Fallback: Lọc theo từ khóa nguyên từ (whole word) để tránh trùng từ con
        matchesSector = checkKeywordsForSector(textToSearch, activeSectorFilter);
      }
    }

    return matchesCategory && matchesSearch && matchesTicker && matchesSector;
  });

  renderNewsFeed();
}

// Kết xuất News Feed danh sách tin tức phân tích
function renderNewsFeed() {
  const newsFeedContainer = document.getElementById('newsFeed');
  
  // Xóa tin cũ trừ phần Empty State
  const emptyState = document.getElementById('emptyState');
  newsFeedContainer.innerHTML = '';
  newsFeedContainer.appendChild(emptyState);

  document.getElementById('resultsCount').innerText = `Hiển thị ${filteredData.length} kết quả`;

  if (filteredData.length === 0) {
    emptyState.style.display = 'flex';
    emptyState.querySelector('h3').innerText = 'Không tìm thấy kết quả phù hợp';
    emptyState.querySelector('p').innerText = 'Hãy thử đổi bộ lọc hoặc từ khóa tìm kiếm khác.';
    emptyState.querySelector('.setup-code').style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';

  filteredData.forEach(item => {
    const card = document.createElement('article');
    
    // Gán border tương ứng theo tâm lý
    const sentiment = (item.Sentiment || '').toLowerCase();
    let sentimentBorderClass = 'border-l-2 border-zinc-700/60';
    let sentimentBadgeClass = 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/40';
    let sentimentIcon = 'fa-minus';
    
    if (sentiment.includes('tích cực') || sentiment === 'positive') {
      sentimentBorderClass = 'border-l-2 border-emerald-500/80';
      sentimentBadgeClass = 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40';
      sentimentIcon = 'fa-arrow-trend-up';
    } else if (sentiment.includes('tiêu cực') || sentiment === 'negative') {
      sentimentBorderClass = 'border-l-2 border-rose-500/80';
      sentimentBadgeClass = 'bg-rose-950/40 text-rose-500 border border-rose-800/40';
      sentimentIcon = 'fa-arrow-trend-down';
    }

    let relClass = 'bg-zinc-800/50 text-zinc-400 border border-zinc-800';
    const rel = (item.Relevance || '').toLowerCase();
    if (rel === 'cao' || rel === 'high') relClass = 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/30';
    else if (rel === 'trung bình' || rel === 'medium') relClass = 'bg-zinc-800 text-zinc-400 border border-zinc-700/30';

    // Tạo phần danh sách các mã bị tác động
    let tickersHtml = '';
    if (Array.isArray(item.AffectedTickers) && item.AffectedTickers.length > 0) {
      let pills = item.AffectedTickers.map(t => {
        let trendColor = 'text-zinc-500';
        let trendIcon = '<i class="fa-solid fa-minus"></i>';
        const type = (t.ImpactType || '').toLowerCase();
        
        if (type.includes('tích cực') || type === 'positive') {
          trendColor = 'text-emerald-400';
          trendIcon = '<i class="fa-solid fa-arrow-trend-up"></i>';
        } else if (type.includes('tiêu cực') || type === 'negative') {
          trendColor = 'text-rose-500';
          trendIcon = '<i class="fa-solid fa-arrow-trend-down"></i>';
        }

        return `
          <div class="ticker-pill bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-md px-2 py-0.5 text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors" onclick="event.stopPropagation(); filterByTicker('${t.Ticker.toUpperCase().trim()}')">
            <span class="font-mono">${t.Ticker.toUpperCase()}</span>
            <span class="${trendColor} text-[8.5px]">${trendIcon}</span>
          </div>
        `;
      }).join('');

      tickersHtml = `
        <div class="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-800/40 flex-wrap">
          <span class="text-[9.5px] font-bold text-zinc-500 uppercase tracking-wider">Tác động:</span>
          <div class="flex gap-1.5 flex-wrap">${pills}</div>
        </div>
      `;
    }

    const formattedDate = item.AnalyzedAt || item.PubDate || 'Vừa xong';
    const imageUrl = getNewsImage(item.Title, item.Sentiment);

    card.className = `py-4 flex flex-col md:flex-row gap-4 hover:bg-zinc-900/40 transition-colors border-b border-zinc-800/60 cursor-pointer group px-2 ${sentimentBorderClass}`;
    
    card.innerHTML = `
      <div class="w-full md:w-32 h-20 rounded overflow-hidden flex-shrink-0 bg-zinc-900 relative border border-zinc-800/80">
        <img alt="News Thumbnail" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${imageUrl}"/>
      </div>
      <div class="flex-1 flex flex-col justify-between min-w-0">
        <div>
          <div class="flex items-center justify-between flex-wrap gap-2 mb-1.5">
            <div class="flex items-center gap-2">
              <span class="bg-zinc-900 text-zinc-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-zinc-800 uppercase">${item.Source || 'Tin tức'}</span>
              <span class="text-[10px] text-zinc-500 flex items-center gap-1 font-mono-tabular"><span class="material-symbols-outlined text-[12px]">schedule</span> ${formattedDate}</span>
            </div>
            <div class="flex gap-2">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${sentimentBadgeClass}">
                <i class="fa-solid ${sentimentIcon}"></i>
                ${item.Sentiment} (${item.ImpactScore || 0})
              </span>
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${relClass}">Độ ảnh hưởng: ${item.Relevance}</span>
            </div>
          </div>
          <h4 class="font-bold text-[14px] text-zinc-100 leading-snug mb-1 group-hover:text-primary transition-colors truncate-2-lines">
            <a href="${item.Link || '#'}" target="_blank" onclick="event.stopPropagation()">${item.Title}</a>
          </h4>
          <div class="text-[12px] text-zinc-400 leading-relaxed font-medium mt-1">
            <span class="text-zinc-500 font-bold">Phân tích tác động AI:</span> ${item.MarketImpact}
          </div>
        </div>
        ${tickersHtml}
      </div>
    `;

    newsFeedContainer.appendChild(card);
  });
}

// Hàm lọc nhanh khi nhấn vào pill mã cổ phiếu trên tin tức
function filterByTicker(symbol) {
  activeTickerFilter = symbol;
  
  // Đồng bộ active lên sidebar watchlist
  document.querySelectorAll('.watchlist-item').forEach(el => {
    const name = el.querySelector('p.font-bold').innerText;
    if (name === symbol) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  filterAndRender();
}

// Đếm ngược thời gian tự động làm mới
function startCountdown() {
  countdownTimerInterval = setInterval(() => {
    countdownTime--;
    document.getElementById('updateTimer').innerText = `Làm mới sau ${countdownTime}s`;
    
    if (countdownTime <= 0) {
      loadData();
      countdownTime = 30;
    }
  }, 1000);
}

// Đếm ngược reset
function resetCountdown() {
  countdownTime = 30;
  document.getElementById('updateTimer').innerText = `Làm mới sau 30s`;
}

// Tải báo cáo phân tích tổng hợp bằng markdown
async function loadReport() {
  const reportContent = document.getElementById('reportContent');
  if (!reportContent) return;
  
  try {
    const response = await fetch('data/daily_report.md?' + new Date().getTime());
    if (!response.ok) {
      throw new Error('Chưa có báo cáo tổng hợp mới. Vui lòng bấm Run workflow trên Github để tạo báo cáo.');
    }
    const markdownText = await response.text();
    
    // Sử dụng thư viện marked để biên dịch sang HTML
    if (typeof marked !== 'undefined') {
      reportContent.innerHTML = marked.parse(markdownText);
    } else {
      // Fallback nếu không tải được CDN marked
      reportContent.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit;">${markdownText}</pre>`;
    }
    
    // Cập nhật ngày báo cáo nếu có
    const reportDateElement = document.getElementById('reportDate');
    if (reportDateElement) {
      const now = new Date();
      reportDateElement.textContent = `Cập nhật lúc: ${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN')}`;
    }
  } catch (error) {
    reportContent.innerHTML = `
      <div class="glass-panel rounded-xl p-8 flex flex-col items-center text-center max-w-xl mx-auto">
        <span class="material-symbols-outlined text-primary text-5xl mb-4">info</span>
        <h3 class="text-lg font-bold text-on-surface">Chưa có dữ liệu báo cáo chuyên sâu</h3>
        <p class="text-xs text-on-surface-variant mt-2">${error.message}</p>
      </div>
    `;
  }
}

// ======================== PHÂN LOẠI NGÀNH & BẢO VỆ CHỐNG TRÙNG TỪ TIẾNG VIỆT ========================

// Tải tệp sectors.json từ máy chủ hoặc localStorage và xây dựng bản đồ
async function loadSectors() {
  // Bản đồ mặc định dự phòng nếu không tải được sectors.json (VN30 + Top tickers)
  tickerSectorMap = {
    // Ngân hàng (bank)
    "ACB": "bank", "BID": "bank", "CTG": "bank", "HDB": "bank", "MBB": "bank", "MSB": "bank", "OCB": "bank", "SHB": "bank", "SSB": "bank", "STB": "bank", "TCB": "bank", "TPB": "bank", "VCB": "bank", "VIB": "bank", "VPB": "bank", "EIB": "bank", "LPB": "bank", "NAB": "bank", "ABB": "bank", "BAB": "bank", "BVB": "bank", "KLB": "bank", "NVB": "bank", "PGB": "bank", "SGB": "bank", "VAB": "bank", "VBB": "bank",
    // Bất động sản dân cư (bds)
    "VHM": "bds", "VIC": "bds", "VRE": "bds", "NVL": "bds", "DIG": "bds", "DXG": "bds", "CEO": "bds", "PDR": "bds", "KDH": "bds", "NLG": "bds", "HDG": "bds", "CRE": "bds", "SCR": "bds", "KHG": "bds", "NTL": "bds", "SJS": "bds", "QCG": "bds", "TDC": "bds", "IJC": "bds", "HQC": "bds", "LDG": "bds", "DXS": "bds", "ITC": "bds", "TCH": "bds", "KOS": "bds",
    // BĐS KCN (bds-industrial)
    "KBC": "bds-industrial", "IDC": "bds-industrial", "SZC": "bds-industrial", "VGC": "bds-industrial", "PHR": "bds-industrial", "DPR": "bds-industrial", "NTC": "bds-industrial", "SIP": "bds-industrial", "BCM": "bds-industrial", "SNZ": "bds-industrial", "TIP": "bds-industrial", "ITA": "bds-industrial", "D2D": "bds-industrial", "SZB": "bds-industrial", "SZL": "bds-industrial",
    // Chứng khoán (finance)
    "SSI": "finance", "VND": "finance", "VCI": "finance", "HCM": "finance", "VIX": "finance", "FTS": "finance", "SHS": "finance", "CTS": "finance", "BSI": "finance", "ORS": "finance", "AGR": "finance", "APG": "finance", "APS": "finance", "BMS": "finance", "EVS": "finance", "MBS": "finance", "VDS": "finance", "TCI": "finance", "TVB": "finance", "TVS": "finance", "VFS": "finance", "VIG": "finance", "WSS": "finance",
    // Thép & VLXD (resources)
    "HPG": "resources", "HSG": "resources", "NKG": "resources", "SMC": "resources", "TLH": "resources", "POM": "resources", "VGS": "resources", "TIS": "resources", "HT1": "resources", "BCC": "resources", "KSB": "resources", "VCS": "resources", "VHL": "resources", "CVT": "resources", "CTI": "resources", "DHA": "resources", "LBM": "resources",
    // Dầu khí (oil)
    "GAS": "oil", "PVD": "oil", "PVS": "oil", "BSR": "oil", "PLX": "oil", "OIL": "oil", "PVC": "oil", "PVB": "oil", "PSH": "oil", "PGD": "oil", "POS": "oil", "PVO": "oil", "PEQ": "oil",
    // Xây dựng & Đầu tư công (construction)
    "VCG": "construction", "HHV": "construction", "LCG": "construction", "FCN": "construction", "C4G": "construction", "HUT": "construction", "CTD": "construction", "HBC": "construction", "DPG": "construction", "CC1": "construction", "VEC": "construction", "VHE": "construction", "CII": "construction", "NBB": "construction",
    // Điện & Năng lượng (utilities)
    "POW": "utilities", "REE": "utilities", "PC1": "utilities", "NT2": "utilities", "GEG": "utilities", "TV2": "utilities", "QTP": "utilities", "HND": "utilities", "KHP": "utilities", "SBA": "utilities", "CHP": "utilities", "VSH": "utilities", "TTA": "utilities", "BCG": "utilities", "ASM": "utilities",
    // Bán lẻ & Tiêu dùng (retail)
    "MWG": "retail", "PNJ": "retail", "FRT": "retail", "DGW": "retail", "PET": "retail", "HAX": "retail", "SVC": "retail", "CMV": "retail", "HTC": "retail", "VFG": "retail",
    // Thực phẩm & Đồ uống (food)
    "VNM": "food", "MSN": "food", "SAB": "food", "KDC": "food", "SBT": "food", "QNS": "food", "DBC": "food", "BAF": "food", "HAG": "food", "HNG": "food", "PAN": "food", "TAR": "food", "LTG": "food", "VOC": "food", "TAC": "food", "MCH": "food",
    // Thủy sản (fishery)
    "VHC": "fishery", "ANV": "fishery", "IDI": "fishery", "FMC": "fishery", "CMX": "fishery", "MPC": "fishery", "ACL": "fishery",
    // Dệt may (textile)
    "TNG": "textile", "VGT": "textile", "GIL": "textile", "STK": "textile", "MSH": "textile", "TCM": "textile", "ADS": "textile", "EVE": "textile",
    // Hóa chất & Phân bón (chemicals)
    "DGC": "chemicals", "DPM": "chemicals", "DCM": "chemicals", "CSV": "chemicals", "BFC": "chemicals", "LAS": "chemicals", "DDV": "chemicals", "SFG": "chemicals", "PLC": "chemicals", "TSC": "chemicals",
    // Cảng biển & Vận tải (port)
    "HAH": "port", "GMD": "port", "VOS": "port", "PVT": "port", "PHP": "port", "SGP": "port", "MVN": "port", "VIP": "port", "VTO": "port", "DXP": "port", "CLL": "port", "TCL": "port",
    // Công nghệ & Viễn thông (tech)
    "FPT": "tech", "CMG": "tech", "CTR": "tech", "VGI": "tech", "FOX": "tech", "ELC": "tech", "ITD": "tech", "SGT": "tech", "TTN": "tech", "VNZ": "tech",
    // Nhựa & Cao su (rubber)
    "BMP": "rubber", "NTP": "rubber", "AAA": "rubber", "APH": "rubber", "DRC": "rubber", "CSM": "rubber", "SRC": "rubber", "GVR": "rubber", "BRR": "rubber", "TRC": "rubber",
    // Y tế & Dược phẩm (health)
    "DHG": "health", "IMP": "health", "TRA": "health", "DVN": "health", "DBD": "health", "AMV": "health", "JVC": "health", "TNH": "health", "PMC": "health",
    // Hàng không & Du lịch (travel)
    "VJC": "travel", "HVN": "travel", "ACV": "travel", "AST": "travel", "SAS": "travel", "SKG": "travel", "VTD": "travel", "DAH": "travel", "OCH": "travel",
    // Bảo hiểm (insurance)
    "BVH": "insurance", "PVI": "insurance", "BMI": "insurance", "MIG": "insurance", "BIC": "insurance", "VNR": "insurance", "PTI": "insurance", "PRE": "insurance"
  };

  // 1. Kiểm tra xem có cấu hình tùy chỉnh trong localStorage không
  const localSectors = localStorage.getItem('custom_sectors');
  if (localSectors) {
    try {
      sectorsData = JSON.parse(localSectors);
      buildTickerSectorMap();
      console.log("Đã tải cấu hình phân ngành từ LocalStorage của trình duyệt");
      return;
    } catch (e) {
      console.warn("Lỗi đọc cấu hình từ LocalStorage, chuyển sang tải sectors.json", e);
    }
  }

  // 2. Nếu không có trong localStorage, tải qua fetch
  try {
    const response = await fetch('sectors.json?' + new Date().getTime());
    if (response.ok) {
      sectorsData = await response.json();
      buildTickerSectorMap();
      console.log("Đã tải thành công cấu hình phân ngành từ sectors.json");
    } else {
      console.warn("Không thể tải sectors.json, sử dụng danh sách mặc định cứng");
      buildSectorsDataFromFallback();
    }
  } catch (e) {
    console.error("Lỗi khi kết nối lấy sectors.json", e);
    buildSectorsDataFromFallback();
  }
}

// Phục hồi dữ liệu sectorsData từ danh sách cứng fallback nếu không load được file
function buildSectorsDataFromFallback() {
  const englishToVietnamese = {
    "bank": "Ngân hàng",
    "finance": "Chứng khoán",
    "bds": "Bất động sản (Thương mại & Dân cư)",
    "bds-industrial": "Bất động sản Khu công nghiệp",
    "resources": "Thép & Vật liệu xây dựng",
    "oil": "Dầu khí",
    "construction": "Xây dựng & Đầu tư công",
    "utilities": "Điện & Năng lượng",
    "retail": "Bán lẻ & Tiêu dùng",
    "food": "Thực phẩm & Đồ uống",
    "fishery": "Thủy sản",
    "textile": "Dệt may",
    "chemicals": "Hóa chất & Phân bón",
    "port": "Cảng biển & Vận tải",
    "tech": "Công nghệ & Viễn thông",
    "rubber": "Nhựa & Cao su",
    "health": "Y tế & Dược phẩm",
    "travel": "Hàng không & Du lịch",
    "insurance": "Bảo hiểm"
  };

  sectorsData = {};
  Object.values(englishToVietnamese).forEach(vnName => {
    sectorsData[vnName] = [];
  });

  for (const [ticker, englishKey] of Object.entries(tickerSectorMap)) {
    const vnName = Object.keys(englishToVietnamese).find(key => englishToVietnamese[key] === englishKey);
    if (vnName) {
      sectorsData[englishToVietnamese[englishKey]].push(ticker);
    }
  }
}

// Xây dựng bản đồ ánh xạ từ Ticker sang Key phân loại của giao diện
function buildTickerSectorMap() {
  tickerSectorMap = {};
  
  const sectorMappingKeys = {
    "Ngân hàng": "bank",
    "Chứng khoán": "finance",
    "Bất động sản (Thương mại & Dân cư)": "bds",
    "Bất động sản Khu công nghiệp": "bds-industrial",
    "Thép & Vật liệu xây dựng": "resources",
    "Dầu khí": "oil",
    "Xây dựng & Đầu tư công": "construction",
    "Điện & Năng lượng": "utilities",
    "Bán lẻ & Tiêu dùng": "retail",
    "Thực phẩm & Đồ uống": "food",
    "Thủy sản": "fishery",
    "Dệt may": "textile",
    "Hóa chất & Phân bón": "chemicals",
    "Cảng biển & Vận tải": "port",
    "Công nghệ & Viễn thông": "tech",
    "Nhựa & Cao su": "rubber",
    "Y tế & Dược phẩm": "health",
    "Hàng không & Du lịch": "travel",
    "Bảo hiểm": "insurance"
  };

  for (const [vietnameseSector, tickers] of Object.entries(sectorsData)) {
    const englishKey = sectorMappingKeys[vietnameseSector];
    if (englishKey) {
      tickers.forEach(ticker => {
        const symbol = ticker.toUpperCase().trim();
        tickerSectorMap[symbol] = englishKey;
      });
    }
  }
}

// Khởi chạy các sự kiện cho Modal Cài đặt
function initSettingsModal() {
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const githubTokenInput = document.getElementById('githubTokenInput');
  const toggleTokenVisibility = document.getElementById('toggleTokenVisibility');
  const saveLocalBtn = document.getElementById('saveLocalBtn');
  const saveGithubBtn = document.getElementById('saveGithubBtn');
  const watchlistTickersInput = document.getElementById('watchlistTickersInput');

  if (!settingsBtn || !settingsModal) return;

  // Hiển thị token đã lưu trước đó nếu có
  const savedToken = localStorage.getItem('github_pat') || '';
  githubTokenInput.value = savedToken;

  // Mở modal
  settingsBtn.addEventListener('click', () => {
    buildSectorsFormFields();
    
    // Hiển thị watchlist đã lưu nếu có
    const savedWatchlist = localStorage.getItem('custom_watchlist_tickers') || '';
    if (watchlistTickersInput) {
      watchlistTickersInput.value = savedWatchlist;
    }
    
    settingsModal.classList.remove('hidden');
    setTimeout(() => {
      settingsModal.classList.remove('opacity-0');
      settingsModal.querySelector('.glass-panel').classList.remove('scale-95');
    }, 10);
  });

  // Đóng modal
  const closeModal = () => {
    settingsModal.classList.add('opacity-0');
    settingsModal.querySelector('.glass-panel').classList.add('scale-95');
    setTimeout(() => {
      settingsModal.classList.add('hidden');
    }, 300);
  };

  closeSettingsBtn.addEventListener('click', closeModal);
  
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeModal();
    }
  });

  // Ẩn/hiển thị token
  toggleTokenVisibility.addEventListener('click', () => {
    const isPassword = githubTokenInput.type === 'password';
    githubTokenInput.type = isPassword ? 'text' : 'password';
    toggleTokenVisibility.querySelector('span').textContent = isPassword ? 'visibility_off' : 'visibility';
  });

  // Lưu nhanh vào LocalStorage
  saveLocalBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const updatedSectors = getSectorsFromForm();
    sectorsData = updatedSectors;
    localStorage.setItem('custom_sectors', JSON.stringify(updatedSectors));
    buildTickerSectorMap();
    
    // Lưu watchlist cá nhân
    if (watchlistTickersInput) {
      const rawVal = watchlistTickersInput.value;
      const cleanVal = rawVal.split(',').map(item => item.toUpperCase().trim()).filter(item => item.length > 0).join(', ');
      localStorage.setItem('custom_watchlist_tickers', cleanVal);
    }
    
    renderWatchlist();
    filterAndRender();
    alert('Đã lưu cấu hình phân ngành và danh mục theo dõi vào trình duyệt thành công!');
    closeModal();
  });

  // Đồng bộ lên GitHub
  saveGithubBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const token = githubTokenInput.value.trim();
    if (!token) {
      alert('Vui lòng nhập GitHub Personal Access Token (PAT) để đồng bộ!');
      return;
    }
    
    localStorage.setItem('github_pat', token);
    const updatedSectors = getSectorsFromForm();
    const sectorsJsonContent = JSON.stringify(updatedSectors, null, 2);
    
    // Lưu watchlist cá nhân vào trình duyệt trước
    if (watchlistTickersInput) {
      const rawVal = watchlistTickersInput.value;
      const cleanVal = rawVal.split(',').map(item => item.toUpperCase().trim()).filter(item => item.length > 0).join(', ');
      localStorage.setItem('custom_watchlist_tickers', cleanVal);
    }
    
    saveGithubBtn.disabled = true;
    saveGithubBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Đang đồng bộ...';

    try {
      const repoOwner = "anvo061";
      const repoName = "AnInvest";
      const filePath = "sectors.json";
      const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;

      const getResponse = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      let sha = null;
      if (getResponse.ok) {
        const fileInfo = await getResponse.json();
        sha = fileInfo.sha;
      } else if (getResponse.status !== 404) {
        throw new Error('Không thể lấy thông tin file từ GitHub. Hãy kiểm tra lại Token!');
      }

      // Hỗ trợ tiếng Việt Unicode khi encode base64
      const base64Content = btoa(unescape(encodeURIComponent(sectorsJsonContent)));

      const putBody = {
        message: "Update sectors.json via Web UI",
        content: base64Content
      };
      if (sha) {
        putBody.sha = sha;
      }

      const putResponse = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify(putBody)
      });

      if (putResponse.ok) {
        sectorsData = updatedSectors;
        localStorage.setItem('custom_sectors', JSON.stringify(updatedSectors));
        buildTickerSectorMap();
        renderWatchlist();
        filterAndRender();
        
        alert('Đồng bộ lên GitHub thành công! File sectors.json đã được cập nhật. GitHub Actions sẽ tự động kích hoạt cào tin tức mới.');
        closeModal();
      } else {
        const errData = await putResponse.json();
        throw new Error(errData.message || 'Lỗi lưu file lên GitHub');
      }
    } catch (err) {
      console.error(err);
      alert('Đồng bộ thất bại: ' + err.message);
    } finally {
      saveGithubBtn.disabled = false;
      saveGithubBtn.innerHTML = '<i class="fa-brands fa-github"></i> Đồng bộ GitHub &amp; Cào Tin';
    }
  });
}

// Vẽ form nhập liệu 19 ngành
function buildSectorsFormFields() {
  const sectorsFormList = document.getElementById('sectorsFormList');
  if (!sectorsFormList) return;
  
  sectorsFormList.innerHTML = '';
  
  const defaultSectors = [
    "Ngân hàng",
    "Chứng khoán",
    "Bất động sản (Thương mại & Dân cư)",
    "Bất động sản Khu công nghiệp",
    "Thép & Vật liệu xây dựng",
    "Dầu khí",
    "Xây dựng & Đầu tư công",
    "Điện & Năng lượng",
    "Bán lẻ & Tiêu dùng",
    "Thực phẩm & Đồ uống",
    "Thủy sản",
    "Dệt may",
    "Hóa chất & Phân bón",
    "Cảng biển & Vận tải",
    "Công nghệ & Viễn thông",
    "Nhựa & Cao su",
    "Y tế & Dược phẩm",
    "Hàng không & Du lịch",
    "Bảo hiểm"
  ];

  defaultSectors.forEach(sectorName => {
    const list = sectorsData[sectorName] || [];
    const val = list.join(', ');
    
    const wrapper = document.createElement('div');
    wrapper.className = 'space-y-1.5';
    wrapper.innerHTML = `
      <label class="block font-bold text-outline text-[10px] uppercase tracking-wider">${sectorName}</label>
      <input type="text" data-sector-name="${sectorName}" class="sector-input w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary focus:border-primary text-[11px] font-semibold" value="${val}" placeholder="VD: VCB, BID, CTG" />
    `;
    sectorsFormList.appendChild(wrapper);
  });
}

// Thu thập dữ liệu form nhập
function getSectorsFromForm() {
  const inputs = document.querySelectorAll('.sector-input');
  const result = {};
  
  inputs.forEach(input => {
    const sectorName = input.getAttribute('data-sector-name');
    const val = input.value;
    
    const list = val.split(',')
      .map(item => item.toUpperCase().trim())
      .filter(item => item.length > 0);
      
    result[sectorName] = list;
  });
  
  return result;
}

// Kiểm tra khớp từ nguyên vẹn trong tiếng Việt (tránh các lỗi khớp từ con như "đá" trong "đánh giá", "sách" trong "chính sách")
function includesWholeWord(text, keyword) {
  // Nếu từ khóa chỉ toàn ký tự alphabet ASCII hoặc số (ví dụ mã cổ phiếu "vgc", "vix")
  if (/^[a-zA-Z0-9]+$/.test(keyword)) {
    const regex = new RegExp('\\b' + keyword + '\\b', 'i');
    return regex.test(text);
  }
  
  // Với tiếng Việt có dấu, ta dùng regex so khớp khoảng trống hoặc ký tự đặc biệt quanh từ
  const escaped = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const boundaryPattern = '(^|[^a-zA-Z0-9_àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ])';
  const regex = new RegExp(boundaryPattern + escaped + boundaryPattern, 'i');
  return regex.test(text);
}

// Kiểm tra từ khóa tương ứng với từng ngành phân loại
function checkKeywordsForSector(text, sector) {
  let keywords = [];
  switch (sector) {
    case 'bank':
      keywords = ["ngân hàng", "lãi suất", "tín dụng", "nợ xấu", "vcb", "bid", "tcb", "mbb", "acb", "vib", "ctg", "shb", "vpbank", "stb"];
      break;
    case 'bds':
      keywords = ["bất động sản", "bđs", "nhà đất", "địa ốc", "chung cư", "vinhomes", "vhm", "novaland", "pdr", "dxg", "dig", "nlg", "kdh", "ceo"];
      break;
    case 'bds-industrial':
      keywords = ["khu công nghiệp", "kcn", "szc", "kbc", "ita", "bcm", "idc", "lhg", "sip", "tip"];
      break;
    case 'finance':
      keywords = ["chứng khoán", "cổ phiếu", "vn-index", "tự doanh", "vốn ngoại", "ssi", "vnd", "vci", "hcm", "vix", "fts", "shs", "cts"];
      break;
    case 'resources':
      keywords = ["thép", "quặng", "hpg", "hsg", "nkg", "sắt", "tôn", "mạ", "phôi thép"];
      break;
    case 'oil':
      keywords = ["dầu khí", "xăng", "dầu", "brent", "pvd", "pvs", "plx", "oil", "lọc dầu", "bsr"];
      break;
    case 'construction':
      keywords = ["xây dựng", "vật liệu", "đầu tư công", "xi măng", "cát", "đá", "vgc", "vcg", "hhv", "c4g", "lcg", "fcn", "ctd", "hbc", "hút", "cii"];
      break;
    case 'utilities':
      keywords = ["điện", "nước", "thủy điện", "nhiệt điện", "năng lượng", "bwe", "pow", "geg", "ree", "twt"];
      break;
    case 'retail':
      keywords = ["bán lẻ", "siêu thị", "mwg", "thế giới di động", "frt", "dgw", "digiworld", "pnj", "tiêu dùng"];
      break;
    case 'food':
      keywords = ["thực phẩm", "đồ uống", "sữa", "vinamilk", "vnm", "masan", "msn", "sabeco", "sab", "lúa", "đường", "thịt", "heo", "gạo"];
      break;
    case 'fishery':
      keywords = ["thủy sản", "tôm", "cá tra", "vhc", "anv", "idi", "fmc", "mpc", "xuất khẩu thủy sản"];
      break;
    case 'textile':
      keywords = ["dệt may", "sợi", "vải", "tng", "msh", "vgt", "tcm", "gil", "may mặc"];
      break;
    case 'chemicals':
      keywords = ["hóa chất", "phân bón", "ure", "dpm", "dcm", "las", "phốt pho", "dgc"];
      break;
    case 'port':
      keywords = ["cảng biển", "logistics", "vận tải", "gmd", "tcl", "hải an", "hah", "tầu biển", "vận chuyển"];
      break;
    case 'tech':
      keywords = ["công nghệ", "fpt", "viettel", "elcom", "cmg", "bán dẫn", "ai", "phần mềm", "viễn thông", "chip"];
      break;
    case 'rubber':
      keywords = ["nhựa", "cao su", "săm", "lốp", "bmp", "ntp", "aaa", "aph", "drc", "csm", "src", "gvr"];
      break;
    case 'health':
      keywords = ["y tế", "dược", "bệnh viện", "thuốc", "dhg", "dht", "tra", "traphaco", "imp"];
      break;
    case 'travel':
      keywords = ["du lịch", "khách sạn", "hàng không", "vietjet", "vjc", "hvn", "sân bay", "golf", "nghỉ dưỡng"];
      break;
    case 'insurance':
      keywords = ["bảo hiểm", "bảo việt", "bvh", "pvi", "bic", "mig", "pti"];
      break;
  }
  return keywords.some(k => includesWholeWord(text, k));
}
