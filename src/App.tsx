import React, { useState } from "react";
import FileUpload from "./components/FileUpload";
import ResultDownload from "./components/ResultDownload";

import "./App.css";

const App: React.FC = () => {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleResultsUpdate = (newResults: any) => {
    setResults(newResults);
  };

  const handleLoadingChange = (isLoading: boolean) => {
    setLoading(isLoading);
  };

  return (
    <div className="App">
      <h1>Shopee Link Checker</h1>
      <FileUpload 
        onResultsReady={handleResultsUpdate} 
        onLoadingChange={handleLoadingChange}
      />
      {results && !loading && <ResultDownload results={results} />}
    </div>
  );
};

export default App;
