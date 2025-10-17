/**
 * LoadingScreen.tsx - Game Loading Screen Component
 *
 * Displays loading progress while world initializes and assets load.
 */

import React, { useEffect, useState } from "react";

import { World } from "@hyperscape/shared";
import { EventType } from "@hyperscape/shared";

export function LoadingScreen({
  world,
  message,
}: {
  world: World;
  message?: string;
}) {
  const [progress, setProgress] = useState(3); // Start at 3% to show immediate feedback
  const [loadingStage, setLoadingStage] = useState(
    message || "Initializing...",
  );
  const { title, desc, image } = world.settings;

  useEffect(() => {
    let systemsComplete = false;
    let lastProgress = 3; // Match initial state

    const handleProgress = (data: unknown) => {
      const progressData = data as {
        progress: number;
        stage?: string;
        total?: number;
      };

      // Detect if this is system initialization (has stage) or asset loading (no stage, has total)
      if (progressData.stage) {
        // System initialization: takes 0-30% of total progress
        const systemProgress = Math.min(30, (progressData.progress / 100) * 30);

        // Only update if this doesn't go backwards
        if (systemProgress >= lastProgress) {
          lastProgress = systemProgress;
          setProgress(systemProgress);
          setLoadingStage(progressData.stage);
        }

        // Mark systems as complete when we hit 100%
        if (progressData.progress === 100) {
          systemsComplete = true;
        }
      } else if (progressData.total !== undefined) {
        // Asset loading: takes 30-100% of total progress
        const assetProgress = 30 + (progressData.progress / 100) * 70;

        // Only update if this doesn't go backwards
        if (assetProgress >= lastProgress) {
          lastProgress = assetProgress;
          setProgress(assetProgress);

          if (progressData.progress < 100) {
            setLoadingStage(
              `Loading assets... (${Math.floor(progressData.progress)}%)`,
            );
          } else {
            setLoadingStage("Finalizing...");
          }
        }
      } else {
        // Simple progress update - only if it doesn't go backwards
        const newProgress = progressData.progress;
        if (newProgress >= lastProgress) {
          lastProgress = newProgress;
          setProgress(newProgress);
        }
      }
    };

    world.on(EventType.ASSETS_LOADING_PROGRESS, handleProgress);
    return () => {
      world.off(EventType.ASSETS_LOADING_PROGRESS, handleProgress);
    };
  }, []);

  return (
    <div className="loading-screen absolute inset-0 bg-black flex pointer-events-auto">
      <style>{`
        @keyframes slowZoom {
          0% {
            transform: scale(1);
            filter: blur(0px);
          }
          85% {
            transform: scale(1.18);
            filter: blur(3px);
          }
          100% {
            transform: scale(1.25);
            filter: blur(4px);
          }
        }
        .loading-image {
          position: absolute;
          inset: 0;
          background-position: center;
          background-size: cover;
          background-repeat: no-repeat;
          background-image: url('/assets/images/loading_background.png');
          animation: slowZoom 40s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
        }
        .loading-shade {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(2px);
        }
        .loading-logo-container {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 30px;
          margin-top: -80px;
        }
        .loading-logo {
          width: 400px;
          height: auto;
          filter: drop-shadow(0 0 20px rgba(242, 208, 138, 0.6)) drop-shadow(0 0 40px rgba(242, 208, 138, 0.4));
          animation: logoGlow 3s ease-in-out infinite;
        }
        @keyframes logoGlow {
          0%, 100% {
            filter: drop-shadow(0 0 20px rgba(242, 208, 138, 0.6)) drop-shadow(0 0 40px rgba(242, 208, 138, 0.4));
          }
          50% {
            filter: drop-shadow(0 0 30px rgba(242, 208, 138, 0.8)) drop-shadow(0 0 60px rgba(242, 208, 138, 0.6));
          }
        }
        .loading-center-progress {
          width: 500px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        @media (max-width: 768px) {
          .loading-logo {
            width: 280px;
          }
          .loading-center-progress {
            width: 320px;
          }
          .loading-logo-container {
            margin-top: -100px;
            gap: 20px;
          }
        }
        .loading-info {
          position: absolute;
          bottom: 50px;
          left: 50px;
          right: 50px;
          max-width: 28rem;
        }
        .loading-title {
          font-size: 2.4rem;
          line-height: 1.2;
          font-weight: 600;
          margin: 0 0 0.5rem;
        }
        .loading-desc {
          color: rgba(255, 255, 255, 0.9);
          font-size: 1rem;
          margin: 0 0 20px;
        }
        .loading-stage {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.875rem;
          margin: 0;
          font-weight: 500;
          text-align: center;
          width: 100%;
        }
        .loading-progress-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          width: 100%;
        }
        .loading-percentage {
          color: rgba(255, 255, 255, 0.9);
          font-size: 0.875rem;
          font-weight: 600;
          text-align: center;
        }
        .loading-track {
          height: 100px;
          position: relative;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }
        .loading-bar-container {
          position: relative;
          width: calc(100% - 140px);
          height: 10px;
          margin: 0 70px;
        }
        .loading-bar {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          width: ${Math.max(progress, 0)}%;
          min-width: ${progress > 0 ? "10px" : "0"};
          background: linear-gradient(90deg, #f2d08a, #ffd700, #f2d08a);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 5px;
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 0 15px rgba(242, 208, 138, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.3);
        }
        .loading-bar::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 50%;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0.4), transparent);
          border-radius: 4px 4px 0 0;
        }
        .loading-bar-frame {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: auto;
          height: 100px;
          background-image: url('/assets/images/loading_bar.png');
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          pointer-events: none;
          z-index: 1;
          min-width: calc(100% + 160px);
        }
        @media (max-width: 768px) {
          .loading-info {
            bottom: 30px;
            left: 30px;
            right: 30px;
            max-width: 100%;
          }
          .loading-title {
            font-size: 2rem;
          }
          .loading-desc {
            font-size: 0.9rem;
          }
          .loading-stage {
            font-size: 0.8rem;
          }
          .loading-percentage {
            font-size: 0.8rem;
            min-width: 40px;
          }
          .loading-track {
            padding: 0;
          }
          .loading-bar-container {
            width: calc(100% - 45px);
            margin: 0 20px 0 25px;
            height: 8px;
          }
          .loading-bar {
            min-width: ${progress > 0 ? "8px" : "0"};
            border-radius: 4px;
          }
          .loading-bar-frame {
            min-width: calc(100% + 100px);
          }
        }
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
      <div className="loading-image" />
      <div className="loading-shade" />

      {/* Logo and Loading Bar */}
      <div className="loading-logo-container">
        <img
          src="/assets/images/logo.png"
          alt="Hyperscape"
          className="loading-logo"
        />

        {/* Loading Progress */}
        <div className="loading-center-progress">
          <div className="loading-stage">{loadingStage}</div>
          <div className="loading-progress-container">
            <div className="loading-track">
              <div className="loading-bar-container">
                <div className="loading-bar" />
              </div>
              <div className="loading-bar-frame" />
            </div>
            <div className="loading-percentage">{Math.floor(progress)}%</div>
          </div>
        </div>
      </div>

      {/* Removed duplicate loading bar - now centered under logo */}
    </div>
  );
}
