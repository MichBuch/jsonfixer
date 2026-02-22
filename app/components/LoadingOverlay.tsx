import React from 'react';

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  onCancel?: () => void;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isLoading, message = "Loading...", onCancel }) => {
  if (!isLoading) return null;

  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="hourglass"></div>
        <div className="loading-text">{message}</div>
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              background: 'rgba(255, 0, 0, 0.2)',
              border: '1px solid #ff4444',
              color: '#ff4444',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              fontWeight: 'bold',
              letterSpacing: '1px'
            }}
          >
            Cancel
          </button>
        )}
      </div>
      <style jsx>{`
        .loading-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.7);
          z-index: 9999;
          display: flex;
          justify-content: center;
          align-items: center;
          backdrop-filter: blur(2px);
        }

        .loading-content {
          background: #0f172a;
          padding: 2rem;
          border-radius: 12px;
          border: 1px solid #00ffff;
          text-align: center;
          box-shadow: 0 0 20px rgba(0, 255, 255, 0.2);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .loading-text {
          color: #00ffff;
          font-family: monospace;
          font-size: 1.2rem;
          font-weight: bold;
        }

        /* Hourglass Animation */
        .hourglass {
          display: inline-block;
          position: relative;
          width: 64px;
          height: 64px;
        }
        .hourglass:after {
          content: " ";
          display: block;
          border-radius: 50%;
          width: 0;
          height: 0;
          margin: 6px;
          box-sizing: border-box;
          border: 26px solid #00ffff;
          border-color: #00ffff transparent #00ffff transparent;
          animation: hourglass 1.2s infinite;
        }
        @keyframes hourglass {
          0% {
            transform: rotate(0);
            animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19);
          }
          50% {
            transform: rotate(900deg);
            animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
          }
          100% {
            transform: rotate(1800deg);
          }
        }
      `}</style>
    </div>
  );
};

export default LoadingOverlay;
