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

  const extractShopeeIds = (
    url: string
  ): { shopId: string; itemId: string; country: string } | null => {
    try {
      // Shopee URL formats:
      // https://shopee.vn/product-name-i.{shopId}.{itemId}
      // https://shopee.sg/product-name-i.{shopId}.{itemId}
      // https://shopee.com.my/product-name-i.{shopId}.{itemId}
      // etc.

      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      // Extract country from hostname
      let country = "vn"; // default
      if (hostname.includes(".sg")) country = "sg";
      else if (hostname.includes(".my")) country = "com.my";
      else if (hostname.includes(".ph")) country = "ph";
      else if (hostname.includes(".th")) country = "co.th";
      else if (hostname.includes(".tw")) country = "tw";
      else if (hostname.includes(".id")) country = "co.id";

      // Extract shopId and itemId from pathname
      // Pattern: /product-name-i.{shopId}.{itemId}
      const match = pathname.match(/-i\.(\d+)\.(\d+)/);
      if (match) {
        return {
          shopId: match[1],
          itemId: match[2],
          country: country,
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  };

  const checkShopeeAPI = async (
    shopId: string,
    itemId: string,
    country: string
  ): Promise<boolean> => {
    try {
      // Try local proxy server first (most reliable)
      try {
        const localProxyUrl = `http://localhost:3001/api/shopee/api/v2/item/get?itemid=${itemId}&shopid=${shopId}`;
        const response = await axios.get(localProxyUrl, {
          timeout: 10000,
        });

        if (response.status === 200 && response.data && response.data.item) {
          const item = response.data.item;
          return item.itemid && !item.is_deleted && item.item_status === 1;
        }
      } catch (localProxyError) {
        console.warn('Local proxy failed, trying public proxies...', localProxyError);
      }

      // Fallback to public CORS proxies
      const originalUrl = `https://shopee.${country}/api/v2/item/get?itemid=${itemId}&shopid=${shopId}`;
      const corsProxies = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(originalUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(originalUrl)}`,
      ];

      for (const proxyUrl of corsProxies) {
        try {
          const response = await axios.get(proxyUrl, {
            headers: {
              Accept: "*/*",
            },
            timeout: 15000,
          });

          let data = response.data;
          
          // Handle AllOrigins wrapper
          if (proxyUrl.includes('allorigins.win') && data.contents) {
            try {
              data = JSON.parse(data.contents);
            } catch (e) {
              continue;
            }
          }

          // Check if item exists and is available
          if (response.status === 200 && data && data.item) {
            const item = data.item;
            return item.itemid && !item.is_deleted && item.item_status === 1;
          }
        } catch (error) {
          console.warn(`CORS proxy ${proxyUrl} failed:`, error);
          continue;
        }
      }

      return false;
    } catch (error) {
      console.warn(`Shopee API check failed for ${shopId}/${itemId}:`, error);
      return false;
    }
  };

  const checkLink = async (link: string): Promise<boolean> => {
    try {
      // First try to use Shopee's internal API for more accurate results
      const shopeeIds = extractShopeeIds(link);
      if (shopeeIds) {
        const apiResult = await checkShopeeAPI(
          shopeeIds.shopId,
          shopeeIds.itemId,
          shopeeIds.country
        );
        if (apiResult !== null) {
          return apiResult;
        }
      }

            // Fallback to HTTP status check
      try {
        // Use HEAD request to check if link exists without downloading full content
        const response = await axios.head(link, {
          timeout: 10000,
        });
        console.log(link, response.status);
        return response.status === 200;
      } catch {
        try {
          // Fallback to GET request if HEAD fails
          const response = await axios.get(link, {
            timeout: 10000,
          });
          return response.status === 200;
        } catch {
          return false;
        }
      }
    } catch (error) {
      console.error("Error checking link:", link, error);
      return false;
    }
  };

  const processExcelData = async (
    data: ExcelRow[],
    workbook: XLSX.WorkBook
  ): Promise<{ processedData: ExcelRow[]; workbook: XLSX.WorkBook }> => {
    // const linkColumnName = "Link tin bài đăng bán sản phẩm";
    const statusColumnName = "Tình trạng link SP (tính đến 4/11/2025)";

    // Process each row
    const processedData = await Promise.all(
      data.map(async (row, index) => {
        const link = row.__EMPTY_2;

        // Create a copy of the row
        const newRow = { ...row };

        // Check if the link exists and is a Shopee link
        if (link && typeof link === "string" && link.includes("shopee")) {
          console.log(`Checking link ${index + 1}/${data.length}: ${link}`);
          const exists = await checkLink(link);

          // Fill status column with 'x' if link exists
          newRow[statusColumnName] = exists ? "x" : "";
        } else {
          // If no valid link, leave status empty
          newRow[statusColumnName] = "";
        }

        return newRow;
      })
    );

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
          <p>Đang kiểm tra từng link Shopee...</p>
          <p>Quá trình này có thể mất vài phút tùy thuộc vào số lượng link.</p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
