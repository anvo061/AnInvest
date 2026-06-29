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

// Khởi chạy khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
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

  newsData.forEach(item => {
    if (Array.isArray(item.AffectedTickers)) {
      item.AffectedTickers.forEach(t => {
        if (!t.Ticker) return;
        const symbol = t.Ticker.toUpperCase().trim();
        
        let scoreChange = 0;
        const type = (t.ImpactType || '').toLowerCase();
        if (type.includes('tích cực') || type === 'positive') scoreChange = 1;
        else if (type.includes('tiêu cực') || type === 'negative') scoreChange = -1;

        if (!tickerMap[symbol]) {
          tickerMap[symbol] = {
            symbol: symbol,
            count: 0,
            scoreSum: 0
          };
        }
        tickerMap[symbol].count += 1;
        tickerMap[symbol].scoreSum += scoreChange;
      });
    }
  });

  const tickerList = Object.values(tickerMap).sort((a, b) => b.count - a.count);

  // Cập nhật số lượng cổ phiếu tâm điểm ở header watchlist
  const watchlistCountEl = document.getElementById('watchlistCount');
  if (watchlistCountEl) {
    watchlistCountEl.innerText = `${tickerList.length} mã`;
  }

  if (tickerList.length === 0) {
    watchlistContainer.innerHTML = '<div class="watchlist-placeholder text-xs text-on-surface-variant italic p-3 text-center">Chưa có mã bị ảnh hưởng...</div>';
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

    itemEl.innerHTML = `
      <div class="flex-1">
        <p class="font-bold text-on-surface text-[11px]">${t.symbol}</p>
        <p class="text-[9px] text-on-surface-variant">${t.count} tin</p>
      </div>
      <div class="w-12 h-6 mx-2 flex-shrink-0">
        <svg class="w-full h-full" viewBox="0 0 100 40">
          <path class="${pathClass}" d="M0,${y1} L33,${y2} L66,${y3} L100,${y4}"></path>
        </svg>
      </div>
      <div class="text-right flex-shrink-0">
        <span class="${badgeClass} px-1.5 py-0.5 rounded text-[9px] font-bold">${badgeText}</span>
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
      if (activeSectorFilter === 'bank') {
        const keywords = ["ngân hàng", "lãi suất", "tín dụng", "vcb", "bid", "tcb", "mbb", "acb", "vib", "ctg"];
        matchesSector = keywords.some(k => textToSearch.includes(k));
      } else if (activeSectorFilter === 'bds') {
        const keywords = ["bất động sản", "bđs", "nhà đất", "địa ốc", "vinhomes", "vhm", "novaland", "pdr", "dxg", "dig"];
        matchesSector = keywords.some(k => textToSearch.includes(k));
      } else if (activeSectorFilter === 'stock') {
        const keywords = ["chứng khoán", "cổ phiếu", "vn-index", "tự doanh", "ssi", "vnd", "vci", "hcm", "vix"];
        matchesSector = keywords.some(k => textToSearch.includes(k));
      } else if (activeSectorFilter === 'steel') {
        const keywords = ["thép", "quặng", "hpg", "hsg", "nkg", "xây dựng", "vật liệu", "đầu tư công"];
        matchesSector = keywords.some(k => textToSearch.includes(k));
      } else if (activeSectorFilter === 'energy') {
        const keywords = ["dầu khí", "xăng", "dầu", "brent", "gas", "điện", "pvd", "pvs", "pow"];
        matchesSector = keywords.some(k => textToSearch.includes(k));
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
    let sentimentBorderClass = 'border-l-4 border-outline/30';
    let sentimentBadgeClass = 'bg-outline/20 text-outline';
    let sentimentIcon = 'fa-minus';
    
    if (sentiment.includes('tích cực') || sentiment === 'positive') {
      sentimentBorderClass = 'border-l-4 border-primary/60';
      sentimentBadgeClass = 'bg-primary/20 text-primary';
      sentimentIcon = 'fa-arrow-trend-up';
    } else if (sentiment.includes('tiêu cực') || sentiment === 'negative') {
      sentimentBorderClass = 'border-l-4 border-error/60';
      sentimentBadgeClass = 'bg-error/20 text-error';
      sentimentIcon = 'fa-arrow-trend-down';
    }

    let relClass = 'bg-outline/10 text-on-surface-variant';
    const rel = (item.Relevance || '').toLowerCase();
    if (rel === 'cao' || rel === 'high') relClass = 'bg-primary/10 text-primary';
    else if (rel === 'trung bình' || rel === 'medium') relClass = 'bg-surface-variant text-on-surface-variant';

    // Tạo phần danh sách các mã bị tác động
    let tickersHtml = '';
    if (Array.isArray(item.AffectedTickers) && item.AffectedTickers.length > 0) {
      let pills = item.AffectedTickers.map(t => {
        let tClass = 'neutral';
        let trendIcon = '<i class="fa-solid fa-minus"></i>';
        const type = (t.ImpactType || '').toLowerCase();
        
        if (type.includes('tích cực') || type === 'positive') {
          tClass = 'positive';
          trendIcon = '<i class="fa-solid fa-arrow-trend-up"></i>';
        } else if (type.includes('tiêu cực') || type === 'negative') {
          tClass = 'negative';
          trendIcon = '<i class="fa-solid fa-arrow-trend-down"></i>';
        }

        return `
          <div class="ticker-pill ${tClass}" onclick="event.stopPropagation(); filterByTicker('${t.Ticker.toUpperCase().trim()}')">
            <span>${t.Ticker.toUpperCase()}</span>
            <span>${trendIcon}</span>
          </div>
        `;
      }).join('');

      tickersHtml = `
        <div class="flex items-center gap-2 mt-4 pt-3 border-t border-outline-variant/20 flex-wrap">
          <span class="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Cổ phiếu bị tác động:</span>
          <div class="flex gap-1.5 flex-wrap">${pills}</div>
        </div>
      `;
    }

    const formattedDate = item.AnalyzedAt || item.PubDate || 'Vừa xong';
    const imageUrl = getNewsImage(item.Title, item.Sentiment);

    card.className = `glass-panel rounded-xl p-5 flex flex-col md:flex-row gap-5 hover:bg-surface-variant/20 transition-all border border-outline-variant/30 hover:border-primary/20 cursor-pointer group ${sentimentBorderClass}`;
    
    card.innerHTML = `
      <div class="w-full md:w-40 h-28 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container relative">
        <img alt="News Thumbnail" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${imageUrl}"/>
      </div>
      <div class="flex-1 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
            <div class="flex items-center gap-2">
              <span class="bg-surface-variant/80 backdrop-blur text-on-surface-variant text-[10px] font-bold px-2 py-0.5 rounded uppercase border border-outline-variant/30">${item.Source || 'Tin tức'}</span>
              <span class="text-[10px] text-outline flex items-center gap-1"><span class="material-symbols-outlined text-xs">schedule</span> ${formattedDate}</span>
            </div>
            <div class="flex gap-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${sentimentBadgeClass}">
                <i class="fa-solid ${sentimentIcon}"></i>
                ${item.Sentiment} (${item.ImpactScore || 0})
              </span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${relClass}">Độ ảnh hưởng: ${item.Relevance}</span>
            </div>
          </div>
          <h4 class="font-bold text-base text-on-surface leading-snug mb-2 group-hover:text-primary transition-colors">
            <a href="${item.Link || '#'}" target="_blank" onclick="event.stopPropagation()">${item.Title}</a>
          </h4>
          <div class="bg-surface-dim/40 border border-outline-variant/40 rounded-lg p-2.5 mt-2">
            <div class="text-[10px] font-bold text-primary flex items-center gap-1 mb-0.5">
              <span class="material-symbols-outlined text-xs font-bold">psychology</span> Phân tích tác động AI:
            </div>
            <p class="text-xs text-on-surface-variant leading-relaxed font-medium">${item.MarketImpact}</p>
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
