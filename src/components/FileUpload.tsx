import React, { useState } from "react";
import * as XLSX from "xlsx";
import axios from "axios";

import "./file-upload.css";

interface ExcelRow {
  [key: string]: any;
}

const FileUpload: React.FC<{
  onResultsReady: (results: any) => void;
  onLoadingChange?: (loading: boolean) => void;
}> = ({ onResultsReady, onLoadingChange }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleFileUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    onLoadingChange?.(true);

    try {
      const { data, workbook } = await readExcelFile(file);
      const results = await processExcelData(data, workbook);
      onResultsReady(results);
    } catch (err) {
      setError("Lỗi khi xử lý file hoặc kiểm tra links.");
      console.error("Error:", err);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  };

  const readExcelFile = (
    file: File
  ): Promise<{ data: ExcelRow[]; workbook: XLSX.WorkBook }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const binaryStr = e.target?.result;
        const workbook = XLSX.read(binaryStr, { type: "binary" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet) as ExcelRow[];
        resolve({ data: jsonData, workbook });
      };
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    });
  };



  // Rate limiting variables
  const [currentProgress, setCurrentProgress] = useState({ current: 0, total: 0 });
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Extract Shopee IDs from URL
  const extractShopeeIds = (url: string): { shopId: string; itemId: string; country: string } | null => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;
      
      // Extract country from hostname
      let country = 'vn'; // default
      if (hostname.includes('.sg')) country = 'sg';
      else if (hostname.includes('.my')) country = 'com.my';
      else if (hostname.includes('.ph')) country = 'ph';
      else if (hostname.includes('.th')) country = 'co.th';
      else if (hostname.includes('.tw')) country = 'tw';
      else if (hostname.includes('.id')) country = 'co.id';
      
      // Extract shopId and itemId from pathname
      // Pattern: /product-name-i.{shopId}.{itemId}
      const match = pathname.match(/-i\.(\d+)\.(\d+)/);
      if (match) {
        return {
          shopId: match[1],
          itemId: match[2],
          country: country
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  };

  // Check product using Shopee API with rate limiting and retry
  const checkShopeeAPI = async (shopId: string, itemId: string, country: string, retryCount = 0): Promise<boolean | null> => {
    const itemKey = `${shopId}-${itemId}`;
    const maxRetries = 2;
    
    // Skip if already checked
    if (checkedItems.has(itemKey)) {
      console.log(`Item ${itemKey} already checked, skipping...`);
      return null;
    }
    
    try {
      // Rate limiting: Wait between requests (2-3 seconds to be safe)
      const waitTime = 2000 + Math.random() * 1000; // 2-3 seconds random
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Try different API endpoints and approaches
      const apiUrls = [
        `https://shopee.${country}/api/v2/item/get?itemid=${itemId}&shopid=${shopId}`,
        `https://shopee.${country}/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`,
      ];
      
      for (const apiUrl of apiUrls) {
        try {
          const response = await axios.get(apiUrl, {
            headers: {
              'Accept': '*/*',
              'Accept-Language': 'en-US,en;q=0.5',
              'X-Shopee-Language': 'en',
              'X-Requested-With': 'XMLHttpRequest',
              'X-API-SOURCE': 'pc',
              'Referer': `https://shopee.${country}/`,
              'Cache-Control': 'no-cache',
            },
            timeout: 15000,
            withCredentials: false,
          });

          if (response.status === 200 && response.data) {
            // Mark as checked
            setCheckedItems(prev => new Set(prev).add(itemKey));
            
            // Handle different response formats
            const item = response.data.item || response.data.data?.item;
            if (item) {
              const exists = item.itemid && !item.is_deleted && 
                           (item.item_status === 1 || item.status === 1) &&
                           item.stock > 0;
              console.log(`✅ API check for ${itemKey}: ${exists ? 'EXISTS' : 'NOT AVAILABLE'}`);
              return exists;
            }
          }
        } catch (apiError: any) {
          console.warn(`API URL ${apiUrl} failed:`, apiError.message);
          continue;
        }
      }
      
      // If all API URLs failed, try retry
      if (retryCount < maxRetries) {
        console.log(`Retrying API check for ${itemKey} (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait longer before retry
        return await checkShopeeAPI(shopId, itemId, country, retryCount + 1);
      }
      
      // Mark as checked even if failed
      setCheckedItems(prev => new Set(prev).add(itemKey));
      return null; // Signal to use fallback method
      
    } catch (error: any) {
      console.warn(`Shopee API check failed for ${itemKey}:`, error.message);
      
      // Mark as checked to avoid infinite retry
      setCheckedItems(prev => new Set(prev).add(itemKey));
      return null; // Signal to use fallback method
    }
  };

  // Fallback page check
  const checkProductPage = async (link: string): Promise<boolean> => {
    try {
      const response = await axios.head(link, {
        timeout: 10000,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        maxRedirects: 3,
      });
      
      return response.status >= 200 && response.status < 400;
    } catch {
      return false;
    }
  };

  const checkLink = async (link: string, index: number, total: number): Promise<boolean> => {
    try {
      // Update progress
      setCurrentProgress({ current: index + 1, total });
      
      console.log(`🔍 Checking product ${index + 1}/${total}: ${link}`);
      
      // First try to use Shopee API for accurate results
      const shopeeIds = extractShopeeIds(link);
      if (shopeeIds) {
        console.log(`📡 Using Shopee API for ${shopeeIds.shopId}/${shopeeIds.itemId}`);
        const apiResult = await checkShopeeAPI(shopeeIds.shopId, shopeeIds.itemId, shopeeIds.country);
        
        if (apiResult !== null) {
          return apiResult;
        }
        
        // API failed or returned null, use fallback
        console.log(`⚠️ API check inconclusive, using page check fallback`);
      }
      
      // Fallback to page check if API fails or can't extract IDs
      console.log(`🌐 Falling back to page check for: ${link}`);
      const pageResult = await checkProductPage(link);
      console.log(`📄 Page check result: ${pageResult ? 'ACCESSIBLE' : 'NOT ACCESSIBLE'}`);
      
      return pageResult;
      
    } catch (error) {
      console.error("❌ Error checking Shopee link:", link, error);
      return false;
    }
  };

  const processExcelData = async (
    data: ExcelRow[],
    workbook: XLSX.WorkBook
  ): Promise<{ processedData: ExcelRow[]; workbook: XLSX.WorkBook }> => {
    const linkColumnDisplayName = "Link tin bài đăng bán sản phẩm";
    const statusColumnKey = "__EMPTY_3"; // Fixed column for status

    // Helper function to get column index from column key like __EMPTY_3
    const getColumnIndex = (columnKey: string): number => {
      if (columnKey.startsWith('__EMPTY_')) {
        const num = parseInt(columnKey.replace('__EMPTY_', ''));
        return num + 1; // __EMPTY_0 maps to column B (index 1), __EMPTY_1 to C (index 2), etc.
      }
      return 3; // Default to column D (index 3) for __EMPTY_3
    };

    // Find the actual column key for "Link tin bài đăng bán sản phẩm"
    const sampleRow = data && data.length > 0 ? data[0] : {};
    let linkKey = Object.keys(sampleRow).find(
      (k) => k && String(k).trim().toLowerCase() === linkColumnDisplayName.toLowerCase()
    );

    // Fallback: try to find a key that contains "link" and product-related keywords
    if (!linkKey) {
      const lowered = Object.keys(sampleRow).map((k) => (k ? String(k).toLowerCase() : ""));
      const findIndex = lowered.findIndex((k) => 
        k.includes("link") && (k.includes("bán") || k.includes("sản") || k.includes("product"))
      );
      if (findIndex >= 0) linkKey = Object.keys(sampleRow)[findIndex];
    }

    // Final fallback to __EMPTY_2 if nothing found
    if (!linkKey) linkKey = "__EMPTY_2";

    console.log(`Using column key: "${linkKey}" for Shopee links`);
    console.log(`Status will be written to column: "${statusColumnKey}"`);

    // Get the original worksheet to preserve formatting
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1');
    const statusColumnIndex = getColumnIndex(statusColumnKey);

    // Filter only Shopee links to process
    const shopeeLinks = data.filter((row, index) => {
      const link = row[linkKey as string];
      return link && typeof link === "string" && link.toLowerCase().includes("shopee");
    });

    console.log(`Found ${shopeeLinks.length} Shopee links to check`);
    
    // Process each row sequentially to respect rate limits
    const processedData = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const link = row[linkKey as string];
      const newRow = { ...row };

      let statusValue = "";

      // Check if the link exists and is a Shopee link
      if (link && typeof link === "string" && link.toLowerCase().includes("shopee")) {
        const shopeeIndex = shopeeLinks.findIndex(r => r === row);
        const exists = await checkLink(link, shopeeIndex, shopeeLinks.length);
        statusValue = exists ? "x" : "";
      }

      // Update JSON data
      newRow[statusColumnKey] = statusValue;
      
      // Update the original worksheet cell to preserve formatting
      // +1 because we need to account for header row (JSON data starts from row 0, but Excel rows start from 1)
      const cellAddress = XLSX.utils.encode_cell({ r: i + 1, c: statusColumnIndex });
      
      // Create or update cell while preserving any existing formatting
      if (!firstSheet[cellAddress]) {
        firstSheet[cellAddress] = { t: 's', v: statusValue };
      } else {
        // Preserve existing cell properties (formatting) and only update value
        firstSheet[cellAddress].v = statusValue;
      }

      processedData.push(newRow);
    }

    // Update the worksheet range to include the status column if needed
    if (statusColumnIndex > range.e.c) {
      range.e.c = statusColumnIndex;
      firstSheet['!ref'] = XLSX.utils.encode_range(range);
    }

    return { processedData, workbook };
  };

  return (
    <div className="file-upload">
      <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} />
      <button onClick={handleFileUpload} disabled={loading || !file}>
        {loading ? "Đang xử lý..." : "Tải lên và kiểm tra Links"}
      </button>
      {error && <div className="error">{error}</div>}
      {loading && (
        <div className="loading-info">
          <p>🔍 Đang kiểm tra sản phẩm Shopee bằng API...</p>
          {currentProgress.total > 0 && (
            <div className="progress-info">
              <p>Tiến độ: {currentProgress.current}/{currentProgress.total} sản phẩm</p>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(currentProgress.current / currentProgress.total) * 100}%` }}
                ></div>
              </div>
              <p>⏱️ Đang áp dụng rate limiting (2s/request) để tránh bị chặn</p>
            </div>
          )}
          <p>📊 Kết quả sẽ được điền vào cột __EMPTY_3 với định dạng Excel được giữ nguyên.</p>
          <p>🔄 Sử dụng Shopee API chính thức, fallback sang kiểm tra trang web nếu cần.</p>
          <p>⚠️ Quá trình này có thể mất vài phút để đảm bảo độ chính xác cao.</p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
