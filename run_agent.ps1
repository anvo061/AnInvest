# Run Stock Market Agent script
# Usage: .\run_agent.ps1 [-OneShot] [-Force]

param(
    [switch]$OneShot,  # Chạy 1 lần rồi thoát (tiện cho việc test)
    [switch]$Force     # Bỏ qua lịch sử, phân tích lại tất cả các tin tìm thấy
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8

# Cài đặt thư mục làm việc và các file dữ liệu
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigFile = Join-Path $ScriptDir "config.json"
$DataDir = Join-Path $ScriptDir "data"
$HistoryFile = Join-Path $DataDir "history.json"
$ResultsFile = Join-Path $DataDir "analysis_results.json"

# Hàm in log màu mè cho đẹp mắt
function Write-Log {
    param (
        [string]$Message,
        [string]$Type = "INFO"
    )
    $Color = "White"
    switch ($Type) {
        "INFO"    { $Color = "Cyan" }
        "SUCCESS" { $Color = "Green" }
        "WARNING" { $Color = "Yellow" }
        "ERROR"   { $Color = "Red" }
    }
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Type] $Message" -ForegroundColor $Color
}

Write-Log "Khởi động Stock Market Analysis Agent..." "INFO"

# Tạo thư mục data nếu chưa tồn tại
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
    Write-Log "Đã tạo thư mục lưu trữ dữ liệu tại: $DataDir" "SUCCESS"
}

# Đọc file cấu hình config.json
if (-not (Test-Path $ConfigFile)) {
    Write-Log "Không tìm thấy file cấu hình config.json tại $ConfigFile" "ERROR"
    Exit
}

$Config = Get-Content -Path $ConfigFile -Raw | ConvertFrom-Json
$ApiKey = $Config.GeminiApiKey

# Hỏi API Key nếu chưa cấu hình
if ($ApiKey -eq "YOUR_GEMINI_API_KEY" -or [string]::IsNullOrEmpty($ApiKey)) {
    Write-Log "Gemini API Key chưa được cấu hình." "WARNING"
    $InputKey = Read-Host "Vui lòng nhập Gemini API Key của bạn (hoặc nhấn Enter để bỏ qua nếu đã set biến môi trường GEMINI_API_KEY)"
    if (-not [string]::IsNullOrEmpty($InputKey)) {
        $ApiKey = $InputKey.Trim()
        # Lưu lại vào file config.json để lần sau không cần nhập lại
        $Config.GeminiApiKey = $ApiKey
        $ConfigJson = ConvertTo-Json $Config -Depth 10
        [System.IO.File]::WriteAllText($ConfigFile, $ConfigJson, [System.Text.Encoding]::UTF8)
        Write-Log "Đã lưu Gemini API Key vào file config.json" "SUCCESS"
    } else {
        $ApiKey = $env:GEMINI_API_KEY
    }
}

if ([string]::IsNullOrEmpty($ApiKey)) {
    Write-Log "Không có Gemini API Key. Vui lòng lấy khóa API miễn phí từ Google AI Studio và cấu hình vào config.json." "ERROR"
    Exit
}

# Đọc lịch sử quét tin tức
$History = @()
if (Test-Path $HistoryFile) {
    try {
        $History = Get-Content -Path $HistoryFile -Raw | ConvertFrom-Json
        if ($History -eq $null) { $History = @() }
    } catch {
        Write-Log "Lỗi đọc file lịch sử. Khởi tạo lại." "WARNING"
        $History = @()
    }
}

# Đọc kết quả phân tích cũ
$Results = @()
if (Test-Path $ResultsFile) {
    try {
        $Results = Get-Content -Path $ResultsFile -Raw | ConvertFrom-Json
        if ($Results -eq $null) { $Results = @() }
    } catch {
        Write-Log "Lỗi đọc file kết quả cũ. Khởi tạo lại." "WARNING"
        $Results = @()
    }
}

# Hàm làm sạch thẻ HTML trong phần tóm tắt của RSS (nếu có)
function Clean-Html {
    param ([string]$Html)
    if ([string]::IsNullOrEmpty($Html)) { return "" }
    # Loại bỏ các thẻ HTML
    $Clean = $Html -replace '<[^>]+>', ''
    # Giải mã các ký tự HTML thực thể cơ bản
    $Clean = $Clean -replace '&nbsp;', ' '
    $Clean = $Clean -replace '&amp;', '&'
    $Clean = $Clean -replace '&quot;', '"'
    $Clean = $Clean -replace '&lt;', '<'
    $Clean = $Clean -replace '&gt;', '>'
    return $Clean.Trim()
}

# Hàm lấy tin tức từ RSS feed
function Get-RssFeedItems {
    param (
        [string]$FeedUrl,
        [string]$Source
    )
    $Items = @()
    try {
        Write-Log "Đang tải tin tức từ: $Source ($FeedUrl)..." "INFO"
        # Đặt User-Agent để tránh bị một số báo chặn
        $WebResponse = Invoke-WebRequest -Uri $FeedUrl -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -TimeoutSec 15 -UseBasicParsing
        [xml]$Xml = $WebResponse.Content
        
        # Parse RSS 2.0
        if ($Xml.rss.channel.item) {
            $Items = $Xml.rss.channel.item | ForEach-Object {
                $CleanDesc = Clean-Html $_.description
                [PSCustomObject]@{
                    Title       = ([string]$_.title).Trim()
                    Description = $CleanDesc
                    Link        = ([string]$_.link).Trim()
                    PubDate     = ([string]$_.pubDate).Trim()
                    Source      = $Source
                }
            }
        }
    } catch {
        Write-Log "Lỗi khi lấy tin tức từ $($Source): $_" "WARNING"
    }
    return $Items
}

# Hàm phân tích tin tức bằng Gemini API
function Analyze-NewsItem {
    param (
        [PSCustomObject]$NewsItem,
        [string]$ApiKey
    )
    
    $Title = $NewsItem.Title
    $Description = $NewsItem.Description
    $Source = $NewsItem.Source
    $PubDate = $NewsItem.PubDate
    $Link = $NewsItem.Link

    Write-Log "Đang gửi phân tích cho tin: '$Title'..." "INFO"

    # Xây dựng prompt phân tích chứng khoán chi tiết
    $Prompt = @"
Hãy đóng vai là một chuyên gia phân tích tài chính và kinh tế cao cấp chuyên sâu về thị trường chứng khoán Việt Nam và thế giới. Tôi sẽ cung cấp một tin tức tài chính kinh tế, nhiệm vụ của bạn là phân tích chi tiết các tác động của tin tức này đến thị trường chứng khoán và các mã cổ phiếu cụ thể.

Tin tức:
- Tiêu đề: $Title
- Tóm tắt/Nội dung: $Description
- Nguồn tin: $Source
- Ngày đăng: $PubDate

Bạn hãy phân tích cẩn thận và trả về kết quả dưới định dạng JSON duy nhất. Cấu trúc JSON phải tuân thủ chính xác mẫu dưới đây (không được kèm bất cứ chữ viết hay giải thích nào ngoài khối JSON):
{
  "Title": "$($Title -replace '"', '\"')",
  "Source": "$($Source -replace '"', '\"')",
  "Link": "$($Link -replace '"', '\"')",
  "PubDate": "$($PubDate -replace '"', '\"')",
  "Sentiment": "Tích cực" | "Tiêu cực" | "Trung lập",
  "ImpactScore": (số nguyên từ -10 đến 10, ví dụ: 8 hoặc -3),
  "MarketImpact": "Giải thích chi tiết bằng tiếng Việt về tác động của tin tức này đối với thị trường chứng khoán chung.",
  "Relevance": "Cao" | "Trung bình" | "Thấp",
  "AffectedTickers": [
    {
      "Ticker": "Mã cổ phiếu viết hoa (ví dụ: FPT, HPG, VCB, VHM, AAPL, NVDA, TSLA)",
      "ImpactType": "Tích cực" | "Tiêu cực" | "Trung lập",
      "Reasoning": "Giải thích cụ thể vì sao mã này bị tác động bởi tin tức này."
    }
  ]
}
"@

    # Gọi API Gemini 2.0 Flash (hoặc 1.5-flash tùy thích, 2.0-flash nhanh hơn và tốt hơn)
    $Uri = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$ApiKey"
    
    $RequestBody = @{
        contents = @(
            @{
                parts = @(
                    @{ text = $Prompt }
                )
            }
        )
        generationConfig = @{
            responseMimeType = "application/json"
            temperature = 0.2
        }
    } | ConvertTo-Json -Depth 10

    # Chuyển đổi body thành bytes UTF-8 để giữ nguyên dấu tiếng Việt khi gọi API
    $BodyBytes = [System.Text.Encoding]::UTF8.GetBytes($RequestBody)
    
    try {
        $ApiResponse = Invoke-RestMethod -Uri $Uri -Method Post -Headers @{ "Content-Type" = "application/json; charset=utf-8" } -Body $BodyBytes -TimeoutSec 20
        $RawText = $ApiResponse.candidates[0].content.parts[0].text
        
        # Parse JSON từ AI
        $Analysis = $RawText | ConvertFrom-Json
        $Analysis | Add-Member -MemberType NoteProperty -Name "AnalyzedAt" -Value (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        
        return $Analysis
    } catch {
        Write-Log "Lỗi khi gọi API Gemini phân tích tin tức: $_" "ERROR"
        if ($_.Exception -and $_.Exception.Response) {
            try {
                # Kiểm tra xem đối tượng Response có phương thức GetResponseStream không (Windows PowerShell)
                $Response = $_.Exception.Response
                $StreamMethod = $Response.GetType().GetMethod("GetResponseStream")
                if ($null -ne $StreamMethod) {
                    $Reader = New-Object System.IO.StreamReader($Response.GetResponseStream())
                    $ErrorBody = $Reader.ReadToEnd()
                    Write-Log "Phản hồi lỗi từ API: $ErrorBody" "ERROR"
                } else {
                    Write-Log "Chi tiết phản hồi lỗi: $($Response.ToString())" "ERROR"
                }
            } catch {
                # Tránh làm sập script nếu không đọc được stream lỗi
                Write-Log "Không thể phân tích chi tiết lỗi từ API: $_" "WARNING"
            }
        }
        return $null
    }
}

# Tiến hành quét
function Start-Scan {
    # Tải lại file config để nhận cập nhật nếu có thay đổi
    $Config = Get-Content -Path $ConfigFile -Raw | ConvertFrom-Json
    $ApiKey = $Config.GeminiApiKey
    
    if ($ApiKey -eq "YOUR_GEMINI_API_KEY" -or [string]::IsNullOrEmpty($ApiKey)) {
        $ApiKey = $env:GEMINI_API_KEY
    }

    if ([string]::IsNullOrEmpty($ApiKey)) {
        Write-Log "Chưa cấu hình API Key. Bỏ qua lượt quét này." "WARNING"
        return
    }

    Write-Log "Bắt đầu chu kỳ quét mới..." "INFO"
    $AllNewItems = @()

    foreach ($Feed in $Config.RssFeeds) {
        $Items = Get-RssFeedItems -FeedUrl $Feed.Url -Source $Feed.Name
        Write-Log "Tìm thấy $($Items.Count) tin tức từ $($Feed.Name)." "INFO"

        $NewFeedItems = @()
        foreach ($Item in $Items) {
            # Tạo hash hoặc dùng link làm định danh
            $UniqueId = $Item.Link
            if ($Force -or ($History -notcontains $UniqueId)) {
                $NewFeedItems += $Item
            }
        }
        
        # Giới hạn số lượng tin mới quét mỗi feed để tránh quá tải
        $Limit = [Math]::Min($NewFeedItems.Count, $Config.MaxItemsPerScan)
        if ($NewFeedItems.Count -gt 0) {
            Write-Log "Phát hiện $($NewFeedItems.Count) tin mới từ $($Feed.Name). Sẽ phân tích $Limit tin mới nhất." "INFO"
            for ($i = 0; $i -lt $Limit; $i++) {
                $AllNewItems += $NewFeedItems[$i]
            }
        }
    }

    Write-Log "Tổng số tin tức mới cần phân tích trên tất cả các kênh: $($AllNewItems.Count)" "INFO"

    $ProcessedCount = 0
    foreach ($Item in $AllNewItems) {
        # Phân tích qua Gemini
        $Analysis = Analyze-NewsItem -NewsItem $Item -ApiKey $ApiKey
        
        if ($Analysis -ne $null) {
            # Thêm kết quả vào đầu mảng kết quả (tin mới nhất hiển thị trên cùng)
            $Results = @($Analysis) + $Results
            
            # Giới hạn số lượng kết quả lưu trữ tối đa (ví dụ giữ lại 200 tin mới nhất để nhẹ file JSON)
            if ($Results.Count -gt 200) {
                $Results = $Results[0..199]
            }

            # Ghi kết quả xuống file JSON
            $ResultsJson = ConvertTo-Json $Results -Depth 10
            [System.IO.File]::WriteAllText($ResultsFile, $ResultsJson, [System.Text.Encoding]::UTF8)

            # Thêm tin vào lịch sử để không phân tích lại
            $History += $Item.Link
            $HistoryJson = ConvertTo-Json $History
            [System.IO.File]::WriteAllText($HistoryFile, $HistoryJson, [System.Text.Encoding]::UTF8)

            $ProcessedCount++
            Write-Log "Đã phân tích thành công: '$($Item.Title)' (Sentiment: $($Analysis.Sentiment))" "SUCCESS"
            
            # Delay nhẹ giữa các lần gọi API để tránh rate limit
            Start-Sleep -Seconds 2
        } else {
            Write-Log "Phân tích thất bại cho tin: '$($Item.Title)'. Sẽ thử lại ở phiên sau." "WARNING"
        }
    }

    Write-Log "Hoàn thành quét chu kỳ này. Đã xử lý $ProcessedCount/$($AllNewItems.Count) tin mới." "SUCCESS"
}

# Vòng lặp chính
if ($OneShot) {
    Write-Log "Đang chạy chế độ One-Shot (chạy một lần)..." "INFO"
    Start-Scan
} else {
    Write-Log "Đang chạy chế độ tự động chạy định kỳ..." "INFO"
    Write-Log "Nhấn Ctrl + C để dừng Agent." "WARNING"
    while ($true) {
        try {
            Start-Scan
        } catch {
            Write-Log "Lỗi không mong muốn trong chu kỳ quét: $_" "ERROR"
        }
        
        $Interval = $Config.ScanIntervalSeconds
        Write-Log "Chờ $Interval giây trước phiên quét kế tiếp..." "INFO"
        Start-Sleep -Seconds $Interval
    }
}
