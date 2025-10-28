import React from "react";
import * as XLSX from 'xlsx';

import './result-download.css';

interface ResultDownloadProps {
  results: { processedData: any[], workbook: XLSX.WorkBook };
}

const ResultDownload: React.FC<ResultDownloadProps> = ({ results }) => {
  const handleDownload = () => {
    try {
      // Create a new workbook with the processed data
      const newWorkbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(results.processedData);
      
      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(newWorkbook, worksheet, 'Sheet1');
      
      // Generate Excel file and download
      XLSX.writeFile(newWorkbook, 'shopee_link_results.xlsx');
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Error creating Excel file. Please try again.');
    }
  };

  const countCheckedLinks = () => {
    const statusColumnName = "Tình trạng link SP (tính đến 4/11/2025)";
    return results.processedData.filter(row => row[statusColumnName] === 'x').length;
  };

  const countTotalLinks = () => {
    const linkColumnName = "Link tin bài đăng bán sản phẩm";
    return results.processedData.filter(row => 
      row[linkColumnName] && 
      typeof row[linkColumnName] === 'string' && 
      row[linkColumnName].includes('shopee')
    ).length;
  };

  return (
    <div className="result-download">
      <h2>Kết quả kiểm tra link</h2>
      <div className="results-summary">
        <p>Tổng số link Shopee: {countTotalLinks()}</p>
        <p>Số link còn tồn tại: {countCheckedLinks()}</p>
        <p>Số link không tồn tại: {countTotalLinks() - countCheckedLinks()}</p>
      </div>
      <button onClick={handleDownload} className="download-btn">
        Tải xuống file Excel
      </button>
    </div>
  );
};

export default ResultDownload;
