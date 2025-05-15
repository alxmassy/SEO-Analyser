import React, { useState } from 'react';
import axios from 'axios';
import './index.css'; 

// Helper component to display the status with color
const StatusIndicator = ({ status }) => {
  let className = '';
  switch (status) {
    case 'Pass':
      className = 'status-pass';
      break;
    case 'Warning':
      className = 'status-warning';
      break;
    case 'Fail':
      className = 'status-fail';
      break;
    default:
      className = 'status-unknown';
  }
  return <span className={`status-indicator ${className}`}>{status}</span>;
};

function App() {
  const [url, setUrl] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (event) => {
    setUrl(event.target.value);
    setAnalysisResult(null);
    setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setAnalysisResult(null);
    setError(null);

    try {
      // Ensure the URL starts with http:// or https://
      let formattedUrl = url;
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = `https://${formattedUrl}`; // Default to https if protocol is missing
      }

      const response = await axios.post('http://localhost:5000/analyze', { url: formattedUrl }); 
      setAnalysisResult(response.data);
      console.log("Analysis successful:", response.data);
    } catch (err) {
      console.error("Error during analysis:", err);
      const errorMessage = err.response && err.response.data && err.response.data.error
                           ? err.response.data.error
                           : 'Network error or server is down.';
      setError(errorMessage);
      setAnalysisResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>SEO Analyzer</h1>

      <form onSubmit={handleSubmit} className="url-form">
        <label htmlFor="urlInput">Enter Website URL:</label>
        <input
          id="urlInput"
          type="text"
          value={url}
          onChange={handleInputChange}
          placeholder="e.g., https://www.example.com"
          required
        />
        <button type="submit" disabled={!url || loading}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </form>

      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}

      {loading && (
        <div className="loading-message">
          Analyzing... Please wait.
        </div>
      )}

      {analysisResult && (
         <div className="analysis-results">
             <h2>Analysis Report for <a href={analysisResult.url} target="_blank" rel="noopener noreferrer">{analysisResult.url}</a></h2>

             {/* SEO Score Display */}
             <div className="seo-score">
                <h3>Overall SEO Score:</h3>
                <div className={`score-circle score-${Math.floor(analysisResult.score / 10) * 10}`}>
                    {analysisResult.score}
                </div>
             </div>


             {/* Detailed Report */}
             <h3>Detailed Report:</h3>
             {Object.keys(analysisResult.report).length > 0 ? (
                 <div className="report-details">
                     {/* Render each check */}
                     {Object.entries(analysisResult.report).map(([checkKey, checkData]) => (
                         <div key={checkKey} className="report-item">
                             <div className="item-header">
                                 {/* Capitalize first letter for display */}
                                 <h4>{checkKey.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase())}</h4>
                                 <StatusIndicator status={checkData.status} />
                             </div>
                             <p className="item-details">{checkData.details}</p>
                             {/* Optionally display content/length for meta tags */}
                             {checkKey === 'metaTitle' && checkData.content && <p className="item-content">Content: "{checkData.content}" (Length: {checkData.length})</p>}
                             {checkKey === 'metaDescription' && checkData.content && <p className="item-content">Content: "{checkData.content}" (Length: {checkData.length})</p>}
                         </div>
                     ))}
                 </div>
             ) : (
                 <p>No detailed report available.</p>
             )}

             {/* Recommendations */}
             <h3>Recommendations:</h3>
             {analysisResult.recommendations && analysisResult.recommendations.length > 0 ? (
                 <ul className="recommendations-list">
                     {analysisResult.recommendations.map((rec, index) => (
                         <li key={index}>{rec}</li>
                     ))}
                 </ul>
             ) : (
                 <p>No specific recommendations found.</p>
             )}
         </div>
      )}

    </div>
  );
}

export default App;