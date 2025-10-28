import React from "react";
import * as XLSX from 'xlsx';

import './result-download.css';

interface ResultDownloadProps {
  results: { processedData: any[], workbook: XLSX.WorkBook };
}

const ResultDownload: React.FC<ResultDownloadProps> = ({ results }) => {
  const handleDownload = () => {
    try {
      // Use the original workbook to preserve all formatting (colors, fonts, sizes, etc.)
      if (results.workbook && results.workbook.SheetNames && results.workbook.SheetNames.length > 0) {
        // The workbook already contains the updated data with preserved formatting
        XLSX.writeFile(results.workbook, 'shopee_link_results.xlsx');
      } else {
        // Fallback: create a new workbook if original is not available
        const newWorkbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(results.processedData);
        XLSX.utils.book_append_sheet(newWorkbook, worksheet, 'Sheet1');
        XLSX.writeFile(newWorkbook, 'shopee_link_results.xlsx');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Error creating Excel file. Please try again.');
    }
  };

  const getCheckedLinksData = () => {
    const statusColumnKey = "__EMPTY_3";
    
    // Find the link column using the same logic as in FileUpload
    const sampleRow = results.processedData && results.processedData.length > 0 ? results.processedData[0] : {};
    const linkColumnDisplayName = "Link tin bài đăng bán sản phẩm";
    
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

    // Final fallback to __EMPTY_2
    if (!linkKey) linkKey = "__EMPTY_2";

    // Count all Shopee links that were actually checked (have status column value)
    const checkedRows = results.processedData.filter(row => {
      const link = row[linkKey];
      const hasShopeeLink = link && typeof link === 'string' && link.toLowerCase().includes('shopee');
      const hasStatus = row[statusColumnKey] !== undefined && row[statusColumnKey] !== null;
      return hasShopeeLink && hasStatus;
    });

    // Count links that exist (have 'x' in status column)
    const existingLinks = checkedRows.filter(row => row[statusColumnKey] === 'x').length;
    
    return {
      totalChecked: checkedRows.length,
      existing: existingLinks,
      notExisting: checkedRows.length - existingLinks
    };
  };

  const linksData = getCheckedLinksData();

  return (
    <div className="result-download">
      <h2>Kết quả kiểm tra link</h2>
      <div className="results-summary">
        <p>Tổng số link Shopee đã kiểm tra: {linksData.totalChecked}</p>
        <p>Số link còn tồn tại: {linksData.existing}</p>
        <p>Số link không tồn tại: {linksData.notExisting}</p>
      </div>
      <button onClick={handleDownload} className="download-btn">
        Tải xuống file Excel
      </button>
    </div>
  );
};

export default ResultDownload;
