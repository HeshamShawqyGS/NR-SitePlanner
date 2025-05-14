// Sidebar Module - Reusable component for displaying data in a sidebar
const SidebarModule = {
  // Initialize the sidebar with configuration
  init(config = {}) {
    this.config = {
      id: config.id || 'app-sidebar',
      title: config.title || 'Network Rail Site Fit',
      logoPath: config.logoPath || '00-data/assets/DT_Logo.png',
      defaultMessage: config.defaultMessage || 'Click on a plot to view details.',
      hasControls: config.hasControls !== undefined ? config.hasControls : true,
      minDuration: config.minDuration || 5,
      maxDuration: config.maxDuration || 30,
      defaultDuration: config.defaultDuration || 15,
      ...config
    };
    
    // Create the sidebar if it doesn't exist
    this.createSidebar();
    
    // Set up event listeners if needed
    if (this.config.hasControls) {
      this.setupEventListeners();
    }
    
    return this;
  },
  
  // Create sidebar DOM element
  createSidebar() {
    // Check if sidebar already exists
    let sidebar = document.getElementById(this.config.id);
    
    if (!sidebar) {
      // Create the sidebar element
      sidebar = document.createElement('div');
      sidebar.id = this.config.id;
      sidebar.className = 'sidebar';
      
      // Set the HTML content
      sidebar.innerHTML = this.getSidebarHTML();
      
      // Append to the document body
      document.body.appendChild(sidebar);
    }
    
    this.sidebar = sidebar;
    return sidebar;
  },
  
  // Get the HTML for the sidebar
  getSidebarHTML() {
    let controlsHTML = '';
    
    if (this.config.hasControls) {
      controlsHTML = `
        <div class="isochrone-controls">
          <div class="duration-display">
            <span>Walking time: <strong id="duration-value">${this.config.defaultDuration} minutes</strong></span>
          </div>
          <div class="slider-container">
            <span>${this.config.minDuration}m</span>
            <input type="range" id="duration-slider" min="${this.config.minDuration}" max="${this.config.maxDuration}" step="5" value="${this.config.defaultDuration}">
            <span>${this.config.maxDuration}m</span>
          </div>
        </div>
      `;
    }
    
    return `
      <div class="isochrone-branding">
        <span class="isochrone-title">${this.config.title}</span>
        <img src="${this.config.logoPath}" alt="Logo" class="isochrone-logo" />
      </div>
      <div class="isochrone-container">
        ${controlsHTML}
        <div id="isochrone-area" class="area-message"></div>
        <div id="isochrone-status" class="status-message">
          ${this.config.defaultMessage}
        </div>
      </div>
    `;
  },
  
  // Set up event listeners for slider and other controls
  setupEventListeners() {
    const slider = document.getElementById('duration-slider');
    
    if (slider) {
      slider.addEventListener('input', (event) => {
        const minutes = parseInt(event.target.value);
        document.getElementById('duration-value').textContent = `${minutes} minutes`;
        
        if (this.config.onDurationChange) {
          this.config.onDurationChange(minutes);
        }
      });
    }
  },
  
  // Update the area information in the sidebar
  updateAreaInfo(area) {
    const areaElement = document.getElementById('isochrone-area');
    if (areaElement) {
      if (typeof area !== 'undefined' && area !== null && !isNaN(area)) {
        let areaText = '';
        if (area > 10000) {
          areaText = `${Math.round(area / 10000)} ha`;
        } else {
          areaText = `${Math.round(area).toLocaleString()} m²`;
        }
        areaElement.innerHTML = `<strong>Area:</strong> ${areaText}`;
      } else {
        areaElement.innerHTML = '';
      }
    }
  },
  
  // Update the status message
  updateStatus(message) {
    const statusElement = document.getElementById('isochrone-status');
    if (statusElement) {
      statusElement.innerHTML = message;
    }
  },
  
  // Display feature selection information
  displayFeatureInfo(feature) {
    const featureName = feature.properties.name || `Feature #${feature.id}`;
    this.updateStatus(`Selected: ${featureName}`);
    
    // Calculate area if not present
    let area = feature.properties.area;
    if (
      (typeof area === 'undefined' || area === null || isNaN(area)) &&
      feature.geometry.type === 'Polygon'
    ) {
      // Use Turf.js to calculate area in square meters
      area = turf.area(feature);
    }
    
    this.updateAreaInfo(area);
  },
  
  // Display plot score results from scored data
  displayPlotScores(scoreData) {
    let html = this.getResultsHTML(scoreData);
    this.updateStatus(html);
  },
  
  // Generate HTML for the plot scores results
  getResultsHTML(scoreData) {
    if (!scoreData) return 'No score data available';
    
    const { overallScore, categoryScores, datazonesCount, minutes } = scoreData;
    
    return `
      <div class="isochrone-results">
        <div class="summary-section">
          <h2>Plot Analysis</h2>
          ${datazonesCount ? `<p><strong>${datazonesCount}</strong> datazones${minutes ? ` within ${minutes} min walk` : ''}</p>` : ''}
        </div>
        <div class="score-section">
          <h3>Plot Scores</h3>
          <div class="total-score">
            <div class="score-label">Overall Plot Score</div>
            <div class="score-bar-container">
              <div class="score-bar overall-score" style="width: ${overallScore * 100}%"></div>
              <div class="score-value">${(overallScore * 100).toFixed(1)}%</div>
            </div>
          </div>
          
          <div class="category-scores-header">Category Scores:</div>
          <div class="category-scores">
            ${this.getCategoryScoresHTML(categoryScores)}
          </div>
        </div>
        
        <div class="metrics-section">
          <details>
            <summary>View Detailed Metrics</summary>
            <div class="metrics-content">
              ${this.getCategoryDetailsHTML(categoryScores)}
            </div>
          </details>
        </div>
      </div>
    `;
  },
  
  // Generate HTML for category scores
  getCategoryScoresHTML(categoryScores) {
    if (!categoryScores) return '';
    
    let html = '';
    
    Object.keys(categoryScores).forEach(key => {
      const category = categoryScores[key];
      if (category && category.count > 0) {
        const categoryName = key.replace(/_/g, ' ');
        const scorePercentage = (category.score * 100).toFixed(1);
        
        let colorClass = 'medium-score';
        if (category.score >= 0.7) colorClass = 'high-score';
        if (category.score < 0.4) colorClass = 'low-score';
        
        html += `
          <div class="category-score">
            <div class="score-label">${categoryName}</div>
            <div class="score-bar-container">
              <div class="score-bar ${colorClass}" style="width: ${scorePercentage}%"></div>
              <div class="score-value">${scorePercentage}%</div>
            </div>
          </div>
        `;
      }
    });
    
    return html;
  },
  
  // Generate HTML for category details
  getCategoryDetailsHTML(categoryScores) {
    if (!categoryScores) return '';
    
    let html = '';
    
    Object.keys(categoryScores).forEach(key => {
      const category = categoryScores[key];
      if (category && category.metrics && category.metrics.length > 0) {
        const categoryName = key.replace(/_/g, ' ');
        
        html += `
          <details class="category-details">
            <summary>${categoryName}</summary>
            <div class="metrics-list">
        `;
        
        category.metrics.forEach(metric => {
          let valueDisplay = '';
          
          if (metric.rawValue !== undefined) {
            // Format the raw value based on metric type
            if (metric.name.includes('PRICE') || metric.name.includes('EARNINGS')) {
              valueDisplay = '£' + Math.round(metric.rawValue).toLocaleString();
            } else if (metric.name.includes('PERCENTAGE') || metric.name.includes('RATE')) {
              valueDisplay = `${metric.rawValue.toFixed(1)}%`;
            } else if (metric.name.includes('COUNT') || metric.name.includes('POPULATION')) {
              valueDisplay = Math.round(metric.rawValue).toLocaleString();
            } else {
              valueDisplay = metric.rawValue.toFixed(1);
            }
          }
          
          html += `<div><strong>${metric.name}:</strong> ${valueDisplay} ${metric.isNegative ? '(Negative Impact)' : ''}</div>`;
        });
        
        html += `
            </div>
          </details>
        `;
      }
    });
    
    return html;
  }
};

export default SidebarModule;