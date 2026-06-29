// Client-side Javascript for Stock Market Agent Dashboard

let newsData = [];
let filteredData = [];
let activeFilter = 'all';
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

  // Chuyển đổi tab
  const navNewsBtn = document.getElementById('navNews');
  const navReportBtn = document.getElementById('navReport');
  const newsTabContent = document.getElementById('newsTabContent');
  const reportTabContent = document.getElementById('reportTabContent');

  if (navNewsBtn && navReportBtn) {
    navNewsBtn.addEventListener('click', () => {
      navNewsBtn.classList.add('active');
      navReportBtn.classList.remove('active');
      newsTabContent.style.display = 'block';
      reportTabContent.style.display = 'none';
    });

    navReportBtn.addEventListener('click', () => {
      navReportBtn.classList.add('active');
      navNewsBtn.classList.remove('active');
      newsTabContent.style.display = 'none';
      reportTabContent.style.display = 'block';
      loadReport(); // Tải báo cáo
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
    // Nếu lỗi, có thể dữ liệu chưa được khởi tạo
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
  let highRelevanceCount = 0;

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
  labelElement.className = 'sentiment-label';
  
  if (avgScore >= 1.5) {
    labelElement.innerText = 'Tích cực';
    labelElement.classList.add('positive');
    scoreElement.style.color = 'var(--color-success)';
  } else if (avgScore <= -1.5) {
    labelElement.innerText = 'Tiêu cực';
    labelElement.classList.add('negative');
    scoreElement.style.color = 'var(--color-danger)';
  } else {
    labelElement.innerText = 'Trung lập';
    labelElement.classList.add('neutral');
    scoreElement.style.color = 'var(--color-warning)';
  }

  // Cập nhật Gauge bar fill (chuyển đổi từ khoảng -10 -> 10 sang 0% -> 100%)
  // -10 map to 0%, 0 map to 50%, 10 map to 100%
  const percentage = ((avgScore + 10) / 20) * 100;
  document.getElementById('gaugeFill').style.width = `${percentage}%`;

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
        backgroundColor: ['#10b981', '#f43f5e', '#f59e0b'],
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
        }
      },
      cutout: '70%'
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

  if (tickerList.length === 0) {
    watchlistContainer.innerHTML = '<div class="watchlist-placeholder">Chưa có mã bị ảnh hưởng</div>';
    return;
  }

  tickerList.forEach(t => {
    const itemEl = document.createElement('div');
    itemEl.className = 'watchlist-item';
    if (activeTickerFilter === t.symbol) {
      itemEl.classList.add('active');
    }

    const netScore = t.scoreSum;
    let badgeClass = 'neutral';
    let badgeText = '0';
    if (netScore > 0) {
      badgeClass = 'positive';
      badgeText = `+${netScore}`;
    } else if (netScore < 0) {
      badgeClass = 'negative';
      badgeText = `${netScore}`;
    }

    itemEl.innerHTML = `
      <span class="ticker-name">${t.symbol}</span>
      <div class="ticker-info">
        <span class="ticker-count">${t.count} tin</span>
        <span class="ticker-badge badge ${badgeClass}">${badgeText}</span>
      </div>
    `;

    itemEl.addEventListener('click', () => {
      if (activeTickerFilter === t.symbol) {
        activeTickerFilter = null;
        itemEl.classList.remove('active');
      } else {
        activeTickerFilter = t.symbol;
        // Bỏ active ở các thằng khác
        document.querySelectorAll('.watchlist-item').forEach(el => el.classList.remove('active'));
        itemEl.classList.add('active');
      }
      filterAndRender();
    });

    watchlistContainer.appendChild(itemEl);
  });
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

    return matchesCategory && matchesSearch && matchesTicker;
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
    
    // Gán class để vẽ viền màu tương ứng
    const sentiment = (item.Sentiment || '').toLowerCase();
    let sentimentClass = 'neutral';
    if (sentiment.includes('tích cực') || sentiment === 'positive') sentimentClass = 'positive';
    else if (sentiment.includes('tiêu cực') || sentiment === 'negative') sentimentClass = 'negative';

    card.className = `news-card ${sentimentClass}`;

    // Tạo badges
    let relClass = 'relevance-low';
    const rel = (item.Relevance || '').toLowerCase();
    if (rel === 'cao' || rel === 'high') relClass = 'relevance-high';
    else if (rel === 'trung bình' || rel === 'medium') relClass = 'relevance-medium';

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
            <span class="pill-symbol">${t.Ticker.toUpperCase()}</span>
            <span class="pill-trend">${trendIcon}</span>
          </div>
        `;
      }).join('');

      tickersHtml = `
        <div class="card-tickers">
          <span class="tickers-label">Cổ phiếu bị tác động:</span>
          <div class="tickers-list">${pills}</div>
        </div>
      `;
    }

    // Thời gian định dạng đẹp
    const formattedDate = item.AnalyzedAt || item.PubDate || 'Vừa xong';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-title-area">
          <div class="card-meta">
            <span class="source-badge">${item.Source || 'Tin tức'}</span>
            <span class="pub-date"><i class="fa-regular fa-clock"></i> ${formattedDate}</span>
          </div>
          <a href="${item.Link || '#'}" target="_blank" class="news-title-link">${item.Title}</a>
        </div>
        <div class="badge-group">
          <span class="badge ${sentimentClass}">
            <i class="fa-solid ${sentimentClass === 'positive' ? 'fa-arrow-trend-up' : (sentimentClass === 'negative' ? 'fa-arrow-trend-down' : 'fa-minus')}"></i>
            ${item.Sentiment} (${item.ImpactScore || 0})
          </span>
          <span class="badge ${relClass}">Độ ảnh hưởng: ${item.Relevance}</span>
        </div>
      </div>
      
      <div class="card-impact">
        <div class="impact-title">
          <i class="fa-solid fa-brain-circuit"></i> Phân tích tác động AI:
        </div>
        <p class="impact-desc">${item.MarketImpact}</p>
      </div>

      ${tickersHtml}
    `;

    newsFeedContainer.appendChild(card);
  });
}

// Hàm lọc nhanh khi nhấn vào pill mã cổ phiếu trên tin tức
function filterByTicker(symbol) {
  activeTickerFilter = symbol;
  
  // Đồng bộ active lên sidebar watchlist
  document.querySelectorAll('.watchlist-item').forEach(el => {
    const name = el.querySelector('.ticker-name').innerText;
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
    document.getElementById('updateTimer').innerText = `Tự động làm mới trong ${countdownTime}s`;
    
    if (countdownTime <= 0) {
      loadData();
      countdownTime = 30;
    }
  }, 1000);
}

function resetCountdown() {
  countdownTime = 30;
  document.getElementById('updateTimer').innerText = `Tự động làm mới trong 30s`;
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
      <div class="feed-empty-state">
        <div class="empty-icon"><i class="fa-solid fa-circle-info"></i></div>
        <h3>Chưa có dữ liệu báo cáo chuyên sâu</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}
