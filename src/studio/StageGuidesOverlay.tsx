import React from 'react';
import './stage-guides.css';

export interface StageGuidesOverlayProps {
  showSafeArea?: boolean;
  showRuleOfThirds?: boolean;
  showOriginCrosshair?: boolean;
}

export const StageGuidesOverlay: React.FC<StageGuidesOverlayProps> = ({
  showSafeArea = false,
  showRuleOfThirds = false,
  showOriginCrosshair = false,
}) => {
  if (!showSafeArea && !showRuleOfThirds && !showOriginCrosshair) {
    return null;
  }

  return (
    <div className="stage-guides-overlay" aria-hidden="true" data-testid="stage-guides-overlay">
      <svg className="stage-guides-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Rule of Thirds (3x3 grid) */}
        {showRuleOfThirds && (
          <g className="guide-rule-of-thirds" data-testid="guide-rule-of-thirds">
            <line x1="33.333" y1="0" x2="33.333" y2="100" />
            <line x1="66.667" y1="0" x2="66.667" y2="100" />
            <line x1="0" y1="33.333" x2="100" y2="33.333" />
            <line x1="0" y1="66.667" x2="100" y2="66.667" />
            
            {/* Focal intersection markers */}
            <circle cx="33.333" cy="33.333" r="0.8" className="guide-focal-point" />
            <circle cx="66.667" cy="33.333" r="0.8" className="guide-focal-point" />
            <circle cx="33.333" cy="66.667" r="0.8" className="guide-focal-point" />
            <circle cx="66.667" cy="66.667" r="0.8" className="guide-focal-point" />
          </g>
        )}

        {/* Safe Area Guides (Action Safe 90%, Title Safe 80%) */}
        {showSafeArea && (
          <g className="guide-safe-area" data-testid="guide-safe-area">
            {/* 90% Action Safe */}
            <rect x="5" y="5" width="90" height="90" rx="0.5" className="guide-action-safe" />
            {/* 80% Title Safe */}
            <rect x="10" y="10" width="80" height="80" rx="0.5" className="guide-title-safe" />
            
            <text x="5.5" y="7.5" className="guide-label">Action Safe 90%</text>
            <text x="10.5" y="12.5" className="guide-label">Title Safe 80%</text>
          </g>
        )}

        {/* Origin Center Crosshair */}
        {showOriginCrosshair && (
          <g className="guide-origin" data-testid="guide-origin">
            <line x1="50" y1="0" x2="50" y2="100" className="guide-axis guide-axis-y" />
            <line x1="0" y1="50" x2="100" y2="50" className="guide-axis guide-axis-x" />
            <circle cx="50" cy="50" r="1.2" className="guide-origin-dot" />
            <circle cx="50" cy="50" r="4.0" className="guide-origin-ring" />
            <text x="51.5" y="48.5" className="guide-origin-text">(0, 0) 原点</text>
          </g>
        )}
      </svg>
    </div>
  );
};
