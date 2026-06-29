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
                    Title       = if ($null -ne $_.title.InnerText) { $_.title.InnerText.Trim() } else { ([string]$_.title).Trim() }
                    Description = $CleanDesc
                    Link        = if ($null -ne $_.link.InnerText) { $_.link.InnerText.Trim() } else { ([string]$_.link).Trim() }
                    PubDate     = if ($null -ne $_.pubDate.InnerText) { $_.pubDate.InnerText.Trim() } else { ([string]$_.pubDate).Trim() }
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

    # Gọi API Gemini (dùng alias gemini-flash-latest để có 1500 lượt gọi/ngày miễn phí)
    $Uri = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=$ApiKey"
    
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
    
    $MaxRetries = 3
    $RetryCount = 0
    $Success = $false
    $Analysis = $null

    while (-not $Success -and $RetryCount -lt $MaxRetries) {
        try {
            $ApiResponse = Invoke-RestMethod -Uri $Uri -Method Post -Headers @{ "Content-Type" = "application/json; charset=utf-8" } -Body $BodyBytes -TimeoutSec 25
            $RawText = $ApiResponse.candidates[0].content.parts[0].text
            
            # Parse JSON từ AI
            $Analysis = $RawText | ConvertFrom-Json
            $Analysis | Add-Member -MemberType NoteProperty -Name "AnalyzedAt" -Value (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            $Success = $true
        } catch {
            $RetryCount++
            Write-Log "Lỗi khi gọi API Gemini phân tích tin tức (Lần thử $RetryCount/$MaxRetries): $_" "WARNING"
            
            # Log chi tiết phản hồi lỗi nếu có
            if ($_.Exception -and $_.Exception.Response) {
                try {
                    $Response = $_.Exception.Response
                    $StreamMethod = $Response.GetType().GetMethod("GetResponseStream")
                    if ($null -ne $StreamMethod) {
                        $Reader = New-Object System.IO.StreamReader($Response.GetResponseStream())
                        $ErrorBody = $Reader.ReadToEnd()
                        Write-Log "Chi tiết lỗi từ API: $ErrorBody" "WARNING"
                    } else {
                        Write-Log "Chi tiết phản hồi lỗi: $($Response.ToString())" "WARNING"
                    }
                } catch {}
            }

            if ($RetryCount -lt $MaxRetries) {
                # Giãn cách thời gian tăng dần (5s, 10s...) để chờ máy chủ Google ổn định trở lại
                $SleepSecs = $RetryCount * 5
                Write-Log "Thử lại sau $SleepSecs giây..." "INFO"
                Start-Sleep -Seconds $SleepSecs
            }
        }
    }
    return $Analysis
}

# Tạo Báo cáo Phân tích Tổng hợp Hàng ngày
function Generate-DailyReport {
    Write-Log "Bắt đầu tạo Báo cáo Phân tích Tổng hợp hàng ngày..." "INFO"
    $ResultsFile = Join-Path $ScriptDir "data/analysis_results.json"
    $ReportFile = Join-Path $ScriptDir "data/daily_report.md"

    if (-not (Test-Path $ResultsFile)) {
        Write-Log "Không tìm thấy dữ liệu để tổng hợp báo cáo." "WARNING"
        return
    }

    $Results = Get-Content -Path $ResultsFile -Raw | ConvertFrom-Json
    if ($Results.Count -eq 0) {
        Write-Log "Dữ liệu trống, không thể tạo báo cáo." "WARNING"
        return
    }

    # Lấy 15 tin mới nhất để làm báo cáo
    $LatestItems = $Results | Sort-Object -Property AnalyzedAt -Descending | Select-Object -First 15

    $TinTucText = ""
    foreach ($Item in $LatestItems) {
        $AffectedTickersList = @()
        if ($Item.AffectedTickers) {
            foreach ($TickerObj in $Item.AffectedTickers) {
                $AffectedTickersList += "$($TickerObj.Ticker) ($($TickerObj.ImpactType): $($TickerObj.Reasoning))"
            }
        }
        
        $TinTucText += @"
- Tiêu đề: $($Item.Title)
  Nguồn: $($Item.Source)
  Ngày phân tích: $($Item.AnalyzedAt)
  Tâm lý chung: $($Item.Sentiment) (Điểm tác động: $($Item.ImpactScore))
  Mã cổ phiếu bị tác động: $($AffectedTickersList -join '; ')
  Tóm tắt tác động thị trường: $($Item.MarketImpact)

"@
    }

    # Đọc API Key
    $Config = Get-Content -Path $ConfigFile -Raw | ConvertFrom-Json
    $ApiKey = $Config.GeminiApiKey
    if ($ApiKey -eq "YOUR_GEMINI_API_KEY" -or [string]::IsNullOrEmpty($ApiKey)) {
        $ApiKey = $env:GEMINI_API_KEY
    }

    $Prompt = @"
Bạn là một chuyên gia phân tích tài chính vĩ mô và chứng khoán cao cấp tại Việt Nam.
Hãy lập một "BÁO CÁO PHÂN TÍCH TỔNG HỢP & DỰ BÁO THỊ TRƯỜNG CHỨNG KHOÁN" chi tiết dựa trên danh sách các tin tức đã quét và phân tích sơ bộ sau đây:

$TinTucText

YÊU CẦU CẤU TRÚC VÀ PHƯƠNG PHÁP BÁO CÁO (VIẾT CHI TIẾT, KHÔNG TÓM TẮT SƠ SÀI):

## TÓM TẮT TÂM LÝ THỊ TRƯỜNG CHUNG (OVERVIEW)
- Nhận định ngắn về điểm số tâm lý thị trường chung dựa trên tổng quan điểm số của các tin tức đầu vào. Đánh giá trạng thái chung (Tích cực, Tiêu cực hay Trung lập).

## BƯỚC 1: SÀNG LỌC & XÁC ĐỊNH ĐỘ TRỌNG YẾU (SCREENING)
- Liệt kê và phân tích rõ các tin nào thực sự có tác động mạnh (Trọng yếu) đến ngành hoặc giá cổ phiếu, lý giải tại sao. Loại bỏ các tin tức PR quảng cáo mang tính chất nhiễu. Xác định mức độ trọng yếu (Cao / Trung bình / Thấp) cho từng tin chính.

## BƯỚC 2: PHÂN TÍCH CHUYÊN SÂU THEO NGÀNH (SECTOR ANALYSIS - KHUNG ĐẦY ĐỦ)
- Trình bày rõ ràng theo NGÀNH (mỗi ngành một mục lớn, ví dụ: Bất động sản, Chứng khoán, Ngân hàng, Thép, Năng lượng, Vĩ mô...).
- Trong mỗi ngành, sắp xếp các tin tức có mức độ tác động mạnh lên đầu tiên.
- Với mỗi tin tức lớn, phân tích đầy đủ các lớp sau:
  + Bản chất sự kiện: Nêu rõ các số liệu kinh tế vĩ mô hoặc số liệu doanh nghiệp (các con số, sự kiện phải lấy từ nguồn của danh sách tin đầu vào, tuyệt đối không bịa số liệu).
  + Tác động vĩ mô / ngành: Phân tích kỹ cơ chế truyền dẫn tác động lên ngành và lý giải nguyên nhân tăng/giảm.
  + Tác động trực tiếp lên giá cổ phiếu của các mã cụ thể (nêu rõ các mã bị ảnh hưởng trực tiếp như VIX, PDR, HPG, SSI, v.v.).
- Sử dụng BẢNG số liệu đối chiếu khi so sánh nhiều mã cổ phiếu hoặc nhiều nguồn số liệu khác nhau để báo cáo trông chuyên nghiệp, dễ so sánh.

## RÀNG BUỘC PHÁP LÝ & AN TOÀN
- KHÔNG tự bịa số liệu hay mã cổ phiếu không liên quan. Thiếu dữ kiện phải ghi rõ "chưa xác nhận / chưa có số liệu".
- Đầu ra trả về dưới dạng Markdown chuẩn, trình bày sạch sẽ, trực quan, chuyên nghiệp, sử dụng biểu tượng emoji phù hợp để tăng tính sinh động.
"@

    $Uri = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=$ApiKey"
    $RequestBody = @{
        contents = @(
            @{
                parts = @(
                    @{ text = $Prompt }
                )
            }
        )
    } | ConvertTo-Json -Depth 5

    $Bytes = [System.Text.Encoding]::UTF8.GetBytes($RequestBody)

    $MaxRetries = 3
    $RetryCount = 0
    $Success = $false
    $ReportMarkdown = ""

    while (-not $Success -and $RetryCount -lt $MaxRetries) {
        try {
            $Response = Invoke-RestMethod -Uri $Uri -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $Bytes -TimeoutSec 50
            $ReportMarkdown = $Response.candidates[0].content.parts[0].text
            if ($null -ne $ReportMarkdown -and $ReportMarkdown.Trim() -ne "") {
                $Success = $true
            }
        }
        catch {
            $RetryCount++
            Write-Log "Lỗi khi gọi API Gemini tạo báo cáo (Lần thử $RetryCount/$MaxRetries): $_" "WARNING"
            
            # Log chi tiết phản hồi lỗi nếu có
            if ($_.Exception -and $_.Exception.Response) {
                try {
                    $Response = $_.Exception.Response
                    $StreamMethod = $Response.GetType().GetMethod("GetResponseStream")
                    if ($null -ne $StreamMethod) {
                        $Reader = New-Object System.IO.StreamReader($Response.GetResponseStream())
                        $ErrorBody = $Reader.ReadToEnd()
                        Write-Log "Chi tiết phản hồi lỗi từ API: $ErrorBody" "WARNING"
                    } else {
                        Write-Log "Chi tiết phản hồi lỗi: $($Response.ToString())" "WARNING"
                    }
                } catch {}
            }

            if ($RetryCount -lt $MaxRetries) {
                $SleepSecs = $RetryCount * 5
                Write-Log "Thử lại sau $SleepSecs giây..." "INFO"
                Start-Sleep -Seconds $SleepSecs
            }
        }
    }

    if ($Success) {
        [System.IO.File]::WriteAllText($ReportFile, $ReportMarkdown, [System.Text.Encoding]::UTF8)
        Write-Log "Đã tạo thành công Báo cáo Phân tích Tổng hợp hàng ngày tại $ReportFile!" "SUCCESS"
    } else {
        Write-Log "Không thể tạo báo cáo tổng hợp sau $MaxRetries lần thử." "ERROR"
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
            
            # Delay để tránh rate limit (Gemini Free Tier giới hạn 15 RPM)
            Start-Sleep -Seconds 6
        } else {
            Write-Log "Phân tích thất bại cho tin: '$($Item.Title)'. Sẽ thử lại ở phiên sau." "WARNING"
        }
    }

    Write-Log "Hoàn thành quét chu kỳ này. Đã xử lý $ProcessedCount/$($AllNewItems.Count) tin mới." "SUCCESS"
    
    # Tạo Báo cáo Phân tích Tổng hợp hàng ngày
    Generate-DailyReport
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
