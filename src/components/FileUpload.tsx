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



  const checkLink = async (link: string): Promise<boolean> => {
    try {
      // Check if Shopee product page exists by making HTTP request
      console.log(`Checking Shopee product page: ${link}`);
      
      // Try HEAD request first (faster, doesn't download content)
      try {
        const response = await axios.head(link, {
          timeout: 15000,
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          },
          // Allow redirects (Shopee may redirect to login or other pages)
          maxRedirects: 5,
        });
        
        // Consider 200 and 3xx redirects as existing pages
        const isValid = response.status >= 200 && response.status < 400;
        console.log(`HEAD request - Status: ${response.status}, Valid: ${isValid}`);
        return isValid;
      } catch (headError) {
        console.warn('HEAD request failed, trying GET request...', headError);
        
        // Fallback to GET request if HEAD fails
        try {
          const response = await axios.get(link, {
            timeout: 15000,
            headers: {
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
            },
            maxRedirects: 5,
            // Don't download too much content, just enough to check if page exists
            maxContentLength: 50000, // 50KB limit
          });
          
          const isValid = response.status >= 200 && response.status < 400;
          
          // Additional check: ensure we got some HTML content (not just an error page)
          if (isValid && response.data) {
            const htmlContent = response.data.toString().toLowerCase();
            // Check if page contains typical Shopee elements or isn't an error page
            const hasShopeeContent = htmlContent.includes('shopee') || 
                                   htmlContent.includes('product') ||
                                   htmlContent.includes('item');
            const isErrorPage = htmlContent.includes('page not found') ||
                               htmlContent.includes('404') ||
                               htmlContent.includes('không tìm thấy') ||
                               htmlContent.includes('page does not exist');
            
            const finalResult = hasShopeeContent && !isErrorPage;
            console.log(`GET request - Status: ${response.status}, Has content: ${hasShopeeContent}, Is error: ${isErrorPage}, Final result: ${finalResult}`);
            return finalResult;
          }
          
          console.log(`GET request - Status: ${response.status}, Valid: ${isValid}`);
          return isValid;
        } catch (getError) {
          console.warn('GET request also failed:', getError);
          return false;
        }
      }
    } catch (error) {
      console.error("Error checking Shopee link:", link, error);
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

    // Process each row and update both JSON data and worksheet cells
    const processedData = await Promise.all(
      data.map(async (row, index) => {
        const link = row[linkKey as string];
        const newRow = { ...row };

        let statusValue = "";

        // Check if the link exists and is a Shopee link
        if (link && typeof link === "string" && link.toLowerCase().includes("shopee")) {
          console.log(`Checking link ${index + 1}/${data.length}: ${link}`);
          const exists = await checkLink(link);
          statusValue = exists ? "x" : "";
        }

        // Update JSON data
        newRow[statusColumnKey] = statusValue;
        
        // Update the original worksheet cell to preserve formatting
        // +1 because we need to account for header row (JSON data starts from row 0, but Excel rows start from 1)
        const cellAddress = XLSX.utils.encode_cell({ r: index + 1, c: statusColumnIndex });
        
        // Create or update cell while preserving any existing formatting
        if (!firstSheet[cellAddress]) {
          firstSheet[cellAddress] = { t: 's', v: statusValue };
        } else {
          // Preserve existing cell properties (formatting) and only update value
          firstSheet[cellAddress].v = statusValue;
        }

        return newRow;
      })
    );

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
          <p>Đang kiểm tra từng trang sản phẩm Shopee...</p>
          <p>Quá trình này có thể mất vài phút tùy thuộc vào số lượng link.</p>
          <p>Kết quả sẽ được điền vào cột __EMPTY_3 với định dạng Excel được giữ nguyên.</p>
          <p>Hệ thống sẽ truy cập trực tiếp vào từng link để kiểm tra tính khả dụng.</p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
