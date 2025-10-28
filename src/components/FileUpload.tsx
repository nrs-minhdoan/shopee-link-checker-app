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
  const [currentProgress, setCurrentProgress] = useState({
    current: 0,
    total: 0,
  });
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Enhanced Shopee ID extraction supporting multiple URL formats
  const extractShopeeIds = (
    url: string
  ): { shopId: string; itemId: string; country: string } | null => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;
      const searchParams = urlObj.searchParams;

      // Extract country from hostname with updated mappings
      let country = "vn"; // default
      if (hostname.includes(".sg")) country = "sg";
      else if (hostname.includes(".my")) country = "com.my";
      else if (hostname.includes(".ph")) country = "ph";
      else if (hostname.includes(".th")) country = "co.th";
      else if (hostname.includes(".tw")) country = "tw";
      else if (hostname.includes(".id")) country = "co.id";
      else if (hostname.includes(".com.br")) country = "com.br";
      else if (hostname.includes(".mx")) country = "com.mx";
      else if (hostname.includes(".co")) country = "com.co";
      else if (hostname.includes(".cl")) country = "cl";
      else if (hostname.includes(".com.hk")) country = "com.hk";

      // Try multiple extraction patterns
      let shopId: string | null = null;
      let itemId: string | null = null;

      // Pattern 1: Modern format /product-name-i.{shopId}.{itemId}
      let match = pathname.match(/-i\.(\d+)\.(\d+)/);
      if (match) {
        shopId = match[1];
        itemId = match[2];
      }

      // Pattern 2: Alternative format /product-{itemId}-i.{shopId}
      if (!shopId || !itemId) {
        match = pathname.match(/[^/]+-(\d+)-i\.(\d+)/);
        if (match) {
          itemId = match[1];
          shopId = match[2];
        }
      }

      // Pattern 3: Direct shop/item format /shop/{shopId}/item/{itemId}
      if (!shopId || !itemId) {
        match = pathname.match(/shop\/(\d+)\/item\/(\d+)/);
        if (match) {
          shopId = match[1];
          itemId = match[2];
        }
      }

      // Pattern 4: URL parameters
      if (!shopId || !itemId) {
        shopId = searchParams.get("shop_id") || searchParams.get("shopid");
        itemId = searchParams.get("item_id") || searchParams.get("itemid");
      }

      // Pattern 5: Hash-based format (mobile apps)
      if (!shopId || !itemId) {
        const hash = urlObj.hash;
        match = hash.match(/shopid=(\d+).*?itemid=(\d+)/);
        if (match) {
          shopId = match[1];
          itemId = match[2];
        }
      }

      if (shopId && itemId) {
        console.log(
          `🔍 Extracted Shopee IDs: shop=${shopId}, item=${itemId}, country=${country}`
        );
        return {
          shopId: shopId,
          itemId: itemId,
          country: country,
        };
      }

      console.warn(`⚠️ Could not extract Shopee IDs from URL: ${url}`);
      return null;
    } catch (error: any) {
      console.error(`❌ Error parsing Shopee URL: ${url}`, error.message);
      return null;
    }
  };

  // Check product using updated Shopee API endpoints with rate limiting and retry
  const checkShopeeAPI = async (
    shopId: string,
    itemId: string,
    country: string,
    retryCount = 0
  ): Promise<boolean | null> => {
    const itemKey = `${shopId}-${itemId}`;
    const maxRetries = 3;

    // Skip if already checked
    if (checkedItems.has(itemKey)) {
      console.log(`Item ${itemKey} already checked, skipping...`);
      return null;
    }

    try {
      // Rate limiting: Wait between requests (3-5 seconds for better reliability)
      const waitTime = 3000 + Math.random() * 2000; // 3-5 seconds random
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Available API endpoints - we'll randomly pick one to minimize API calls
      const availableApiUrls = [
        // Modern GraphQL-style endpoint (most reliable)
        `https://shopee.${country}/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`,
        // Product detail API (newer)
        `https://shopee.${country}/api/v4/product/get_shop_info?shopid=${shopId}&itemid=${itemId}`,
        // Search API to check if product exists
        `https://shopee.${country}/api/v4/search/search_items?itemid=${itemId}&shopid=${shopId}&limit=1`,
        // Legacy fallback
        `https://shopee.${country}/api/v2/item/get?itemid=${itemId}&shopid=${shopId}`,
      ];

      // Generate safe headers without undefined values (reusable)
      const safeHeaders: Record<string, string> = {};

      // Randomly select one API endpoint to minimize rate limiting
      const randomIndex = Math.floor(Math.random() * availableApiUrls.length);
      const selectedApiUrl = availableApiUrls[randomIndex];

      console.log(
        `🎯 Using optimized API endpoint ${randomIndex + 1}/4: ${
          selectedApiUrl.split("/api/")[1].split("?")[0]
        }`
      );

      // Try the selected API endpoint
      try {
        const response = await axios.get(selectedApiUrl, {
          headers: safeHeaders,
          timeout: 20000,
          withCredentials: false,
          validateStatus: (status) => status >= 200 && status < 500, // Allow more status codes
        });

        if (response.status === 200 && response.data) {
          // Mark as checked
          setCheckedItems((prev) => new Set(prev).add(itemKey));

          // Handle different response formats from updated APIs
          let item = null;

          // Try different response structures
          if (response.data.item) {
            item = response.data.item;
          } else if (response.data.data?.item) {
            item = response.data.data.item;
          } else if (
            response.data.data?.items &&
            response.data.data.items.length > 0
          ) {
            item = response.data.data.items[0];
          } else if (response.data.items && response.data.items.length > 0) {
            item = response.data.items[0];
          }

          if (item) {
            // Updated validation logic based on latest API responses
            const exists =
              item.itemid &&
              !item.is_deleted &&
              !item.deleted &&
              (item.item_status === 1 ||
                item.status === 1 ||
                item.item_status === undefined) &&
              (item.stock === undefined || item.stock > 0) &&
              (item.raw_discount === undefined || item.raw_discount >= 0) &&
              !item.is_adult_product;

            console.log(
              `✅ Optimized API check for ${itemKey}: ${
                exists ? "EXISTS" : "NOT AVAILABLE"
              }`
            );
            console.log(
              `📊 Item details: status=${
                item.item_status || item.status
              }, stock=${item.stock}, deleted=${
                item.is_deleted || item.deleted
              }`
            );
            return exists;
          }
        } else if (response.status === 404 || response.status === 410) {
          // Product definitely doesn't exist
          setCheckedItems((prev) => new Set(prev).add(itemKey));
          console.log(`❌ Product ${itemKey} not found (${response.status})`);
          return false;
        }
      } catch (apiError: any) {
        console.warn(
          `Selected API failed:`,
          apiError.response?.status,
          apiError.message
        );

        // If the selected API fails and we have retries left, try a different random API
        if (retryCount < maxRetries) {
          // Remove the failed API from available options for retry
          const retryApiUrls = availableApiUrls.filter(
            (url) => url !== selectedApiUrl
          );
          if (retryApiUrls.length > 0) {
            const retryIndex = Math.floor(Math.random() * retryApiUrls.length);
            const retryApiUrl = retryApiUrls[retryIndex];

            console.log(
              `🔄 Retrying with different API: ${
                retryApiUrl.split("/api/")[1].split("?")[0]
              }`
            );

            try {
              const retryResponse = await axios.get(retryApiUrl, {
                headers: safeHeaders,
                timeout: 20000,
                withCredentials: false,
                validateStatus: (status) => status >= 200 && status < 500,
              });

              if (retryResponse.status === 200 && retryResponse.data) {
                setCheckedItems((prev) => new Set(prev).add(itemKey));

                let item = null;
                if (retryResponse.data.item) {
                  item = retryResponse.data.item;
                } else if (retryResponse.data.data?.item) {
                  item = retryResponse.data.data.item;
                } else if (
                  retryResponse.data.data?.items &&
                  retryResponse.data.data.items.length > 0
                ) {
                  item = retryResponse.data.data.items[0];
                } else if (
                  retryResponse.data.items &&
                  retryResponse.data.items.length > 0
                ) {
                  item = retryResponse.data.items[0];
                }

                if (item) {
                  const exists =
                    item.itemid &&
                    !item.is_deleted &&
                    !item.deleted &&
                    (item.item_status === 1 ||
                      item.status === 1 ||
                      item.item_status === undefined) &&
                    (item.stock === undefined || item.stock > 0) &&
                    (item.raw_discount === undefined ||
                      item.raw_discount >= 0) &&
                    !item.is_adult_product;

                  console.log(
                    `✅ Retry API success for ${itemKey}: ${
                      exists ? "EXISTS" : "NOT AVAILABLE"
                    }`
                  );
                  return exists;
                }
              } else if (
                retryResponse.status === 404 ||
                retryResponse.status === 410
              ) {
                setCheckedItems((prev) => new Set(prev).add(itemKey));
                console.log(
                  `❌ Product ${itemKey} not found on retry (${retryResponse.status})`
                );
                return false;
              }
            } catch (retryError: any) {
              console.warn(
                `Retry API also failed:`,
                retryError.response?.status,
                retryError.message
              );
            }
          }
        }
      }

      // If primary API failed and we haven't exhausted retries, try with exponential backoff
      if (retryCount < maxRetries) {
        const backoffTime = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.log(
          `🔄 Retrying optimized API check for ${itemKey} (${
            retryCount + 1
          }/${maxRetries}) in ${backoffTime}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffTime));
        return await checkShopeeAPI(shopId, itemId, country, retryCount + 1);
      }

      // Mark as checked even if failed
      setCheckedItems((prev) => new Set(prev).add(itemKey));
      return null; // Signal to use fallback method
    } catch (error: any) {
      console.warn(`Shopee API check failed for ${itemKey}:`, error.message);

      // Mark as checked to avoid infinite retry
      setCheckedItems((prev) => new Set(prev).add(itemKey));
      return null; // Signal to use fallback method
    }
  };

  // Enhanced fallback page check with better detection
  const checkProductPage = async (link: string): Promise<boolean> => {
    try {
      // First try HEAD request for quick check
      try {
        const headResponse = await axios.head(link, {
          timeout: 15000,
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 500,
        });

        if (headResponse.status >= 200 && headResponse.status < 400) {
          return true;
        }
      } catch (headError: any) {
        console.log(`HEAD request failed, trying GET: ${headError.message}`);
      }

      // Fallback to GET request with content inspection
      const response = await axios.get(link, {
        timeout: 20000,
        maxRedirects: 5,
        responseType: "text",
        validateStatus: (status) => status >= 200 && status < 500,
      });

      if (response.status >= 200 && response.status < 400) {
        const content = response.data;

        // Check for common indicators that product doesn't exist
        const notFoundIndicators = [
          "product not found",
          "sản phẩm không tồn tại",
          "page not found",
          "trang không tồn tại",
          "item has been deleted",
          "sản phẩm đã bị xóa",
          "shop is closed",
          "cửa hàng đã đóng",
          "error-page",
          "not-found-page",
          "product-not-found",
        ];

        const contentLower = content.toLowerCase();
        const hasNotFoundIndicator = notFoundIndicators.some((indicator) =>
          contentLower.includes(indicator)
        );

        if (hasNotFoundIndicator) {
          console.log(`🚫 Product page indicates item doesn't exist`);
          return false;
        }

        // Check for positive indicators that product exists
        const existsIndicators = [
          "add to cart",
          "thêm vào giỏ hàng",
          "buy now",
          "mua ngay",
          "price",
          "giá",
          "product-rating",
          "shop-name",
        ];

        const hasExistsIndicator = existsIndicators.some((indicator) =>
          contentLower.includes(indicator)
        );

        if (hasExistsIndicator) {
          console.log(`✅ Product page indicates item exists`);
          return true;
        }

        // If no clear indicators, assume accessible page means product exists
        return content.length > 1000; // Page has substantial content
      }

      return false;
    } catch (error: any) {
      console.error(`Page check failed: ${error.message}`);
      return false;
    }
  };

  const checkLink = async (
    link: string,
    index: number,
    total: number
  ): Promise<boolean> => {
    try {
      // Update progress
      setCurrentProgress({ current: index + 1, total });

      console.log(`🔍 Checking product ${index + 1}/${total}: ${link}`);

      // First try to use Shopee API for accurate results
      const shopeeIds = extractShopeeIds(link);
      if (shopeeIds) {
        console.log(
          `📡 Using Shopee API for ${shopeeIds.shopId}/${shopeeIds.itemId}`
        );
        const apiResult = await checkShopeeAPI(
          shopeeIds.shopId,
          shopeeIds.itemId,
          shopeeIds.country
        );

        if (apiResult !== null) {
          return apiResult;
        }

        // API failed or returned null, use fallback
        console.log(`⚠️ API check inconclusive, using page check fallback`);
      }

      // Fallback to page check if API fails or can't extract IDs
      console.log(`🌐 Falling back to page check for: ${link}`);
      const pageResult = await checkProductPage(link);
      console.log(
        `📄 Page check result: ${pageResult ? "ACCESSIBLE" : "NOT ACCESSIBLE"}`
      );

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
      if (columnKey.startsWith("__EMPTY_")) {
        const num = parseInt(columnKey.replace("__EMPTY_", ""));
        return num + 1; // __EMPTY_0 maps to column B (index 1), __EMPTY_1 to C (index 2), etc.
      }
      return 3; // Default to column D (index 3) for __EMPTY_3
    };

    // Find the actual column key for "Link tin bài đăng bán sản phẩm"
    const sampleRow = data && data.length > 0 ? data[0] : {};
    let linkKey = Object.keys(sampleRow).find(
      (k) =>
        k &&
        String(k).trim().toLowerCase() === linkColumnDisplayName.toLowerCase()
    );

    // Fallback: try to find a key that contains "link" and product-related keywords
    if (!linkKey) {
      const lowered = Object.keys(sampleRow).map((k) =>
        k ? String(k).toLowerCase() : ""
      );
      const findIndex = lowered.findIndex(
        (k) =>
          k.includes("link") &&
          (k.includes("bán") || k.includes("sản") || k.includes("product"))
      );
      if (findIndex >= 0) linkKey = Object.keys(sampleRow)[findIndex];
    }

    // Final fallback to __EMPTY_2 if nothing found
    if (!linkKey) linkKey = "__EMPTY_2";

    console.log(`Using column key: "${linkKey}" for Shopee links`);
    console.log(`Status will be written to column: "${statusColumnKey}"`);

    // Get the original worksheet to preserve formatting
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const range = XLSX.utils.decode_range(firstSheet["!ref"] || "A1");
    const statusColumnIndex = getColumnIndex(statusColumnKey);

    // Filter only Shopee links to process
    const shopeeLinks = data.filter((row, index) => {
      const link = row[linkKey as string];
      return (
        link &&
        typeof link === "string" &&
        link.toLowerCase().includes("shopee")
      );
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
      if (
        link &&
        typeof link === "string" &&
        link.toLowerCase().includes("shopee")
      ) {
        const shopeeIndex = shopeeLinks.findIndex((r) => r === row);
        const exists = await checkLink(link, shopeeIndex, shopeeLinks.length);
        statusValue = exists ? "x" : "";
      }

      // Update JSON data
      newRow[statusColumnKey] = statusValue;

      // Update the original worksheet cell to preserve formatting
      // +1 because we need to account for header row (JSON data starts from row 0, but Excel rows start from 1)
      const cellAddress = XLSX.utils.encode_cell({
        r: i + 1,
        c: statusColumnIndex,
      });

      // Create or update cell while preserving any existing formatting
      if (!firstSheet[cellAddress]) {
        firstSheet[cellAddress] = { t: "s", v: statusValue };
      } else {
        // Preserve existing cell properties (formatting) and only update value
        firstSheet[cellAddress].v = statusValue;
      }

      processedData.push(newRow);
    }

    // Update the worksheet range to include the status column if needed
    if (statusColumnIndex > range.e.c) {
      range.e.c = statusColumnIndex;
      firstSheet["!ref"] = XLSX.utils.encode_range(range);
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
          <p>🔍 Đang kiểm tra sản phẩm Shopee bằng API mới nhất...</p>
          {currentProgress.total > 0 && (
            <div className="progress-info">
              <p>
                Tiến độ: {currentProgress.current}/{currentProgress.total} sản
                phẩm
              </p>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${
                      (currentProgress.current / currentProgress.total) * 100
                    }%`,
                  }}
                ></div>
              </div>
              <p>
                ⏱️ Đang áp dụng rate limiting (3-5s/request) để tránh bị chặn
              </p>
            </div>
          )}
          <p>
            📊 Kết quả sẽ được điền vào cột __EMPTY_3 với định dạng Excel được
            giữ nguyên.
          </p>
          <p>
            🎯 Sử dụng random API selection - chỉ 1 API call/sản phẩm để tối ưu
            rate limit.
          </p>
          <p>
            🔄 Smart retry với exponential backoff và fallback sang page
            checking.
          </p>
          <p>⚡ Quá trình được tối ưu để nhanh hơn và ít bị chặn hơn.</p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
